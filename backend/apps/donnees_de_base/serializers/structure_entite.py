"""Serializer du référentiel Structure."""

from ..models import StructureEntite
from .base import ReferentielSerializer


class StructureEntiteSerializer(ReferentielSerializer):
    class Meta(ReferentielSerializer.Meta):
        model = StructureEntite
        fields = ReferentielSerializer.Meta.fields + ['type', 'parent']
