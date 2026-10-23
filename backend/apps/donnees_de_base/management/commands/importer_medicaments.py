# -*- coding: utf-8 -*-
"""
Reprend le catalogue RÉEL des médicaments de LAMPS.

Dans LAMPS, les médicaments ne sont pas une table à part : ce sont les lignes
de ``actes`` dont la prestation est **06 PHARMACIE** - 6 020 références, avec
leur tarif, leur compte et l'indicateur « exclu du remboursement ». Les autres
actes (177, toutes spécialités) sont le référentiel « Actes », repris par
``importer_actes``.

Rien n'est inventé : les libellés sont ceux de l'origine (« ACETYLCYSTEINE CP
B/20 »). Les références absentes du réel sont retirées, sauf celles qu'un
document cite encore.

    DB_NAME=ipm_dev python manage.py importer_medicaments --motdepasse XXX
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import ProtectedError

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import Medicament

MEDICAMENTS = """
    select codeacte, libacte, tarif, compte, exclus, codeprest
      from actes
     where codeprest = '06'
     order by codeacte
"""


def entier(valeur):
    """Tarif de LAMPS en entier positif ; vide, nul ou négatif valent 0."""
    try:
        nombre = int(valeur)
    except (TypeError, ValueError):
        return 0
    return max(nombre, 0)


class Command(BaseCommand):
    help = "Reprend les médicaments réels de LAMPS (actes de prestation 06)."

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument('--sans-purge', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        crees = majs = trop_longs = 0
        vus = set()
        for codeacte, libacte, tarif, compte, exclus, codeprest in lire(options, MEDICAMENTS):
            code = texte(codeacte)
            if not code:
                continue
            if len(code) > 7:
                # Le champ tient 7 caractères, comme les codes de l'origine :
                # un code plus long serait une donnée qu'on n'a pas su lire.
                trop_longs += 1
                continue
            _, cree = Medicament.objects.update_or_create(
                code=code,
                defaults={
                    'libelle': texte(libacte, 150),
                    'tarif': entier(tarif),
                    'compte': texte(compte, 6) or '602006',
                    'prestation': texte(codeprest, 2) or '06',
                    'exclus': bool(exclus),
                    'actif': True,
                },
            )
            crees += cree
            majs += not cree
            vus.add(code)

        retires = proteges = 0
        if not options['sans_purge']:
            for medicament in Medicament.objects.exclude(code__in=vus):
                try:
                    with transaction.atomic():
                        medicament.delete()
                    retires += 1
                except ProtectedError:
                    proteges += 1

        self.stdout.write(
            self.style.SUCCESS(
                'Médicaments : %d créés, %d mis à jour, %d retirés '
                '(%d retenus par un document, %d codes trop longs).'
                % (crees, majs, retires, proteges, trop_longs)
            )
        )
