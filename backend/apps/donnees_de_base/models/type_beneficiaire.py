"""
Type de bénéficiaire.

Lien de parenté entre le bénéficiaire et le participant (PARTICIPANT, EPOUSE,
ENFANT, ASCENDANT…). Liste fermée par nature : ce référentiel n'a pas vocation
à s'allonger comme les autres (cf. commentaire dans services/referentiels.js).
"""

from django.db import models

from .base import Referentiel


class TypeBeneficiaire(Referentiel):
    # Le code est court (« 1 », « 2 »…) et doit rester unique : c'est lui qu'on
    # cite dans les dossiers.
    code = models.CharField('Code', max_length=2, unique=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Type de bénéficiaire'
        verbose_name_plural = 'Types de bénéficiaire'
