"""Type de prestation — acte médical remboursable, porteur d'un compte 6020xx."""

from django.db import models

from .base import ReferentielAvecCompte


class TypePrestation(ReferentielAvecCompte):
    code = models.CharField('Code', max_length=2, unique=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Type de prestation'
        verbose_name_plural = 'Types de prestation'
