"""Serializer du référentiel Acte."""

from ..models import Acte
from .base import ReferentielSerializer


class ActeSerializer(ReferentielSerializer):
    class Meta(ReferentielSerializer.Meta):
        model = Acte
        fields = ReferentielSerializer.Meta.fields + [
            'specialite',
            'tarif',
            'exclus',
            'taux',
        ]
