"""
Serializer du référentiel Adhérent.

Le frontend nomme ses champs en camelCase (« cotisationIpmSalariale »,
« focalNom »…) ; la base les stocke en snake_case. On mappe les uns sur les
autres via ``source`` pour préserver le contrat du frontend sans polluer le
schéma de la base - même parti pris que le fournisseur divers.
"""

from rest_framework import serializers

from donnees_de_base.serializers.base import ReferentielSerializer

from ..models import Adherent


class AdherentSerializer(ReferentielSerializer):
    regulSystematique = serializers.BooleanField(source='regul_systematique', required=False)
    cotisationIpmSalariale = serializers.CharField(
        source='cotisation_ipm_salariale', required=False, allow_blank=True
    )
    cotisationIpmPatronale = serializers.CharField(
        source='cotisation_ipm_patronale', required=False, allow_blank=True
    )
    cotisationMss = serializers.CharField(
        source='cotisation_mss', required=False, allow_blank=True
    )
    seuilEndettement = serializers.CharField(
        source='seuil_endettement', required=False, allow_blank=True
    )
    seuilConsommation = serializers.CharField(
        source='seuil_consommation', required=False, allow_blank=True
    )
    focalNom = serializers.CharField(source='focal_nom', required=False, allow_blank=True)
    focalTelephone = serializers.CharField(
        source='focal_telephone', required=False, allow_blank=True
    )
    focalEmail = serializers.EmailField(source='focal_email', required=False, allow_blank=True)

    class Meta(ReferentielSerializer.Meta):
        model = Adherent
        fields = ReferentielSerializer.Meta.fields + [
            # Champs dont le nom est identique des deux côtés.
            'type',
            'compte',
            'adresse',
            'telephone',
            # Champs mappés (déclarés ci-dessus).
            'regulSystematique',
            'cotisationIpmSalariale',
            'cotisationIpmPatronale',
            'cotisationMss',
            'seuilEndettement',
            'seuilConsommation',
            'focalNom',
            'focalTelephone',
            'focalEmail',
        ]
