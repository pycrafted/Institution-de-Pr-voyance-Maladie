"""
Entité de la structure (organigramme).

Un seul référentiel partitionné par le type : Direction (DIR), Département (DEP)
ou Service (SRV). Le code est engendré à partir du préfixe du type et d'un rang
(DIR001, DEP014, SRV009). Chaque entité — sauf les directions, au sommet — se
rattache à une entité parente via le code de celle-ci.

Contrairement aux autres référentiels, les libellés sont en casse normale.
"""

from django.db import models

from .base import Referentiel


class StructureEntite(Referentiel):
    TYPES = [
        ('DIR', 'Direction'),
        ('DEP', 'Département'),
        ('SRV', 'Service'),
    ]

    code = models.CharField('Code', max_length=6, unique=True)
    type = models.CharField('Type', max_length=3, choices=TYPES)
    # Code de l'entité parente ('' pour une direction, au sommet). On stocke le
    # code plutôt qu'une clé étrangère : c'est ce code que manipule le frontend.
    parent = models.CharField('Rattachement', max_length=6, blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Entité de structure'
        verbose_name_plural = 'Entités de structure'
