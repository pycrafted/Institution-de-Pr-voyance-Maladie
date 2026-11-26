# -*- coding: utf-8 -*-
"""
Remet la base dans l'état EXACT de LAMPS : on vide, puis on reprend le réel.

Demande de l'IPM du 2026-11-26 : plus aucune donnée inventée dans la base de
test, « exactement les vraies » - celles du dump le plus récent
(``db_sar_vers_14.dump``, pris le 2026-11-17 et restauré sous
``lamps_analyse``).

    DB_NAME=vrai_base python manage.py reprendre_lamps --vider

Ce que la commande fait, dans cet ordre - l'ordre compte, chaque étape a
besoin de la précédente :

  1. **Vide** le mouvement et les personnes (``--vider``). Les référentiels
     ne sont pas vidés : leurs importeurs les mettent à jour en place et
     retirent eux-mêmes ce qui a disparu du réel, en épargnant ce qu'une
     fiche cite encore.
  2. **Référentiels** : organigramme, plan comptable, médicaments, actes,
     articles d'achat, prestataires, adhérents, barème.
  3. **Personnes** : participants et ayants droit.
  4. **Mouvement** : documents, factures, liquidations, grand livre.

  5. **Cotisations, retenues, bons d'achats** : les trois modules que la
     reprise d'octobre laissait vides.

Ce qu'elle ne reprend pas, et pourquoi : les ORDRES DE PAIEMENT n'ont rien à
reprendre - la table de LAMPS (``table_cheques``) est vide. Les journaux
comptables et les fournisseurs divers, eux, sont déjà les vrais : ils ont été
vérifiés ligne à ligne contre ``journaux`` et les comptes ``401xxx`` du plan
comptable le 2026-11-26.

Rien n'est touché du côté des COMPTES de l'application (agents, jetons) ni
des informations de l'IPM : ce ne sont pas des données de LAMPS.
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent  # noqa: F401  (récapitulatif)
from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation
from donnees_de_base.lamps import REGLAGES
from donnees_de_base.models import DemandeAgrement
from participants.models import Beneficiaire, CleAcces, DemandePhoto, Participant
from traitements.models import (
    AppelCotisation,
    BonAchat,
    CampagneRetenue,
    EcritureCompta,
    Facture,
    LigneBonAchat,
    LigneCotisation,
    LigneRetenue,
    LiquidationBon,
    OrdrePaiement,
)

# Du plus dépendant au moins dépendant : une table n'est vidée qu'une fois que
# plus rien ne la cite, sans quoi les clés étrangères protégées refusent.
A_VIDER = (
    ('Liquidations', LiquidationBon),
    ('Écritures comptables', EcritureCompta),
    ('Lignes de bon d’achat', LigneBonAchat),
    ('Bons d’achats', BonAchat),
    ('Lignes de retenue', LigneRetenue),
    ('Campagnes de retenue', CampagneRetenue),
    ('Lignes de cotisation', LigneCotisation),
    ('Appels de cotisation', AppelCotisation),
    ('Ordres de paiement', OrdrePaiement),
    ('Bons de pharmacie', BonPharmacie),
    ('Lettres de garantie', LettreGarantie),
    ('LG hospitalisation', LettreHospitalisation),
    ('Bons optique', BonOptique),
    ('Factures', Facture),
    ('Demandes de photo', DemandePhoto),
    ('Clés d’accès mobile', CleAcces),
    ('Ayants droit', Beneficiaire),
    ('Participants', Participant),
    ('Demandes d’agrément', DemandeAgrement),
    # Les ADHÉRENTS ne sont pas vidés : le barème s'y accroche
    # (`TauxPriseEnCharge.adherent`, en PROTECT), et les vider demanderait de
    # vider le barème avec eux. `importer_adherents` les met à jour en place,
    # ce qui suffit - ils viennent déjà du réel.
)

# (commande, options) - l'ordre est celui des dépendances.
REFERENTIELS = (
    ('importer_structures', {}),
    ('importer_plan_comptable', {}),
    ('importer_medicaments', {}),
    ('importer_actes', {}),
    ('importer_articles_achat', {}),
    ('importer_fournisseurs_soins', {'purge': True}),
    ('importer_adherents', {}),
    ('importer_taux', {}),
    ('importer_informations_ipm', {}),
)

# Celles qui lisent `lamps_analyse` et attendent donc les options de connexion
# (cf. donnees_de_base/lamps.py). Les trois autres lisent un fichier.
LIT_LAMPS = {
    'importer_structures',
    'importer_plan_comptable',
    'importer_medicaments',
    # `importer_actes` n'en est pas : il porte la nomenclature relevée dans
    # LAMPS en dur, et ne se connecte à rien.
    'importer_articles_achat',
    'importer_informations_ipm',
}


class Command(BaseCommand):
    help = "Vide la base et y reprend EXACTEMENT les données réelles de LAMPS."

    def add_arguments(self, parser):
        parser.add_argument(
            '--vider',
            action='store_true',
            help='Vide le mouvement et les personnes avant de reprendre (recommandé).',
        )
        parser.add_argument(
            '--sans-mouvement',
            action='store_true',
            help='S’arrête après les personnes : ni documents, ni factures, ni écritures.',
        )
        # La base d'analyse vit sur le MÊME cluster que la nôtre, avec le même
        # utilisateur : son mot de passe est celui de l'application, et on
        # évite ainsi de le retaper (ou de l'écrire dans un script).
        parser.add_argument('--base', default=REGLAGES['base'])
        parser.add_argument('--hote', default=REGLAGES['hote'])
        parser.add_argument('--port', default=REGLAGES['port'])
        parser.add_argument('--utilisateur', default=REGLAGES['utilisateur'])
        parser.add_argument(
            '--motdepasse',
            default=settings.DATABASES['default'].get('PASSWORD', ''),
            help='Par défaut, celui de la base de l’application (même cluster).',
        )

    def connexion(self, options):
        return {cle: options[cle] for cle in ('base', 'hote', 'port', 'utilisateur', 'motdepasse')}

    def titre(self, texte):
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(texte))

    def handle(self, *args, **options):
        lamps = self.connexion(options)
        if options['vider']:
            self.titre('1. On vide')
            self.vider()

        self.titre('2. Référentiels')
        for commande, extra in REFERENTIELS:
            # Pas de flèche « → » ni d'autre caractère hors cp1252 : la console
            # Windows du serveur écrit en cp1252 et s'interrompt dessus.
            self.stdout.write('   - %s' % commande)
            if commande in LIT_LAMPS:
                extra = dict(extra, **lamps)
            call_command(commande, verbosity=0, **extra)

        self.titre('3. Participants et ayants droit')
        call_command('importer_participants', verbosity=1, **lamps)

        if options['sans_mouvement']:
            self.stdout.write(self.style.WARNING('\nMouvement laissé de côté (--sans-mouvement).'))
            return

        self.titre('4. Documents, factures, liquidations, grand livre')
        call_command('importer_historique_soins', purger=True, verbosity=1, **lamps)

        self.titre('5. Cotisations, retenues, bons d’achats')
        for commande in ('importer_cotisations', 'importer_retenues', 'importer_bons_achats'):
            self.stdout.write('   - %s' % commande)
            call_command(commande, purger=True, verbosity=1, **lamps)

        self.titre('Fait. Ce que la base contient maintenant :')
        self.recapituler()

    @transaction.atomic
    def vider(self):
        for libelle, modele in A_VIDER:
            n = modele.objects.count()
            if n:
                modele.objects.all().delete()
                self.stdout.write(f'   {libelle:28} {n:8,} supprimés'.replace(',', ' '))

    def recapituler(self):
        from donnees_de_base.models import (
            Acte,
            CompteComptable,
            FournisseurDeSoins,
            Medicament,
            StructureEntite,
        )

        lignes = (
            ('Structures', StructureEntite),
            ('Comptes comptables', CompteComptable),
            ('Médicaments', Medicament),
            ('Actes', Acte),
            ('Prestataires de soins', FournisseurDeSoins),
            ('Adhérents', Adherent),
            ('Participants', Participant),
            ('Ayants droit', Beneficiaire),
            ('Bons de pharmacie', BonPharmacie),
            ('Lettres de garantie', LettreGarantie),
            ('LG hospitalisation', LettreHospitalisation),
            ('Bons optique', BonOptique),
            ('Factures', Facture),
            ('Liquidations', LiquidationBon),
            ('Écritures comptables', EcritureCompta),
            ('Appels de cotisation', AppelCotisation),
            ('Lignes de cotisation', LigneCotisation),
            ('Campagnes de retenue', CampagneRetenue),
            ('Lignes de retenue', LigneRetenue),
            ('Bons d’achats', BonAchat),
        )
        for libelle, modele in lignes:
            self.stdout.write(f'   {libelle:24} {modele.objects.count():9,}'.replace(',', ' '))
