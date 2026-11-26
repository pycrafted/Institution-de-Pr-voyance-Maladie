# -*- coding: utf-8 -*-
"""
Reprend les BONS D'ACHATS réels de LAMPS (``bons_achats`` + ``lignes_bons_achats``).

Sept bons et sept lignes : l'IPM ne s'est presque pas servie de ce module
dans l'origine. On les reprend quand même, pour que l'écran montre du réel
plutôt que rien - et parce que sept lignes disent la forme attendue (le
catalogue d'articles, la TVA à 18 %, la remise).

    DB_NAME=vrai_base python manage.py importer_bons_achats --purger

Le fournisseur d'un bon est un **fournisseur divers** (compte 401xxx du plan
comptable) : un bon dont le fournisseur n'existe pas chez nous est écarté,
notre ``BonAchat.fournisseur`` n'étant pas nullable.

Les montants de la ligne (remise, TVA, HT, TTC) ne sont pas repris : notre
modèle les recalcule à partir de la quantité, du prix unitaire et des deux
taux, comme l'écran de saisie. Les reprendre figés les ferait diverger de ce
que la page affiche.
"""

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import ArticleAchat, FournisseurDivers
from traitements.models import (
    STATUT_BA_EN_COURS,
    STATUT_BA_TRAITE,
    BonAchat,
    LigneBonAchat,
)

BONS = """
    select numba, date_ba, numfourn, num_offre, statut, date_liv, remarque, adresse_liv
    from bons_achats
    order by numba
"""

LIGNES = """
    select numbc, code_art, qte, prix_unitaire, taux_tva, taux_remise
    from lignes_bons_achats
    order by numbc
"""


def entier(valeur):
    try:
        return max(int(valeur or 0), 0)
    except (TypeError, ValueError):
        return 0


class Command(BaseCommand):
    help = "Reprend les bons d'achats réels de LAMPS."

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument(
            '--purger',
            action='store_true',
            help='Vide d’abord les bons et leurs lignes (reprise globale).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['purger']:
            LigneBonAchat.objects.all().delete()
            BonAchat.objects.all().delete()

        fournisseurs = {f.code: f for f in FournisseurDivers.objects.all()}
        articles = {a.code: a for a in ArticleAchat.objects.all()}

        lignes = defaultdict(list)
        for numbc, code_art, qte, prix, tva, remise in lire(options, LIGNES):
            lignes[texte(numbc, 10)].append(
                (texte(code_art, 7), entier(qte), entier(prix), entier(tva), entier(remise))
            )

        crees = sans_fournisseur = 0
        posees = sans_article = 0
        a_poser = []

        for numba, date_ba, numfourn, num_offre, statut, date_liv, remarque, adresse in lire(
            options, BONS
        ):
            code = texte(numba, 10)
            fournisseur = fournisseurs.get(texte(numfourn, 6))
            if fournisseur is None:
                sans_fournisseur += 1
                continue

            bon = BonAchat.objects.create(
                code=code,
                fournisseur=fournisseur,
                date_bon=date_ba,
                date_livraison=date_liv or None,
                num_offre=texte(num_offre, 20),
                statut=(
                    STATUT_BA_TRAITE
                    if texte(statut).lower().startswith(('trait', 'ok'))
                    else STATUT_BA_EN_COURS
                ),
                adresse_livraison=texte(adresse, 255),
                remarque=texte(remarque),
            )
            crees += 1

            for rang, (code_art, qte, prix, tva, remise) in enumerate(lignes.get(code, []), 1):
                article = articles.get(code_art)
                if article is None:
                    sans_article += 1
                    continue
                a_poser.append(
                    LigneBonAchat(
                        bon=bon,
                        article=article,
                        quantite=qte or 1,
                        prix_unitaire=prix,
                        taux_tva=tva,
                        taux_remise=remise,
                        rang=rang,
                    )
                )
                posees += 1

        LigneBonAchat.objects.bulk_create(a_poser, batch_size=500)

        self.stdout.write(f'Bons d’achats : {crees} repris')
        if sans_fournisseur:
            self.stdout.write(f'  écartés, fournisseur divers inconnu : {sans_fournisseur}')
        self.stdout.write(f'Lignes : {posees} reprises')
        if sans_article:
            self.stdout.write(f'  écartées, article absent du catalogue : {sans_article}')
