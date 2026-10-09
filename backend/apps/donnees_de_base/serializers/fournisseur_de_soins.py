"""
Serializers des fiches de fournisseurs de soins : le fournisseur agréé et la
demande d'agrément qui le précède.

Comme pour les fournisseurs divers, le frontend nomme ses champs en camelCase
et la base en snake_case : ``source`` fait le pont sans imposer ses conventions
à l'autre.

Les deux partagent une même fiche (cf. models/fiche_fournisseur.py), donc un
même serializer de base : un champ ajouté à la fiche l'est des deux côtés.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from ..models import DemandeAgrement, FournisseurDeSoins, Specialite
from .base import ReferentielSerializer


class DateOuVide(serializers.DateField):
    """
    Date facultative telle que le formulaire la manipule.

    Un champ date non saisi arrive comme chaîne vide et doit repartir comme
    chaîne vide ; la base, elle, stocke NULL. La conversion se fait ici, pour
    qu'aucun des deux côtés n'ait à connaître les conventions de l'autre -
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


class Coordonnee(serializers.Field):
    """
    Latitude ou longitude, en degrés décimaux, telle qu'on la saisit vraiment.

    Elle se copie d'une carte (« 14.692778 ») ou se tape sur un clavier
    français (« 14,692778 ») : les deux sont acceptées. Une carte en donne
    souvent sept ou huit décimales ; on arrondit à six (une dizaine de
    centimètres) au lieu de refuser une valeur juste. Vide : pas de position,
    comme pour les dates (cf. DateOuVide), une case vide repart vide.
    """

    default_error_messages = {
        'invalide': 'Nombre attendu, en degrés décimaux (ex. 14.692778).',
        'hors_bornes': 'Doit être compris entre -{borne} et {borne}.',
    }
    SIX_DECIMALES = Decimal('0.000001')

    def __init__(self, borne, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_null', True)
        self.borne = borne
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        # Même contournement que DateOuVide : DRF sérialiserait `null` sans
        # passer par `to_representation`, et le formulaire afficherait « null ».
        valeur = super().get_attribute(instance)
        return '' if valeur is None else valeur

    def to_internal_value(self, data):
        texte = '' if data is None else str(data).strip().replace(',', '.')
        if not texte:
            return None
        try:
            valeur = Decimal(texte)
        except InvalidOperation:
            self.fail('invalide')
        if not valeur.is_finite():
            self.fail('invalide')
        if abs(valeur) > self.borne:
            self.fail('hors_bornes', borne=self.borne)
        return valeur.quantize(self.SIX_DECIMALES, rounding=ROUND_HALF_UP)

    def to_representation(self, value):
        # Un nombre JSON et non une chaîne : la carte du mobile le lit tel quel.
        return float(value) if value not in ('', None) else ''


class FicheFournisseurSerializer(ReferentielSerializer):
    """Champs de la fiche commune. Base abstraite : jamais instanciée seule."""

    # La spécialité circule par son code - « 08 » - car c'est ce que le tableau
    # affiche et ce que le filtre compare. Le queryset vérifie au passage que
    # la catégorie existe vraiment : un code inventé est refusé à l'écriture.
    specialite = serializers.SlugRelatedField(
        slug_field='code',
        queryset=Specialite.objects.all(),
        error_messages={'does_not_exist': 'Spécialité inconnue.'},
        # Obligatoire, mais contrôlée dans `validate` (CHAMPS_REQUIS) plutôt
        # qu'ici : le message y est le même que pour les autres champs exigés.
        required=False,
        allow_null=True,
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

    latitude = Coordonnee(90)
    longitude = Coordonnee(180)

    # Coordonnées complémentaires et dates de convention de la fiche d'origine.
    siteWeb = serializers.CharField(source='site_web', required=False, allow_blank=True)
    dateDebut = DateOuVide(source='date_debut')
    dateDebutConvention = DateOuVide(source='date_debut_convention')
    dateFinConvention = DateOuVide(source='date_fin_convention')

    class Meta(ReferentielSerializer.Meta):
        fields = ReferentielSerializer.Meta.fields + [
            # Champs dont le nom est identique des deux côtés.
            'specialite',
            'adresse',
            'telephone',
            'mobile',
            'email',
            'fax',
            'bp',
            'region',
            'pays',
            'ninea',
            'compte',
            # Champs mappés (déclarés ci-dessus).
            'siteWeb',
            'dateDebut',
            'dateDebutConvention',
            'dateFinConvention',
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
            'latitude',
            'longitude',
        ]

    # Champs exigés sur toute fiche - fournisseur comme demande : ceux que
    # l'application d'origine marque d'un astérisque. Clé : champ du modèle ;
    # valeur : nom du champ à l'écran, sous lequel l'erreur se pose.
    CHAMPS_REQUIS = {
        'libelle': 'libelle',
        'specialite': 'specialite',
    }

    def validate(self, attrs):
        # En modification partielle - action de lot, import d'une fiche
        # existante -, un champ non envoyé garde sa valeur : on le juge sur
        # celle de la fiche.
        erreurs = {}
        for champ, nom in self.CHAMPS_REQUIS.items():
            valeur = attrs[champ] if champ in attrs else getattr(self.instance, champ, None)
            if valeur is None or (isinstance(valeur, str) and not valeur.strip()):
                erreurs[nom] = ['Champ obligatoire.']

        # Une position n'a de sens qu'entière : une latitude sans longitude
        # enverrait l'employé au méridien de Greenwich.
        position = {
            champ: attrs[champ] if champ in attrs else getattr(self.instance, champ, None)
            for champ in ('latitude', 'longitude')
        }
        if (position['latitude'] is None) != (position['longitude'] is None):
            manquant = 'latitude' if position['latitude'] is None else 'longitude'
            erreurs[manquant] = ['La latitude et la longitude vont ensemble : indiquez les deux.']

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return super().validate(attrs)


class FournisseurDeSoinsSerializer(FicheFournisseurSerializer):
    # Déclaré ici pour que le doublon se dise en clair, sous le champ.
    code = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=FournisseurDeSoins.objects.all(),
                message='Ce numéro est déjà celui d’un autre fournisseur.',
            )
        ],
    )

    class Meta(FicheFournisseurSerializer.Meta):
        model = FournisseurDeSoins

    def validate_code(self, valeur):
        # Série commune aux fournisseurs et aux demandes : un numéro porté par
        # une demande lui appartient - sauf celle dont ce fournisseur est né.
        demandes = DemandeAgrement.objects.filter(code=valeur)
        if self.instance is not None:
            demandes = demandes.exclude(fournisseur_id=self.instance.pk)
        demande = demandes.first()
        if demande is None:
            return valeur
        if demande.statut == DemandeAgrement.EN_ATTENTE:
            raise serializers.ValidationError(
                'Ce numéro est réservé par une demande d’agrément en attente.'
            )
        raise serializers.ValidationError('Ce numéro a déjà été attribué par une demande d’agrément.')

    @transaction.atomic
    def update(self, instance, validated_data):
        fournisseur = super().update(instance, validated_data)
        # La demande dont il est né suit son numéro : fournisseur et demande
        # restent désignés par un même numéro.
        DemandeAgrement.objects.filter(fournisseur=fournisseur).exclude(code=fournisseur.code).update(
            code=fournisseur.code
        )
        return fournisseur


