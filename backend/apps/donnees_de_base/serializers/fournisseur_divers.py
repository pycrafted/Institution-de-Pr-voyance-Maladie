"""
Serializer du référentiel Fournisseur divers.

Le frontend nomme ses champs en camelCase (« delaiReglement », « contactNom »…) ;
la base les stocke en snake_case. On mappe les uns sur les autres via ``source``
pour préserver le contrat du frontend sans polluer le schéma de la base.
"""

from rest_framework import serializers

from ..models import FournisseurDivers
from .base import ReferentielSerializer


class FournisseurDiversSerializer(ReferentielSerializer):
    delaiReglement = serializers.CharField(
        source='delai_reglement', required=False, allow_blank=True
    )
    contactNom = serializers.CharField(source='contact_nom', required=False, allow_blank=True)
    contactTelephone = serializers.CharField(
        source='contact_telephone', required=False, allow_blank=True
    )
    banqueNom = serializers.CharField(source='banque_nom', required=False, allow_blank=True)
    banqueCode = serializers.CharField(source='banque_code', required=False, allow_blank=True)
    guichetCode = serializers.CharField(source='guichet_code', required=False, allow_blank=True)
    compteBancaire = serializers.CharField(
        source='compte_bancaire', required=False, allow_blank=True
    )
    cleRib = serializers.CharField(source='cle_rib', required=False, allow_blank=True)

    class Meta(ReferentielSerializer.Meta):
        model = FournisseurDivers
        fields = ReferentielSerializer.Meta.fields + [
            # Champs dont le nom est identique des deux côtés.
            'adresse',
            'telephone',
            'email',
            'ninea',
            # Champs mappés (déclarés ci-dessus).
            'delaiReglement',
            'contactNom',
            'contactTelephone',
            'banqueNom',
            'banqueCode',
            'guichetCode',
            'compteBancaire',
            'cleRib',
        ]
