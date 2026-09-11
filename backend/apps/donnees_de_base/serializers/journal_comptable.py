"""Serializer du référentiel Journal comptable."""

from ..models import JournalComptable
from .base import ReferentielSerializer


class JournalComptableSerializer(ReferentielSerializer):
    class Meta(ReferentielSerializer.Meta):
        model = JournalComptable
        fields = ReferentielSerializer.Meta.fields + ['type', 'compte']
