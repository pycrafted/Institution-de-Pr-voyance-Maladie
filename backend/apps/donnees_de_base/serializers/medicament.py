"""Serializer du référentiel Médicament."""

from ..models import Medicament
from .base import ReferentielSerializer


class MedicamentSerializer(ReferentielSerializer):
    class Meta(ReferentielSerializer.Meta):
        model = Medicament
        fields = ReferentielSerializer.Meta.fields + [
            'prestation',
            'compte',
            'exclus',
            'tarif',
        ]
