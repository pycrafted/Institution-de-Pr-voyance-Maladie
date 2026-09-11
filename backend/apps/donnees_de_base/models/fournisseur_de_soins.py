"""
Fournisseur de soins.

Prestataire conventionné — clinique, pharmacie, laboratoire, cabinet — que la
caisse rembourse. Sa fiche (coordonnées, interlocuteur, pièces, banque) est
déclarée dans ``FicheFournisseur``, qu'il partage avec la demande d'agrément
dont il est issu.

La spécialité n'est pas recopiée en clair : elle pointe vers le référentiel
« Spécialités » des données de base, seul endroit où ce classement — et le
compte comptable qu'il porte — est tenu. Un fournisseur ne peut donc plus
désigner une catégorie inexistante, et renommer une spécialité se répercute
partout sans reprise.

L'activation se lit ici « convention dénoncée » plutôt que « ligne
désactivée » : la fiche reste, car les dossiers déjà remboursés la référencent.
"""

from django.db import models

from .fiche_fournisseur import FicheFournisseur
from .specialite import Specialite


class FournisseurDeSoins(FicheFournisseur):
    # code = numéro séquentiel attribué par l'application ; libelle = raison sociale.
    code = models.CharField('Numéro', max_length=10, unique=True)

    # PROTECT et non CASCADE : retirer une spécialité encore portée par des
    # prestataires effacerait leurs fiches. Le référentiel doit d'abord être
    # vidé de ses rattachements — ou la spécialité simplement désactivée.
    specialite = models.ForeignKey(
        Specialite,
        on_delete=models.PROTECT,
        related_name='fournisseurs',
        verbose_name='Spécialité',
    )

    class Meta:
        ordering = ['code']
        verbose_name = 'Fournisseur de soins'
        verbose_name_plural = 'Fournisseurs de soins'

    @classmethod
    def prochain_code(cls):
        """
        Numéro du prochain fournisseur : le plus grand numéro existant plus un,
        sur trois chiffres. Même règle que le frontend (``genererCode`` dans
        src/views/fournisseurs-de-soins/config.js), pour qu'un fournisseur né
        d'une demande s'insère dans la même série que les autres.
        """
        codes = cls.objects.values_list('code', flat=True)
        return f'{max((int(c) for c in codes if c.isdigit()), default=0) + 1:03d}'
