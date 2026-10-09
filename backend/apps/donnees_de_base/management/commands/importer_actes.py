"""
Importe la nomenclature des actes (hors pharmacie) relevée dans LAMPS.

Les 179 actes réels de la table ``actes`` de LAMPS (toutes spécialités sauf 06
Pharmacie) ont été exportés dans ``apps/donnees_de_base/data/actes.json``. Cette
commande les crée (ou les met à jour) dans le référentiel ``Acte``, par leur
code. Idempotente : relançable sans doublon.

    python manage.py importer_actes
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.models import Acte

FICHIER = Path(__file__).resolve().parents[2] / 'data' / 'actes.json'


class Command(BaseCommand):
    help = "Importe la nomenclature des actes (hors pharmacie) depuis le relevé LAMPS."

    def handle(self, *args, **options):
        # utf-8-sig : le fichier a pu être écrit avec un BOM (export PowerShell).
        with open(FICHIER, encoding='utf-8-sig') as flux:
            lignes = json.load(flux)

        crees = maj = 0
        with transaction.atomic():
            for ligne in lignes:
                code = str(ligne.get('code', '')).strip()
                if not code:
                    continue
                defauts = {
                    'libelle': str(ligne.get('libelle', '')).strip(),
                    'specialite': str(ligne.get('specialite', '')).strip(),
                    'tarif': int(ligne.get('tarif') or 0),
                    'exclus': bool(ligne.get('exclus', False)),
                    'taux': int(ligne.get('taux') or 0),
                    'actif': True,
                }
                _, cree = Acte.objects.update_or_create(code=code, defaults=defauts)
                crees += 1 if cree else 0
                maj += 0 if cree else 1

        self.stdout.write(self.style.SUCCESS(f'Actes importés : {crees} créés, {maj} mis à jour.'))
