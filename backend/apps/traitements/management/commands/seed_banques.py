"""
Seed du référentiel des banques (B1..B10), §18, captures 62/68.

Référentiel (pas de données personnelles) : à lancer sur la base de présentation
comme sur la base de dev. Noms ET comptes 521xxx confirmés sur la vraie base
LAMPS (`lamps_analyse.banques`) le 2026-10-19 : B8 = ECOBANK CMMC FONCTIONNEMENT
(et non « CREDIT DU SENEGAL » comme supposé avant), B9 = ECOBANK CSM (il manquait).
"""

from django.core.management.base import BaseCommand

from traitements.models import Banque

# (code, libellé, réseau, compte 521xxx). Tout [C], confirmé en base le 19/10/2026.
BANQUES = [
    ('B1', 'CREDIT DU SENEGAL IPM', 'CREDIT DU SENEGAL', '521100'),
    ('B2', 'CREDIT DU SENEGAL CMMC', 'CREDIT DU SENEGAL', '521200'),
    ('B3', 'CREDIT DU SENEGAL CSM', 'CREDIT DU SENEGAL', '521300'),
    ('B4', 'ECOBANK IPM', 'ECOBANK', '521400'),
    ('B5', 'ECOBANK CMMC', 'ECOBANK', '521500'),
    ('B6', 'CREDIT DU SENEGAL CMMCR-SAR', 'CREDIT DU SENEGAL', '521600'),
    ('B7', 'ECOBANK IPM FONCTIONNEMENT', 'ECOBANK', '521700'),
    ('B8', 'ECOBANK CMMC FONCTIONNEMENT', 'ECOBANK', '521800'),
    ('B9', 'ECOBANK CSM', 'ECOBANK', '521900'),
    ('B10', 'ECOBANK MSRNC', 'ECOBANK', '521610'),
]


class Command(BaseCommand):
    help = 'Crée / met à jour le référentiel des banques (B1..B10).'

    def handle(self, *args, **options):
        crees = maj = 0
        for code, libelle, reseau, compte in BANQUES:
            _, created = Banque.objects.update_or_create(
                code=code,
                defaults={'libelle': libelle, 'reseau': reseau, 'compte': compte, 'actif': True},
            )
            if created:
                crees += 1
            else:
                maj += 1
        self.stdout.write(self.style.SUCCESS(f'Banques : {crees} créées, {maj} mises à jour.'))
