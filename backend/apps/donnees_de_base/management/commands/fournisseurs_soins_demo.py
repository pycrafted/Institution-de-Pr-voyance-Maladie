"""
Réduit les fournisseurs de soins à un **petit jeu de démonstration** lisible.

Les vrais prestataires (411) ont déjà été anonymisés ; mais 411 fiches, c'est
une volumétrie de production, pas une vitrine. Pour présenter le système on ne
garde qu'une poignée de fournisseurs fictifs, un par grande spécialité - assez
pour comprendre le cycle (pharmacie, clinique, labo, optique, hôpital...) sans
noyer la liste. Même esprit que le petit échantillon de participants.

On ne touche **que les données**, jamais la structure : on supprime les lignes
en trop et on renomme celles qu'on garde. On ne casse rien : les fournisseurs
encore cités par un document (bon, lettre, facture) ou une demande d'agrément
sont **toujours conservés**, de même que le prestataire fourre-tout
« FOURNISSEURS DIVERS SOINS ». La vraie base reste dans ``lamps_analyse``.

    python manage.py fournisseurs_soins_demo
    python manage.py fournisseurs_soins_demo --seed 42   # reproductible
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation
from donnees_de_base.models import DemandeAgrement, FournisseurDeSoins
from traitements.models import Facture

# Fiches fourre-tout / techniques à garder telles quelles (jamais renommées,
# jamais supprimées).
NOMS_SENTINELLES = {'FOURNISSEURS DIVERS SOINS'}

# Le jeu de démo : une fiche par grande spécialité, nommée « type + quartier »
# comme l'anonymisation. (code spécialité, libellé fictif, quartier).
DEMO = [
    ('06', 'PHARMACIE PLATEAU', 'PLATEAU'),
    ('06', 'PHARMACIE MERMOZ', 'MERMOZ'),
    ('05', 'CABINET DENTAIRE FANN', 'FANN'),
    ('08', 'CLINIQUE POINT E', 'POINT E'),
    ('00', 'CABINET MEDICAL SACRE-COEUR', 'SACRE-COEUR'),
    ('07', 'CABINET GYNECOLOGIE ALMADIES', 'ALMADIES'),
    ('09', 'CABINET PEDIATRIE OUAKAM', 'OUAKAM'),
    ('04', 'OPTIQUE MEDINA', 'MEDINA'),
    ('13', 'CABINET OPHTALMOLOGIE YOFF', 'YOFF'),
    ('01', 'LABORATOIRE LIBERTE 6', 'LIBERTE 6'),
    ('03', 'HOPITAL PIKINE', 'PIKINE'),
    ('02', "CENTRE D'IMAGERIE GRAND DAKAR", 'GRAND DAKAR'),
    ('15', 'CABINET ORL DIEUPPEUL', 'DIEUPPEUL'),
]

PRENOMS_M = ['Mamadou', 'Ibrahima', 'Ousmane', 'Cheikh', 'Moussa', 'Alioune', 'Babacar']
PRENOMS_F = ['Awa', 'Fatou', 'Aminata', 'Ndeye', 'Khady', 'Aissatou', 'Coumba']
NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Diallo', 'Gueye', 'Sarr', 'Faye', 'Niang']
BANQUES = ['CBAO', 'SGBS', 'BICIS', 'ECOBANK', 'BOA SENEGAL', 'BHS', 'ORABANK']


class Command(BaseCommand):
    help = "Réduit les fournisseurs de soins à un petit jeu de démonstration."

    def add_arguments(self, parser):
        parser.add_argument('--seed', type=int, default=None)

    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])

        def tel_fixe():
            return f'33 8{random.randint(0, 99):02d} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'

        def tel_mobile():
            return (
                f'{random.choice(["70", "75", "76", "77", "78"])} '
                f'{random.randint(100, 999)} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'
            )

        def slug(nom):
            return ''.join(c for c in nom.lower() if c.isalnum())

        def habiller(f, libelle, lieu):
            """Renomme et réhabille une fiche (données uniquement)."""
            f.libelle = libelle
            f.adresse = f'{lieu}, DAKAR'
            f.telephone = tel_fixe()
            f.mobile = tel_mobile()
            f.email = f'contact@{slug(libelle)[:24]}.sn'
            f.region = 'Dakar'
            f.pays = 'Sénégal'
            masculin = random.random() < 0.5
            f.contact_prenoms = random.choice(PRENOMS_M if masculin else PRENOMS_F)
            f.contact_nom = random.choice(NOMS)
            f.contact_fonction = random.choice(['Gérant', 'Directeur', 'Responsable', 'Comptable'])
            f.contact_telephone = tel_fixe()
            f.contact_mobile = tel_mobile()
            f.banque_nom = random.choice(BANQUES)
            f.save()

        with transaction.atomic():
            # 1. Fiches à ne jamais toucher : sentinelles + celles encore citées
            #    par un document, une facture ou une demande d'agrément.
            garde = set(
                FournisseurDeSoins.objects.filter(libelle__in=NOMS_SENTINELLES).values_list(
                    'id', flat=True
                )
            )
            protege = self._references()
            garde |= protege

            # 2. Pour chaque ligne du jeu de démo, reprendre une fiche existante
            #    de la spécialité (en priorité une fiche déjà protégée, pour que
            #    les documents continuent de pointer dessus), la renommer.
            deja = set()
            for code_spe, libelle, lieu in DEMO:
                fiche = self._choisir(code_spe, protege, deja) or self._choisir(
                    code_spe, None, deja
                )
                if fiche is None:
                    self.stdout.write(
                        self.style.WARNING(f'Aucune fiche pour la spécialité {code_spe} ({libelle}).')
                    )
                    continue
                deja.add(fiche.id)
                garde.add(fiche.id)
                habiller(fiche, libelle, lieu)

            # 3. Supprimer tout le reste (données uniquement).
            reste = FournisseurDeSoins.objects.exclude(id__in=garde)
            nb_supprimes = reste.count()
            reste.delete()

        total = FournisseurDeSoins.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f'Jeu de démonstration : {total} fournisseurs de soins conservés '
                f'({nb_supprimes} fiches en trop supprimées).'
            )
        )

    @staticmethod
    def _references():
        """Ids des fournisseurs encore cités quelque part (à ne pas supprimer)."""
        ids = set()
        for valeurs in (
            BonPharmacie.objects.values_list('pharmacie_id', 'prescripteur_id'),
            LettreGarantie.objects.values_list('prestataire_id', 'prescripteur_id'),
            LettreHospitalisation.objects.values_list('prestataire_id', 'prescripteur_id'),
            BonOptique.objects.values_list('fournisseur_id', 'prescripteur_id'),
        ):
            for paire in valeurs:
                ids.update(x for x in paire if x)
        ids.update(x for x in Facture.objects.values_list('fournisseur_soins_id', flat=True) if x)
        ids.update(
            x for x in DemandeAgrement.objects.values_list('fournisseur_id', flat=True) if x
        )
        return ids

    @staticmethod
    def _choisir(code_spe, dans, deja):
        """Une fiche de la spécialité donnée, non encore reprise."""
        requete = FournisseurDeSoins.objects.filter(specialite__code=code_spe).exclude(
            id__in=deja
        )
        if dans is not None:
            requete = requete.filter(id__in=dans)
        return requete.order_by('code').first()
