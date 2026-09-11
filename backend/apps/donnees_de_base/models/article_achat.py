"""
Article d'achat — bien ou fourniture acheté.

Reprend l'écran de l'application d'origine : un code engendré (ART0001…), une
désignation, un prix unitaire, et un compte de rattachement facultatif choisi
dans les comptes d'achat.
"""

from django.db import models

from .base import Referentiel


class ArticleAchat(Referentiel):
    # Code engendré côté application : préfixe ART + rang sur quatre chiffres.
    code = models.CharField('Code', max_length=7, unique=True)
    # Prix unitaire en francs CFA, entier. 0 par défaut, comme à la saisie.
    prix_unitaire = models.PositiveIntegerField('Prix unitaire', default=0)
    # Compte d'achat de rattachement, facultatif (« Aucun » possible).
    compte = models.CharField('Compte rattaché', max_length=6, blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Article d’achat'
        verbose_name_plural = 'Articles d’achat'
