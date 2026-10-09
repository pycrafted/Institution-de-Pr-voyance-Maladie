"""
Serializers des taux de prise en charge.

Noms de champs de l'écran (cf. src/views/parametres/) : la société, la nature
de prestation et le type de bénéficiaire circulent par leur code ; leurs
intitulés reviennent en lecture, comme le compte comptable - que l'écran
d'origine montre grisé.
"""

from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire, TypePrestation
from participants.models import Participant

from ..models import TauxExceptionnel, TauxPriseEnCharge

# Dossiers clos : la couverture a pris fin, un taux qui la vise n'a plus
# d'objet. Mêmes valeurs que l'état du participant (cf. participants.models).
DOSSIERS_CLOS = ('Résilié', 'Radié')


def lien(source, modele, message, slug='code'):
    """
    Tiers désigné par son code ; un code inconnu est refusé en clair.
    ``source`` à None quand le champ porte déjà le nom de la colonne (DRF
    refuse une source identique au nom du champ).
    """
    options = {'source': source} if source else {}
    return serializers.SlugRelatedField(
        slug_field=slug,
        queryset=modele.objects.all(),
        error_messages={'does_not_exist': message},
        **options,
    )


class TauxCommunSerializer(serializers.ModelSerializer):
    """Le trio taux / plafond / forfait, et le compte de la prestation."""

    taux = serializers.IntegerField(
        min_value=0,
        max_value=100,
        error_messages={
            'min_value': 'Le taux doit être compris entre 0 et 100.',
            'max_value': 'Le taux doit être compris entre 0 et 100.',
        },
    )
    plafond = serializers.IntegerField(min_value=0, required=False)
    forfait = serializers.IntegerField(min_value=0, required=False)

    prestation = lien(None, TypePrestation, 'Nature de prestation inconnue.')
    intitule = serializers.CharField(source='prestation.libelle', read_only=True)
    compte = serializers.CharField(read_only=True)


class TauxPriseEnChargeSerializer(TauxCommunSerializer):
    codeSoc = lien('adherent', Adherent, 'Société inconnue.')
    societe = serializers.CharField(source='adherent.libelle', read_only=True)
    typeBenef = lien('type_benef', TypeBeneficiaire, 'Type de bénéficiaire inconnu.')
    typeBenefLibelle = serializers.CharField(source='type_benef.libelle', read_only=True)

    class Meta:
        model = TauxPriseEnCharge
        fields = [
            'id',
            'codeSoc',
            'societe',
            'prestation',
            'intitule',
            'typeBenef',
            'typeBenefLibelle',
            'taux',
            'plafond',
            'forfait',
            'compte',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']
        validators = [
            UniqueTogetherValidator(
                queryset=TauxPriseEnCharge.objects.all(),
                fields=['codeSoc', 'prestation', 'typeBenef'],
                message='Cette société a déjà un taux pour cette prestation et ce type de bénéficiaire.',
            )
        ]


class TauxExceptionnelSerializer(TauxCommunSerializer):
    """
    Taux ciblé sur une personne. La société n'est pas saisie : c'est celle du
    participant.
    """

    matriculePart = lien(
        'participant', Participant, 'Aucun participant ne porte ce matricule.', slug='matricule',
    )
    beneficiaire = serializers.SerializerMethodField()
    codeSoc = serializers.SerializerMethodField()

    class Meta:
        model = TauxExceptionnel
        fields = [
            'id',
            'matriculePart',
            'beneficiaire',
            'codeSoc',
            'prestation',
            'intitule',
            'taux',
            'plafond',
            'forfait',
            'compte',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']
        validators = [
            UniqueTogetherValidator(
                queryset=TauxExceptionnel.objects.all(),
                fields=['matriculePart', 'prestation'],
                message='Ce participant a déjà un taux exceptionnel pour cette prestation.',
            )
        ]

    def validate_matriculePart(self, participant):
        # L'exception accordée à quelqu'un dont la couverture a pris fin ne
        # s'appliquerait jamais : elle ne ferait qu'encombrer le barème.
        if participant.etat in DOSSIERS_CLOS:
            raise serializers.ValidationError(
                f'Le dossier de {participant.nom_complet} est {participant.etat.lower()} : '
                'un taux exceptionnel ne s’y applique plus.'
            )
        return participant

    def get_beneficiaire(self, taux):
        return taux.participant.nom_complet if taux.participant_id else ''

    def get_codeSoc(self, taux):
        participant = taux.participant
        return participant.adherent.code if participant and participant.adherent_id else ''
