"""
Spécialité — catégorie de fournisseur de soins conventionné, porteuse d'un
compte 4000xx. C'est ce classement (et non la spécialité médicale académique)
qui porte le compte comptable.
"""

from django.db import models

from .base import ReferentielAvecCompte


class Specialite(ReferentielAvecCompte):
    code = models.CharField('Code', max_length=2, unique=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Spécialité'
        verbose_name_plural = 'Spécialités'
