"""
Fiche d'un prestataire de soins — socle commun.

Deux objets portent exactement la même fiche : le fournisseur de soins agréé,
et la demande d'agrément qui le précède. Déclarer ces champs une seule fois
garantit qu'une demande validée se recopie en fournisseur sans rien perdre ni
rien inventer — deux listes tenues à la main finiraient par diverger.

Modèle abstrait : aucune table propre. La spécialité n'y figure pas, chaque
modèle concret déclarant sa clé étrangère avec son propre nom de relation
inverse.
"""

from django.db import models

from .base import Referentiel


class FicheFournisseur(Referentiel):
    """Coordonnées, interlocuteur, pièces professionnelles, domiciliation."""

    # Champs recopiés d'une demande vers le fournisseur qu'elle fait naître.
    # Tenus ici, contre les déclarations, pour qu'un champ ajouté plus bas ne
    # soit pas oublié à la validation.
    CHAMPS_FICHE = (
        'libelle',
        'adresse',
        'telephone',
        'mobile',
        'email',
        'contact_nom',
        'contact_prenoms',
        'contact_fonction',
        'contact_telephone',
        'contact_mobile',
        'carte_numero',
        'carte_date',
        'carte_autorite',
        'rc_numero',
        'rc_date',
        'ninea',
        'autorisation_numero',
        'autorisation_date',
        'banque_nom',
        'banque_code',
        'guichet_code',
        'compte_bancaire',
        'cle_rib',
    )

    adresse = models.CharField('Adresse', max_length=255, blank=True)
    telephone = models.CharField('Téléphone fixe', max_length=30, blank=True)
    mobile = models.CharField('Téléphone mobile', max_length=30, blank=True)
    email = models.EmailField('Email', blank=True)

    # --- Interlocuteur chez le prestataire --------------------------------
    contact_nom = models.CharField('Nom du contact', max_length=100, blank=True)
    contact_prenoms = models.CharField('Prénoms du contact', max_length=100, blank=True)
    contact_fonction = models.CharField('Fonction du contact', max_length=100, blank=True)
    contact_telephone = models.CharField('Téléphone du contact', max_length=30, blank=True)
    contact_mobile = models.CharField('Mobile du contact', max_length=30, blank=True)

    # --- Pièces professionnelles ------------------------------------------
    # Chaque pièce porte son numéro, sa date et, pour la carte, l'autorité qui
    # l'a délivrée : une pièce sans date ne dit pas si elle court encore, un
    # numéro sans son ordre professionnel ne se vérifie pas. Dates nullables —
    # la plupart des fiches n'en portent pas.
    carte_numero = models.CharField('Numéro de carte', max_length=30, blank=True)
    carte_date = models.DateField('Carte délivrée le', null=True, blank=True)
    carte_autorite = models.CharField('Autorité de délivrance', max_length=100, blank=True)
    rc_numero = models.CharField('Numéro R.C.', max_length=40, blank=True)
    rc_date = models.DateField('Immatriculé au R.C. le', null=True, blank=True)
    ninea = models.CharField('NINEA', max_length=20, blank=True)
    autorisation_numero = models.CharField('Numéro d’autorisation', max_length=40, blank=True)
    autorisation_date = models.DateField('Autorisation délivrée le', null=True, blank=True)

    # --- Domiciliation bancaire -------------------------------------------
    banque_nom = models.CharField('Banque', max_length=100, blank=True)
    banque_code = models.CharField('Code banque', max_length=5, blank=True)
    guichet_code = models.CharField('Code guichet', max_length=5, blank=True)
    compte_bancaire = models.CharField('Compte bancaire', max_length=12, blank=True)
    cle_rib = models.CharField('Clé RIB', max_length=2, blank=True)

    class Meta(Referentiel.Meta):
        abstract = True
