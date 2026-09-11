"""
Journal comptable.

Code court alphanumérique (« B10 », « AC »…), classé comme une chaîne : B10 se
range entre B1 et B2, comme dans l'application d'origine — c'est déjà l'ordre
que donne le tri par ``code`` du socle. Le type et le compte de contrepartie
sont facultatifs : certains journaux techniques (avoirs, clôture) n'en ont pas.
"""

from django.db import models

from .base import Referentiel


class JournalComptable(Referentiel):
    code = models.CharField('Code', max_length=3, unique=True)
    type = models.CharField('Type', max_length=20, blank=True)
    compte = models.CharField('Compte', max_length=6, blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Journal comptable'
        verbose_name_plural = 'Journaux comptables'
