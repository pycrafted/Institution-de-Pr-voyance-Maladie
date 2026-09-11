"""
Médicament.

Un médicament ne se rattache qu'à la pharmacie : la prestation est figée à
« 06 ». Le compte suit la règle 6020 + code prestation, soit « 602006 » : il
est figé lui aussi, et le formulaire le présente en lecture seule. Deux
champs lui sont propres : ``exclus``
(hors remboursement) et ``tarif`` (tarif négocié, 0 = aucun). C'est le seul
référentiel sur lequel on agit en lot.
"""

from django.db import models

from .base import Referentiel


class Medicament(Referentiel):
    code = models.CharField('Code', max_length=7, unique=True)
    prestation = models.CharField('Prestation', max_length=2, default='06')
    compte = models.CharField('Compte', max_length=6, default='602006')
    exclus = models.BooleanField('Exclu du remboursement', default=False)
    # Tarif négocié en francs CFA, entier. 0 signifie « pas de tarif négocié ».
    tarif = models.PositiveIntegerField('Tarif', default=0)

    class Meta:
        ordering = ['code']
        verbose_name = 'Médicament'
        verbose_name_plural = 'Médicaments'
