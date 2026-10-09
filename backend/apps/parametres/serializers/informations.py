"""
Serializer des informations générales de l'IPM.

Champs de l'onglet « Informations Générales IPM » : l'identité de la caisse,
la personne à contacter, le logo et le point du plan.
"""

from rest_framework import serializers

from ..models import InformationsIPM


class InformationsIPMSerializer(serializers.ModelSerializer):
    boitePostale = serializers.CharField(
        source='boite_postale', required=False, allow_blank=True,
    )
    contactNom = serializers.CharField(source='contact_nom', required=False, allow_blank=True)
    contactTelephone = serializers.CharField(
        source='contact_telephone', required=False, allow_blank=True,
    )
    contactEmail = serializers.EmailField(
        source='contact_email', required=False, allow_blank=True,
    )

    class Meta:
        model = InformationsIPM
        fields = [
            'id',
            'intitule',
            'adresse',
            'telephone',
            'fax',
            'boitePostale',
            'email',
            'contactNom',
            'contactTelephone',
            'contactEmail',
            'logo',
            'latitude',
            'longitude',
            'modifie_le',
        ]
        read_only_fields = ['id', 'modifie_le']
        extra_kwargs = {
            'intitule': {'required': False, 'allow_blank': True},
            'adresse': {'required': False, 'allow_blank': True},
            'telephone': {'required': False, 'allow_blank': True},
            'fax': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'logo': {'required': False, 'allow_blank': True},
            'latitude': {'required': False, 'allow_blank': True},
            'longitude': {'required': False, 'allow_blank': True},
        }
