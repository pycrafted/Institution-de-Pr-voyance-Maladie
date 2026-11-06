# -*- coding: utf-8 -*-
"""
Reprend le plan comptable réel de LAMPS (table `plancompta`, 462 lignes).

    DB_NAME=ipm_dev python manage.py importer_plan_comptable

Relançable sans dégât : chaque compte est mis à jour sur son numéro.

Ce que la reprise ramène, et qu'il faut avoir en tête : **`plancompta` n'est
pas qu'un plan comptable**. C'est aussi, chez LAMPS, le référentiel des
spécialités (400xxx), des prestations (602xxx), des adhérents (463xxx), des
participants (411xxx), des banques (521xxx) et des cotisations (70xxxx) - six
« tables » qui n'y sont que des vues filtrées. Nos référentiels à nous sont
des tables distinctes ; les comptes repris ici en sont donc la **contrepartie
comptable**, pas un doublon.

La table porte aussi sa propre hiérarchie : 1 classe, 23 niveaux et 47
sous-comptes voisinent avec les 385 vrais comptes. On les reprend tous - ils
donnent les colonnes « Niveau » et « Sous Compte » de l'écran - et c'est la
vue qui n'affiche que les comptes.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import CompteComptable
from donnees_de_base.models.compte_comptable import TYPE_AUTRES, TYPES_COMPTE

TYPES_CONNUS = {code for code, _ in TYPES_COMPTE}


class Command(BaseCommand):
    help = 'Reprend le plan comptable réel de LAMPS.'

    def add_arguments(self, parser):
        ajouter_arguments(parser)

    @transaction.atomic
    def handle(self, *args, **options):
        lignes = lire(options, """
            select compte, intitule, classe, cptegen, souscpte, type_compte
              from plancompta order by compte
        """)

        crees = modifies = 0
        for compte, intitule, classe, cptegen, souscpte, type_compte in lignes:
            numero = texte(compte, 10)
            if not numero:
                continue
            type_lu = texte(type_compte, 10)
            _, cree = CompteComptable.objects.update_or_create(
                code=numero,
                defaults={
                    'libelle': texte(intitule, 255),
                    'classe': texte(classe, 1),
                    'niveau': texte(cptegen, 2),
                    'sous_compte': texte(souscpte, 3),
                    # Un type inconnu retombe sur « Autres », la valeur par
                    # défaut de LAMPS lui-même.
                    'type_compte': type_lu if type_lu in TYPES_CONNUS else TYPE_AUTRES,
                },
            )
            crees += cree
            modifies += not cree

        comptes = sum(1 for c in CompteComptable.objects.all() if c.est_un_compte)
        self.stdout.write(
            self.style.SUCCESS(
                'Plan comptable : %d créés, %d mis à jour.\n'
                '%d lignes au total, dont %d vrais comptes (le reste est la '
                'hiérarchie : classes, niveaux, sous-comptes).'
                % (crees, modifies, CompteComptable.objects.count(), comptes)
            )
        )
