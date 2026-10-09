"""
Fiche d'un prestataire de soins - socle commun.

Deux objets portent exactement la même fiche : le fournisseur de soins agréé,
et la demande d'agrément qui le précède. Déclarer ces champs une seule fois
garantit qu'une demande validée se recopie en fournisseur sans rien perdre ni
rien inventer - deux listes tenues à la main finiraient par diverger.

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
        'fax',
        'bp',
        'region',
        'pays',
        'site_web',
        'date_debut',
        'date_debut_convention',
        'date_fin_convention',
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
        'compte',
        'banque_nom',
        'banque_code',
        'guichet_code',
        'compte_bancaire',
        'cle_rib',
        'latitude',
        'longitude',
    )

    # Compte du prestataire au grand-livre. L'application d'origine crédite ce
    # compte à la comptabilisation d'une facture (journal IF) et le débite à son
    # règlement : sans lui, aucun compte fournisseur ne peut être tenu. Laissé
    # libre - la numérotation définitive viendra de la comptabilité ; l'écran
    # propose celui de la spécialité, qui fait office de compte collectif.
    compte = models.CharField('Compte', max_length=6, blank=True)

    adresse = models.CharField('Adresse', max_length=255, blank=True)
    telephone = models.CharField('Téléphone fixe', max_length=30, blank=True)
    mobile = models.CharField('Téléphone mobile', max_length=30, blank=True)
    email = models.EmailField('Email', blank=True)
    # Coordonnées complémentaires de la fiche d'origine (souvent vides, mais
    # présentes sur la « Détails fournisseur » de LAMPS, et reprises du dump).
    fax = models.CharField('FAX', max_length=30, blank=True)
    bp = models.CharField('Boîte postale', max_length=50, blank=True)
    region = models.CharField('Région', max_length=100, blank=True)
    pays = models.CharField('Pays', max_length=100, blank=True)
    site_web = models.CharField('Site web', max_length=255, blank=True)

    # --- Convention ----------------------------------------------------------
    # Dates affichées par la fiche d'origine : début d'activité, puis début et
    # fin de conventionnement. Facultatives - la plupart des fiches n'en portent
    # pas - mais ce sont elles qui disent depuis quand le prestataire est agréé.
    date_debut = models.DateField('Date de début', null=True, blank=True)
    date_debut_convention = models.DateField(
        'Début de convention', null=True, blank=True
    )
    date_fin_convention = models.DateField('Fin de convention', null=True, blank=True)

    # --- Localisation --------------------------------------------------------
    # Position de la structure, en degrés décimaux (WGS 84, celui du GPS et des
    # cartes) : c'est elle que l'application mobile donne au téléphone pour
    # guider l'employé jusqu'à la porte. Six décimales, soit une dizaine de
    # centimètres - bien plus fin que nécessaire, mais c'est ce que rendent
    # les cartes quand on y copie un point. Facultative : sans elle, le mobile
    # guide vers l'adresse écrite.
    latitude = models.DecimalField(
        'Latitude', max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        'Longitude', max_digits=9, decimal_places=6, null=True, blank=True
    )

    # --- Interlocuteur chez le prestataire --------------------------------
    contact_nom = models.CharField('Nom du contact', max_length=100, blank=True)
    contact_prenoms = models.CharField('Prénoms du contact', max_length=100, blank=True)
    contact_fonction = models.CharField('Fonction du contact', max_length=100, blank=True)
    contact_telephone = models.CharField('Téléphone du contact', max_length=30, blank=True)
    contact_mobile = models.CharField('Mobile du contact', max_length=30, blank=True)

    # --- Pièces professionnelles ------------------------------------------
    # Chaque pièce porte son numéro, sa date et, pour la carte, l'autorité qui
    # l'a délivrée : une pièce sans date ne dit pas si elle court encore, un
    # numéro sans son ordre professionnel ne se vérifie pas. Dates nullables -
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
    # Jusqu'à 34 caractères : les relevés réels portent des numéros longs, parfois
    # avec espaces ou références (« 217199520 100940/44 »).
    compte_bancaire = models.CharField('Compte bancaire', max_length=34, blank=True)
    cle_rib = models.CharField('Clé RIB', max_length=2, blank=True)

    class Meta(Referentiel.Meta):
        abstract = True
