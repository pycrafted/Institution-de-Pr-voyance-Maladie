"""Serializer du référentiel Article d'achat."""

from rest_framework import serializers

from ..models import ArticleAchat
from .base import ReferentielSerializer


class ArticleAchatSerializer(ReferentielSerializer):
    # Le frontend attend la clé camelCase « prixUnitaire » ; la base stocke en
    # snake_case. On mappe via source.
    prixUnitaire = serializers.IntegerField(source='prix_unitaire', required=False, min_value=0)

    class Meta(ReferentielSerializer.Meta):
        model = ArticleAchat
        fields = ReferentielSerializer.Meta.fields + ['prixUnitaire', 'compte']
