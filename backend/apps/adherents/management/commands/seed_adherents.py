"""
Peuple le référentiel des adhérents.

Reprend à l'identique les quatre collectivités que le frontend portait en dur
(cf. l'ancien générateur ``adherents()`` de services/referentiels.js) : deux
groupes IPM — personnel MOO et cadres — et les deux mutuelles CMM.

Idempotente : relancer la commande ne crée pas de doublon et ne réécrit pas une
ligne déjà modifiée en base.
"""

from django.core.management.base import BaseCommand

from adherents.models import Adherent

# Communs aux quatre lignes : ce sont des collectivités internes, pas des
# tiers, elles partagent donc le siège de la SAR.
ADRESSE = 'KM 18, ROUTE DE RUFISQUE — MBAO, DAKAR'
TELEPHONE = '33 839 61 00'

ADHERENTS = [
    {
        'code': '01',
        'type': 'IPM',
        'libelle': 'IPM SAR PERSONNEL MOO',
        'cotisation_ipm_salariale': '8500',
        'cotisation_ipm_patronale': '8500',
        'cotisation_mss': '',
        'focal_nom': 'Awa NDIAYE',
        'focal_telephone': '77 512 40 18',
        'focal_email': 'a.ndiaye@sar.sn',
        'regul_systematique': True,
        'seuil_endettement': '250000',
        'seuil_consommation': '1500000',
    },
    {
        'code': '02',
        'type': 'IPM',
        'libelle': 'IPM SAR PERSONNEL CADRES',
        'cotisation_ipm_salariale': '8500',
        'cotisation_ipm_patronale': '8500',
        'cotisation_mss': '',
        'focal_nom': 'Cheikh DIOP',
        'focal_telephone': '77 640 22 05',
        'focal_email': 'c.diop@sar.sn',
        'regul_systematique': True,
        'seuil_endettement': '400000',
        'seuil_consommation': '2500000',
    },
    {
        'code': '03',
        'type': 'CMM',
        'libelle': 'CMM CR-SAR',
        'cotisation_ipm_salariale': '',
        'cotisation_ipm_patronale': '',
        'cotisation_mss': '5000',
        'focal_nom': 'Mariama SALL',
        'focal_telephone': '76 318 74 90',
        'focal_email': 'm.sall@sar.sn',
        'regul_systematique': False,
        'seuil_endettement': '150000',
        'seuil_consommation': '900000',
    },
    {
        'code': '04',
        'type': 'CMM',
        'libelle': 'CMM NCR-SAR',
        'cotisation_ipm_salariale': '',
        'cotisation_ipm_patronale': '',
        'cotisation_mss': '5000',
        'focal_nom': 'Ibrahima FAYE',
        'focal_telephone': '78 204 11 36',
        'focal_email': 'i.faye@sar.sn',
        'regul_systematique': False,
        'seuil_endettement': '150000',
        'seuil_consommation': '900000',
    },
]


class Command(BaseCommand):
    help = 'Crée les adhérents de départ (IPM SAR, CMM).'

    def handle(self, *args, **options):
        crees = 0
        for ligne in ADHERENTS:
            # Le compte suit le code : 01 → 463001.
            valeurs = {
                **ligne,
                'compte': f'463{ligne["code"].zfill(3)}',
                'adresse': ADRESSE,
                'telephone': TELEPHONE,
            }
            code = valeurs.pop('code')
            _, cree = Adherent.objects.get_or_create(code=code, defaults=valeurs)
            crees += 1 if cree else 0

        self.stdout.write(
            f'Adhérents : {crees} créé(s), {len(ADHERENTS) - crees} déjà présent(s).'
        )
