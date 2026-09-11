"""
Fournisseur divers.

Tiers non médical (fournitures, énergie, transport…). Le compte fournisseur
(401xxx) tient lieu de code : c'est lui qui identifie la ligne. La fiche est
riche — coordonnées, interlocuteur, domiciliation bancaire — mais la plupart des
champs restent vides en pratique ; une fiche complète est l'exception.

Les champs optionnels sont des CharField (et non des types stricts) : l'écran
d'origine les traite comme du texte libre, et beaucoup arrivent vides.
"""

from django.db import models

from .base import Referentiel


class FournisseurDivers(Referentiel):
    # code = compte fournisseur (« 401022 ») ; libelle = intitulé.
    code = models.CharField('Compte', max_length=6, unique=True)

    adresse = models.CharField('Adresse', max_length=255, blank=True)
    telephone = models.CharField('Téléphone', max_length=30, blank=True)
    email = models.EmailField('Email', blank=True)
    ninea = models.CharField('NINEA', max_length=20, blank=True)
    delai_reglement = models.CharField('Délai de règlement', max_length=10, blank=True)

    contact_nom = models.CharField('Contact', max_length=100, blank=True)
    contact_telephone = models.CharField('Téléphone contact', max_length=30, blank=True)

    banque_nom = models.CharField('Banque', max_length=100, blank=True)
    banque_code = models.CharField('Code banque', max_length=5, blank=True)
    guichet_code = models.CharField('Code guichet', max_length=5, blank=True)
    compte_bancaire = models.CharField('Compte bancaire', max_length=12, blank=True)
    cle_rib = models.CharField('Clé RIB', max_length=2, blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Fournisseur divers'
        verbose_name_plural = 'Fournisseurs divers'
