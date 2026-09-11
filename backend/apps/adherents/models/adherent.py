"""
Adhérent.

Un adhérent n'est pas une personne mais la collectivité qui cotise : une
catégorie de personnel de la SAR, ou une mutuelle. Les personnes couvertes,
elles, sont les participants et relèveront de leur propre module.

Deux régimes cohabitent : l'IPM, dont la cotisation se partage entre part SAR
et part participant, et la mutuelle CMM, dont la cotisation est unique. Les
champs sans objet pour un régime restent vides — d'où les CharField sur les
montants plutôt que des entiers : l'écran d'origine les traite comme du texte,
et une cotisation absente n'est pas une cotisation nulle.

Le socle commun (code, libellé, activation, horodatage) vient du module
Données de base : un adhérent se consulte, se complète et se désactive
exactement comme un référentiel.
"""

from django.db import models

from donnees_de_base.models.base import Referentiel

TYPES_ADHERENT = [
    ('IPM', 'IPM'),
    ('CMM', 'CMM'),
]


class Adherent(Referentiel):
    # Code séquentiel sur deux chiffres, attribué par l'application.
    code = models.CharField('Code', max_length=2, unique=True)

    type = models.CharField('Régime', max_length=3, choices=TYPES_ADHERENT)

    # Le compte suit le code : 01 → 463001.
    compte = models.CharField('Compte', max_length=6, unique=True)

    adresse = models.CharField('Adresse', max_length=255, blank=True)
    telephone = models.CharField('Téléphone fixe', max_length=30, blank=True)

    regul_systematique = models.BooleanField(
        'Régularisation systématique des frais médicaux', default=False
    )

    # --- Cotisations, en francs CFA -----------------------------------------
    cotisation_ipm_salariale = models.CharField(
        'Cotisation IPM Participant', max_length=12, blank=True
    )
    cotisation_ipm_patronale = models.CharField('Cotisation IPM SAR', max_length=12, blank=True)
    cotisation_mss = models.CharField('Cotisation Mutuelle', max_length=12, blank=True)

    # --- Plafonds de gestion -------------------------------------------------
    seuil_endettement = models.CharField('Seuil endettement', max_length=12, blank=True)
    seuil_consommation = models.CharField('Seuil consommation', max_length=12, blank=True)

    # --- Point focal : l'interlocuteur de l'IPM chez l'adhérent ---------------
    focal_nom = models.CharField('Point focal', max_length=100, blank=True)
    focal_telephone = models.CharField('Téléphone point focal', max_length=30, blank=True)
    focal_email = models.EmailField('Email point focal', blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Adhérent'
        verbose_name_plural = 'Adhérents'