class DemandeAgrementSerializer(FicheFournisseurSerializer):
    # Le numéro se saisit ou se corrige. Laissé vide à la création, le serveur
    # donne le suivant de la série commune (cf. DemandeAgrementViewSet).
    code = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=DemandeAgrement.objects.all(),
                message='Ce numéro est déjà celui d’une autre demande d’agrément.',
            )
        ],
    )
    # Facultative : le modèle date la demande du jour si l'écran n'en envoie
    # pas ; vidée, elle reste vide.
    dateDemande = DateOuVide(source='date_demande')

    class Meta(FicheFournisseurSerializer.Meta):
        model = DemandeAgrement
        fields = FicheFournisseurSerializer.Meta.fields + ['dateDemande', 'statut']
        # Le statut ne change que par la validation, jamais par une saisie.
        read_only_fields = FicheFournisseurSerializer.Meta.read_only_fields + ['statut']

    def validate_code(self, valeur):
        if not valeur:
            # Vide : numéroté à la création, inchangé en modification
            # (cf. ReferentielSerializer.update).
            return valeur
        # Série commune : une demande prend le numéro que portera son
        # fournisseur. Il ne peut donc être celui d'un fournisseur existant.
        # (Seules les demandes en attente se modifient : aucune n'a encore de
        # fournisseur.)
        if FournisseurDeSoins.objects.filter(code=valeur).exists():
            raise serializers.ValidationError('Ce numéro est déjà celui d’un fournisseur agréé.')
        return valeur

    # Exigés pour déposer une demande : ceux de toute fiche, plus la date de la
    # demande - les champs que l'application d'origine marque d'un astérisque.
    CHAMPS_REQUIS = {**FicheFournisseurSerializer.CHAMPS_REQUIS, 'date_demande': 'dateDemande'}
