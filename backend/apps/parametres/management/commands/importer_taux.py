"""
Charge les taux de prise en charge depuis ``apps/parametres/data/taux.json``.

Le barème métier arrive par morceaux ; ce fichier est la sauvegarde de ce qu'on
a déjà, pour qu'il survive à une reconstruction de base. Chaque taux est repéré
par les **codes** (société, nature de prestation, type de bénéficiaire), stables
d'une base à l'autre - pas par des identifiants internes. Idempotente : relancer
met simplement les taux à l'état du fichier (update_or_create), sans doublon.

Pour y déposer le barème complet plus tard : remplacer/compléter le JSON (mêmes
champs : societe, prestation, typeBenef, taux, plafond, forfait) puis relancer.

    python manage.py importer_taux
    python manage.py importer_taux --fichier C:\\chemin\\bareme.json
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire, TypePrestation
from parametres.models import TauxPriseEnCharge

FICHIER = Path(__file__).resolve().parents[2] / 'data' / 'taux.json'


class Command(BaseCommand):
    help = "Charge les taux de prise en charge depuis le fichier de sauvegarde JSON."

    def add_arguments(self, parser):
        parser.add_argument('--fichier', default=str(FICHIER))

    def handle(self, *args, **options):
        chemin = Path(options['fichier'])
        if not chemin.exists():
            raise CommandError(f'Fichier introuvable : {chemin}')
        with open(chemin, encoding='utf-8-sig') as flux:
            lignes = json.load(flux)

        societes = {a.code: a for a in Adherent.objects.all()}
        prestations = {p.code: p for p in TypePrestation.objects.all()}
        types = {t.code: t for t in TypeBeneficiaire.objects.all()}

        crees = maj = ignores = 0
        with transaction.atomic():
            for ligne in lignes:
                soc = societes.get(str(ligne.get('societe', '')).strip())
                prest = prestations.get(str(ligne.get('prestation', '')).strip())
                tb = types.get(str(ligne.get('typeBenef', '')).strip())
                if not (soc and prest and tb):
                    ignores += 1
                    continue
                _, cree = TauxPriseEnCharge.objects.update_or_create(
                    adherent=soc,
                    prestation=prest,
                    type_benef=tb,
                    defaults={
                        'taux': int(ligne.get('taux') or 0),
                        'plafond': int(ligne.get('plafond') or 0),
                        'forfait': int(ligne.get('forfait') or 0),
                    },
                )
                crees += int(cree)
                maj += int(not cree)

        self.stdout.write(
            self.style.SUCCESS(
                f'Taux chargés : {crees} créé(s), {maj} mis à jour'
                + (f', {ignores} ignoré(s) (code société/prestation/type inconnu).' if ignores else '.')
            )
        )
