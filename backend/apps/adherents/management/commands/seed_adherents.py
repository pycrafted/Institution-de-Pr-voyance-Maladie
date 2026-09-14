"""
Peuple le référentiel des adhérents.

Crée les quatre collectivités de l'application d'origine — deux groupes IPM,
personnel MOO et cadres, et les deux mutuelles CMM — avec ce qu'on en sait de
façon sûre : code, type, libellé et compte, tels que les montre la liste de
l'application d'origine.

Rien d'autre : adresse, téléphone, cotisations, seuils et point focal se
saisissent à l'écran, avec les vraies valeurs. Des coordonnées inventées — un
point focal au nom et à l'e-mail plausibles — passeraient pour vraies.

Idempotente : relancer la commande ne crée pas de doublon et ne réécrit pas une
ligne déjà présente en base.
"""

from django.core.management.base import BaseCommand

from adherents.models import Adherent

# Code, type et libellé. Les types sont ceux de l'application d'origine : la
# mutuelle y est enregistrée « MSS » et affichée « CMM ».
ADHERENTS = [
    ('01', 'IPM', 'IPM SAR PERSONNEL MOO'),
    ('02', 'IPM', 'IPM SAR PERSONNEL CADRES'),
    ('03', 'MSS', 'CMM CR-SAR'),
    ('04', 'MSS', 'CMM NCR-SAR'),
]


class Command(BaseCommand):
    help = 'Crée les adhérents de départ (IPM SAR, CMM), sans coordonnées inventées.'

    def handle(self, *args, **options):
        crees = 0
        for code, type_, libelle in ADHERENTS:
            _, cree = Adherent.objects.get_or_create(
                code=code,
                defaults={
                    'type': type_,
                    'libelle': libelle,
                    # Le compte suit le code : 01 → 463001.
                    'compte': f'463{code.zfill(3)}',
                    'regul_systematique': False,
                },
            )
            crees += 1 if cree else 0

        self.stdout.write(
            f'Adhérents : {crees} créé(s), {len(ADHERENTS) - crees} déjà présent(s).'
        )
