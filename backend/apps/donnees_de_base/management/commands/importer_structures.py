# -*- coding: utf-8 -*-
"""
Reprend l'organigramme réel de LAMPS dans le référentiel « Structures ».

Ce que LAMPS contient vraiment, et c'est peu :
  - ``services`` : 18 services réels, avec leur libellé (« VENTE GRAND
    PUBLIC », « DIRECTION QUALITE AUDIT »…) ;
  - ``table_directions`` et ``table_departements`` : **vides**. Les
    participants portent pourtant des codes de direction et de département
    (DIR005, DEPT003…) : l'origine n'en a jamais tenu le libellé.

On reprend donc les services avec leur nom, et les directions et départements
sous leur seul code - inventer leur intitulé reviendrait à remettre du
fictif dans une base qui ne doit plus en contenir. Les entités absentes du
réel sont retirées, sauf celles qu'un participant cite encore.

    DB_NAME=ipm_dev python manage.py importer_structures
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import StructureEntite
from participants.models import Participant

SERVICES = "select codeserv, service from services order by codeserv"
# Les codes que les participants réels portent : ils doivent exister dans le
# référentiel, même quand LAMPS n'en donne pas le nom.
CODES_PORTES = """
    select distinct codedir, codedept, codeserv from participants
"""


class Command(BaseCommand):
    help = "Reprend l'organigramme réel de LAMPS (services nommés, directions et départements au code)."

    def add_arguments(self, parser):
        ajouter_arguments(parser)

    @transaction.atomic
    def handle(self, *args, **options):
        voulus = {}
        for code, libelle in lire(options, SERVICES):
            code = texte(code, 10)
            if code:
                voulus[code] = ('SRV', texte(libelle, 150) or code)
        for codedir, codedept, codeserv in lire(options, CODES_PORTES):
            for brut, type_ in ((codedir, 'DIR'), (codedept, 'DEP'), (codeserv, 'SRV')):
                code = texte(brut, 10)
                if code and code not in voulus:
                    # Pas de libellé dans LAMPS : le code se suffit, et ne
                    # raconte rien de faux.
                    voulus[code] = (type_, code)

        nommes = sum(1 for code, (_, libelle) in voulus.items() if libelle != code)
        poses = 0
        for code, (type_, libelle) in sorted(voulus.items()):
            StructureEntite.objects.update_or_create(
                code=code, defaults={'type': type_, 'libelle': libelle, 'actif': True}
            )
            poses += 1

        # Ce que le réel ne connaît pas s'en va, sauf si un participant le cite.
        cites = set()
        for champ in ('direction', 'departement', 'service'):
            cites |= {
                v for v in Participant.objects.values_list(champ, flat=True).distinct() if v
            }
        a_retirer = StructureEntite.objects.exclude(code__in=set(voulus) | cites)
        retires = a_retirer.count()
        a_retirer.delete()

        self.stdout.write(
            self.style.SUCCESS(
                'Structures : %d reprises de LAMPS (%d portent un libellé réel, '
                'les autres leur seul code), %d fictives retirées.' % (poses, nommes, retires)
            )
        )
