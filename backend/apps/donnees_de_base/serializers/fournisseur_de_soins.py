"""
Serializers des fiches de fournisseurs de soins : le fournisseur agréé et la
demande d'agrément qui le précède.

Comme pour les fournisseurs divers, le frontend nomme ses champs en camelCase
et la base en snake_case : ``source`` fait le pont sans imposer ses conventions
à l'autre.

Les deux partagent une même fiche (cf. models/fiche_fournisseur.py), donc un
même serializer de base : un champ ajouté à la fiche l'est des deux côtés.
"""

from rest_framework import serializers

from ..models import DemandeAgrement, FournisseurDeSoins, Specialite
from .base import ReferentielSerializer


class DateOuVide(serializers.DateField):
    """
    Date facultative telle que le formulaire la manipule.

    Un champ date non saisi arrive comme chaîne vide et doit repartir comme
    chaîne vide ; la base, elle, stocke NULL. La conversion se fait ici, pour
    qu'aucun des deux côtés n'ait à connaître les conventions de l'autre —
    sans quoi le formulaire afficherait « null » dans une case vide.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_null', True)
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        # DRF court-circuite `to_representation` quand la valeur vaut None et
        # sérialise `null` sans passer par le champ. On intercepte donc en
        # amont : sans cela, une date non saisie repartirait en `null` et le
        # formulaire afficherait « null » dans une case censée être vide.
        valeur = super().get_attribute(instance)
        return '' if valeur is None else valeur

    def to_internal_value(self, data):
        if data in ('', None):
            return None
        return super().to_internal_value(data)

    def to_representation(self, value):
        return super().to_representation(value) if value else ''


class FicheFournisseurSerializer(ReferentielSerializer):
    """Champs de la fiche commune. Base abstraite : jamais instanciée seule."""

    # La spécialité circule par son code — « 08 » — car c'est ce que le tableau
    # affiche et ce que le filtre compare. Le queryset vérifie au passage que
    # la catégorie existe vraiment : un code inventé est refusé à l'écriture.
    specialite = serializers.SlugRelatedField(
        slug_field='code',
        queryset=Specialite.objects.all(),
    )

    contactNom = serializers.CharField(source='contact_nom', required=False, allow_blank=True)
    contactPrenoms = serializers.CharField(
        source='contact_prenoms', required=False, allow_blank=True
    )
    contactFonction = serializers.CharField(
        source='contact_fonction', required=False, allow_blank=True
    )
    contactTelephone = serializers.CharField(
        source='contact_telephone', required=False, allow_blank=True
    )
    contactMobile = serializers.CharField(source='contact_mobile', required=False, allow_blank=True)

    carteNumero = serializers.CharField(source='carte_numero', required=False, allow_blank=True)
    carteDate = DateOuVide(source='carte_date')
    carteAutorite = serializers.CharField(
        source='carte_autorite', required=False, allow_blank=True
    )
    rcNumero = serializers.CharField(source='rc_numero', required=False, allow_blank=True)
    rcDate = DateOuVide(source='rc_date')
    autorisationNumero = serializers.CharField(
        source='autorisation_numero', required=False, allow_blank=True
    )
    autorisationDate = DateOuVide(source='autorisation_date')

    banqueNom = serializers.CharField(source='banque_nom', required=False, allow_blank=True)
    banqueCode = serializers.CharField(source='banque_code', required=False, allow_blank=True)
    guichetCode = serializers.CharField(source='guichet_code', required=False, allow_blank=True)
    compteBancaire = serializers.CharField(
        source='compte_bancaire', required=False, allow_blank=True
    )
    cleRib = serializers.CharField(source='cle_rib', required=False, allow_blank=True)

    class Meta(ReferentielSerializer.Meta):
        fields = ReferentielSerializer.Meta.fields + [
            # Champs dont le nom est identique des deux côtés.
            'specialite',
            'adresse',
            'telephone',
            'mobile',
            'email',
            'ninea',
            # Champs mappés (déclarés ci-dessus).
            'contactNom',
            'contactPrenoms',
            'contactFonction',
            'contactTelephone',
            'contactMobile',
            'carteNumero',
            'carteDate',
            'carteAutorite',
            'rcNumero',
            'rcDate',
            'autorisationNumero',
            'autorisationDate',
            'banqueNom',
            'banqueCode',
            'guichetCode',
            'compteBancaire',
            'cleRib',
        ]


class FournisseurDeSoinsSerializer(FicheFournisseurSerializer):
    class Meta(FicheFournisseurSerializer.Meta):
        model = FournisseurDeSoins


class DemandeAgrementSerializer(FicheFournisseurSerializer):
    # Facultative à l'écriture : le modèle date la demande du jour si l'écran
    # n'en envoie pas.
    dateDemande = serializers.DateField(source='date_demande', required=False)

    class Meta(FicheFournisseurSerializer.Meta):
        model = DemandeAgrement
        fields = FicheFournisseurSerializer.Meta.fields + ['dateDemande', 'statut']
        # Le numéro est attribué par le serveur, sur l'ensemble des demandes ;
        # le statut ne change que par la validation, jamais par une saisie.
        read_only_fields = FicheFournisseurSerializer.Meta.read_only_fields + ['code', 'statut']
