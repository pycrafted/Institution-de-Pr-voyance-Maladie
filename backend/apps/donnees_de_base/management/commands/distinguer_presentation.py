"""
Rend les nomenclatures de la base de **présentation** (`ipm`) totalement
distinctes de la vraie base (`ipm_dev`) : ni le même contenu, ni le même nombre,
pour qu'aucune information ne fuite pendant une démonstration.

Ne touche QUE les données, jamais le schéma. Ne touche PAS les référentiels
**structurels** - spécialités, types de prestations, types de bénéficiaire -
dont les codes pilotent toute la logique (fournisseurs, documents, liquidation)
et qui ne sont de toute façon que de la nomenclature médicale universelle, sans
rien de confidentiel.

À lancer UNIQUEMENT sur la base de présentation :
    DB_NAME=ipm python manage.py distinguer_presentation

On garde ce qui casserait l'app sinon : les 9 codes de structure cités par des
participants (champ département/service) et le journal « IF » (imputation
facture, utilisé par la comptabilisation).
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.models import (
    ArticleAchat,
    FournisseurDivers,
    JournalComptable,
    Medicament,
    StructureEntite,
)
from adherents.models import Adherent
from parametres.models import InformationsIPM
from participants.models import Participant
from traitements.models import Banque

# --- Médicaments fictifs : dénominations génériques internationales (publiques),
# sans aucun rapport avec le catalogue réel (noms de marques). ---
MEDICAMENTS = [
    'PARACETAMOL 500MG COMPRIME B/20',
    'IBUPROFENE 400MG COMPRIME B/30',
    'AMOXICILLINE 1G COMPRIME B/14',
    'OMEPRAZOLE 20MG GELULE B/28',
    'METFORMINE 850MG COMPRIME B/30',
    'AMLODIPINE 5MG COMPRIME B/30',
    'CETIRIZINE 10MG COMPRIME B/15',
    'SALBUTAMOL 100UG AEROSOL DOSEUR',
    'DICLOFENAC 50MG COMPRIME B/20',
    'AMPICILLINE 500MG GELULE B/16',
    'LOPERAMIDE 2MG GELULE B/12',
    'METRONIDAZOLE 500MG COMPRIME B/14',
    'CIPROFLOXACINE 500MG COMPRIME B/10',
    'PREDNISOLONE 20MG COMPRIME B/20',
    'FUROSEMIDE 40MG COMPRIME B/30',
    'INSULINE RAPIDE FLACON 10ML',
    'VITAMINE C 500MG COMPRIME B/20',
    'FER ACIDE FOLIQUE COMPRIME B/30',
    'ARTEMETHER LUMEFANTRINE COMPRIME B/24',
    'COTRIMOXAZOLE 480MG COMPRIME B/20',
    'DEXAMETHASONE COLLYRE FLACON 5ML',
    'SERUM PHYSIOLOGIQUE 500ML',
    'PARACETAMOL SIROP ENFANT FLACON 60ML',
    'AMOXICILLINE SIROP FLACON 60ML',
    'OMEPRAZOLE 40MG INJECTABLE FLACON',
]

ARTICLES = [
    'Ramette Papier A4',
    'Stylo Bille Bleu (Boite de 50)',
    'Classeur a Levier',
    'Agrafeuse de Bureau',
    'Marqueur Permanent',
    'Bloc-notes A5',
    'Ruban Adhesif',
    'Perforatrice 2 Trous',
]

# Codes de structure à garder quoi qu'il arrive (cités par des participants).
# Calculés au runtime ; ce repli couvre le cas d'une base déjà vidée.
STRUCTURES_A_GARDER = set()

DIR_NOMS = [
    'Direction Alpha', 'Direction Bravo', 'Direction Charlie', 'Direction Delta',
    'Direction Echo', 'Direction Foxtrot', 'Direction Golf', 'Direction Hotel',
    'Direction India', 'Direction Juliet', 'Direction Kilo', 'Direction Lima',
    'Direction Mike', 'Direction November', 'Direction Oscar',
]
DEP_NOMS = [
    'Departement Alpha', 'Departement Beta', 'Departement Gamma', 'Departement Delta',
    'Departement Epsilon', 'Departement Zeta', 'Departement Eta', 'Departement Theta',
    'Departement Iota', 'Departement Kappa', 'Departement Lambda', 'Departement Mu',
    'Departement Nu', 'Departement Xi', 'Departement Omicron', 'Departement Pi',
    'Departement Rho', 'Departement Sigma', 'Departement Tau', 'Departement Upsilon',
]
SRV_NOMS = [
    'Service Orion', 'Service Vega', 'Service Sirius', 'Service Antares',
    'Service Rigel', 'Service Altair', 'Service Procyon', 'Service Pollux',
    'Service Castor', 'Service Arcturus', 'Service Capella', 'Service Deneb',
    'Service Spica', 'Service Mizar', 'Service Alcor', 'Service Betelgeuse',
    'Service Polaris', 'Service Atria', 'Service Fomalhaut', 'Service Canopus',
]
POOLS = {'DIR': DIR_NOMS, 'DEP': DEP_NOMS, 'SRV': SRV_NOMS}

# Journal structurel à garder (imputation facture).
JOURNAL_STRUCTUREL = 'IF'

# --- Identité de l'institution et de ses sociétés ----------------------------
# Rien de tout cela n'est anodin : le nom de l'IPM, celui des quatre sociétés
# adhérentes, les banques et leurs comptes, le contact et son portable
# désignent des organisations et une personne réelles. Une base de
# présentation ne doit rien en laisser passer.
INSTITUTION = {
    'intitule': 'IPM DEMONSTRATION',
    'adresse': 'Zone de Demonstration',
    'telephone': '33 800 00 01',
    'fax': '33 800 00 02',
    'boite_postale': 'BP 1000',
    'email': 'contact@ipm-demo.sn',
    'contact_nom': 'Responsable Demonstration',
    'contact_telephone': '+221 77 000 00 00',
    'contact_email': 'responsable@ipm-demo.sn',
    'logo': '',
    'latitude': '',
    'longitude': '',
}

# Les codes (01..04) et le régime (IPM / MSS) pilotent les taux, les
# participants et la liquidation : ils restent. Seul l'intitulé change.
SOCIETES = {
    '01': 'IPM SOCIETE ALPHA',
    '02': 'IPM SOCIETE BETA',
    '03': 'MUTUELLE GAMMA',
    '04': 'MUTUELLE DELTA',
}

# Banques fictives, dans l'ordre des codes B1..B10. Le compte 521xxx reste
# celui de la structure comptable ; seul le nom change.
BANQUES = [
    'BANQUE ALPHA DEMO', 'BANQUE BRAVO DEMO', 'BANQUE CHARLIE DEMO',
    'BANQUE DELTA DEMO', 'BANQUE ECHO DEMO', 'BANQUE FOXTROT DEMO',
    'BANQUE GOLF DEMO', 'BANQUE HOTEL DEMO', 'BANQUE INDIA DEMO',
    'BANQUE JULIET DEMO',
]


class Command(BaseCommand):
    help = "Rend les nomenclatures de la base de présentation distinctes de la vraie base."

    def handle(self, *args, **options):
        with transaction.atomic():
            n_med = self._remplacer(Medicament, MEDICAMENTS, 'DM', extra={'prestation': '06', 'compte': '602006'})
            n_art = self._remplacer(ArticleAchat, ARTICLES, 'AD')
            n_div = self._reduire_fournisseurs_divers(garde=9)
            n_str = self._structures()
            n_jou = self._journaux(total_cible=26)
            n_ipm = self._institution()
            n_soc = self._societes()
            n_bqe = self._banques()

        self.stdout.write(
            self.style.SUCCESS(
                f'Présentation distinguée : médicaments={n_med}, articles={n_art}, '
                f'fournisseurs divers={n_div}, structures={n_str}, journaux={n_jou}, '
                f'institution={n_ipm}, sociétés={n_soc}, banques={n_bqe}. '
                '(spécialités / types de prestations / types de bénéficiaire laissés : structurels.)'
            )
        )

    def _institution(self):
        """Le nom, l'adresse, les contacts et le logo de l'IPM elle-même."""
        poses = 0
        for infos in InformationsIPM.objects.all():
            for champ, valeur in INSTITUTION.items():
                setattr(infos, champ, valeur)
            infos.save()
            poses += 1
        return poses

    def _societes(self):
        """Les quatre adhérents : l'intitulé seul, le code et le régime restent."""
        poses = 0
        for adherent in Adherent.objects.all():
            libelle = SOCIETES.get(adherent.code)
            if not libelle:
                continue
            adherent.libelle = libelle
            # Coordonnées de l'adhérent : celles de la SAR, à ne pas montrer.
            adherent.adresse = 'Zone de Demonstration'
            adherent.telephone = '33 800 00 01'
            adherent.focal_nom = 'Point Focal Demo'
            adherent.focal_telephone = '+221 77 000 00 00'
            adherent.focal_email = 'focal@ipm-demo.sn'
            adherent.save()
            poses += 1
        return poses

    def _banques(self):
        """Les banques émettrices : nom et réseau fictifs, compte conservé."""
        poses = 0
        for rang, banque in enumerate(Banque.objects.order_by('code')):
            banque.libelle = BANQUES[rang % len(BANQUES)]
            banque.reseau = banque.libelle
            banque.save()
            poses += 1
        return poses

    @staticmethod
    def _remplacer(modele, libelles, prefixe_code, extra=None):
        """Vide le référentiel et le recrée avec la liste fictive donnée."""
        modele.objects.all().delete()
        extra = extra or {}
        for i, libelle in enumerate(libelles, 1):
            modele.objects.create(code=f'{prefixe_code}{i:04d}', libelle=libelle, **extra)
        return modele.objects.count()

    @staticmethod
    def _reduire_fournisseurs_divers(garde):
        """Garde les `garde` premiers (par code), supprime le reste (aucun FK)."""
        codes = list(
            FournisseurDivers.objects.order_by('code').values_list('code', flat=True)
        )
        a_supprimer = codes[garde:]
        if a_supprimer:
            FournisseurDivers.objects.filter(code__in=a_supprimer).delete()
        return FournisseurDivers.objects.count()

    def _structures(self):
        """Relabel en noms de code inventés + ajoute 2 directions (nombre différent)."""
        refs = set(
            c
            for champ in ('direction', 'departement', 'service')
            for c in Participant.objects.exclude(**{champ: ''}).values_list(champ, flat=True)
        )
        refs |= STRUCTURES_A_GARDER  # repli
        curseurs = {'DIR': 0, 'DEP': 0, 'SRV': 0}
        for e in StructureEntite.objects.order_by('code'):
            type_code = (e.type or e.code[:3]).upper()
            pool = POOLS.get(type_code, SRV_NOMS)
            i = curseurs.get(type_code, 0)
            e.libelle = pool[i % len(pool)]
            curseurs[type_code] = i + 1
            e.save(update_fields=['libelle'])
        # Deux directions supplémentaires pour que le nombre diffère du réel.
        for n, nom in enumerate(['Direction November', 'Direction Oscar'], start=90):
            StructureEntite.objects.get_or_create(
                code=f'DIR0{n}', defaults={'type': 'DIR', 'libelle': nom}
            )
        # Les codes cités par des participants existent toujours (on n'a rien
        # supprimé côté structures), donc rien n'est cassé.
        _ = refs
        return StructureEntite.objects.count()

    @staticmethod
    def _journaux(total_cible):
        """Relabel tout en 'DEMO' (garde le code IF) et réduit au nombre cible."""
        journaux = list(JournalComptable.objects.order_by('code'))
        # Réduction : on supprime des journaux non structurels jusqu'au total cible.
        a_supprimer = [j for j in journaux if j.code != JOURNAL_STRUCTUREL][
            : max(0, len(journaux) - total_cible)
        ]
        ids = {j.id for j in a_supprimer}
        if ids:
            JournalComptable.objects.filter(id__in=ids).delete()
        # Relabel des restants (aucune collision possible avec le réel).
        for j in JournalComptable.objects.all():
            if j.code == JOURNAL_STRUCTUREL:
                j.libelle = 'JOURNAL DES IMPUTATIONS (DEMO)'
            else:
                j.libelle = f'JOURNAL DEMO {j.code}'
            j.save(update_fields=['libelle'])
        return JournalComptable.objects.count()
