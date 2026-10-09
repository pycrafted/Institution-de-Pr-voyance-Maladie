"""
Acte médical.

Nomenclature des actes facturables **hors pharmacie** - ceux que porte une
lettre de garantie, un bon optique ou une hospitalisation (CONSULTATION
GENERALISTE, SCANNER, NFS, ECHOGRAPHIE…). Reprise de la nomenclature LAMPS
(table ``actes``, toutes spécialités sauf 06 Pharmacie, dont les articles sont
les médicaments - cf. modèle ``Medicament``).

Chaque acte se rattache à une **spécialité** (le ``codespe`` de LAMPS) : c'est
ce qui permet, à la saisie d'une lettre de garantie, de ne proposer que les
actes de la spécialité du prestataire choisi. Le tarif de référence vaut
souvent 0 - il se saisit alors sur le document ; ``taux`` est le taux de prise
en charge propre à l'acte.
"""

from django.db import models

from .base import Referentiel


class Acte(Referentiel):
    # « ACT0180 » : code de la nomenclature LAMPS (codeacte).
    code = models.CharField('Code', max_length=10, unique=True)
    # Spécialité de rattachement (codespe LAMPS : 00, 01, 02…), comme pour un
    # fournisseur de soins : un acte « SCANNER » est de la spécialité 02.
    specialite = models.CharField('Spécialité', max_length=2, blank=True)
    # Tarif de référence en francs CFA. 0 = aucun (il se saisit sur le document).
    tarif = models.PositiveIntegerField('Tarif', default=0)
    exclus = models.BooleanField('Exclu du remboursement', default=False)
    # Taux de prise en charge propre à l'acte (pourcentage).
    taux = models.PositiveSmallIntegerField('Taux de prise en charge', default=0)

    class Meta:
        ordering = ['specialite', 'libelle']
        verbose_name = 'Acte'
        verbose_name_plural = 'Actes'
