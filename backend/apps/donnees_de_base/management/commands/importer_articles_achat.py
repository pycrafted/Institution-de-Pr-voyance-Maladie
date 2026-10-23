# -*- coding: utf-8 -*-
"""
Reprend les articles d'achat RÉELS de LAMPS (``table_articles_achat``).

Ce sont les fournitures que l'IPM commande pour elle-même - papier,
calculatrices, cartouches - avec leur prix unitaire et leur compte de charge.
24 références dans l'origine. Les articles absents du réel sont retirés, sauf
ceux qu'un bon d'achat cite encore.

    DB_NAME=ipm_dev python manage.py importer_articles_achat --motdepasse XXX
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import ProtectedError

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import ArticleAchat

ARTICLES = 'select * from table_articles_achat'


def entier(valeur):
    try:
        return max(int(valeur), 0)
    except (TypeError, ValueError):
        return 0


class Command(BaseCommand):
    help = "Reprend les articles d'achat réels de LAMPS."

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument('--sans-purge', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        crees = majs = 0
        vus = set()
        for ligne in lire(options, ARTICLES):
            code, libelle, prix, compte = (list(ligne) + [None] * 4)[:4]
            code = texte(code, 7)
            if not code:
                continue
            _, cree = ArticleAchat.objects.update_or_create(
                code=code,
                defaults={
                    'libelle': texte(libelle, 150),
                    'prix_unitaire': entier(prix),
                    'compte': texte(compte, 6),
                    'actif': True,
                },
            )
            crees += cree
            majs += not cree
            vus.add(code)

        retires = proteges = 0
        if not options['sans_purge']:
            for article in ArticleAchat.objects.exclude(code__in=vus):
                try:
                    with transaction.atomic():
                        article.delete()
                    retires += 1
                except ProtectedError:
                    proteges += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Articles d'achat : %d créés, %d mis à jour, %d retirés "
                '(%d retenus par un bon d’achat).' % (crees, majs, retires, proteges)
            )
        )
