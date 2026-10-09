"""
Fournisseur de soins.

Prestataire conventionné - clinique, pharmacie, laboratoire, cabinet - que la
caisse rembourse. Sa fiche (coordonnées, interlocuteur, pièces, banque) est
déclarée dans ``FicheFournisseur``, qu'il partage avec la demande d'agrément
dont il est issu.

La spécialité n'est pas recopiée en clair : elle pointe vers le référentiel
« Spécialités » des données de base, seul endroit où ce classement - et le
compte comptable qu'il porte - est tenu. Un fournisseur ne peut donc plus
désigner une catégorie inexistante, et renommer une spécialité se répercute
partout sans reprise.

L'activation se lit ici « convention dénoncée » plutôt que « ligne
désactivée » : la fiche reste, car les dossiers déjà remboursés la référencent.
"""

from django.db import models

from .fiche_fournisseur import FicheFournisseur
from .specialite import Specialite

# Le prestataire fourre-tout de l'application d'origine (« FOURNISSEURS
# DIVERS SOINS »), désigné quand une pharmacie n'est pas conventionnée. Il
# se tient hors de la série : sans cela, le prochain numéro serait 100000.
CODE_FOURNISSEURS_DIVERS = '9999'


class FournisseurDeSoins(FicheFournisseur):
    # code = numéro séquentiel attribué par l'application ; libelle = raison sociale.
    code = models.CharField('Numéro', max_length=10, unique=True)

    # PROTECT et non CASCADE : retirer une spécialité encore portée par des
    # prestataires effacerait leurs fiches. Le référentiel doit d'abord être
    # vidé de ses rattachements - ou la spécialité simplement désactivée.
    specialite = models.ForeignKey(
        Specialite,
        on_delete=models.PROTECT,
        related_name='fournisseurs',
        # Facultative : une fiche peut attendre sa spécialité.
        null=True,
        blank=True,
        verbose_name='Spécialité',
    )

    class Meta:
        ordering = ['code']
        verbose_name = 'Fournisseur de soins'
        verbose_name_plural = 'Fournisseurs de soins'

    @classmethod
    def prochain_code(cls):
        """
        Prochain numéro de la série commune aux fournisseurs et aux demandes
        d'agrément : une demande reçoit dès sa création le numéro que portera
        le fournisseur qu'elle fera naître. Le plus grand numéro des deux
        tables, plus un, sur quatre chiffres, comme l'application d'origine
        (« 0001 », « 0817 ») - demandes validées comprises,
        pour qu'un numéro déjà donné ne resserve jamais.
        """
        # Import local : les deux modèles se citent l'un l'autre.
        from .demande_agrement import DemandeAgrement

        codes = list(cls.objects.values_list('code', flat=True))
        codes += list(DemandeAgrement.objects.values_list('code', flat=True))
        return f'{max((int(c) for c in codes if c.isdigit() and c != CODE_FOURNISSEURS_DIVERS), default=0) + 1:04d}'
