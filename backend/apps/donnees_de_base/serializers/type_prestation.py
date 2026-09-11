"""Serializer du référentiel Type de prestation."""

from ..models import TypePrestation
from .base import ReferentielAvecCompteSerializer


class TypePrestationSerializer(ReferentielAvecCompteSerializer):
    class Meta(ReferentielAvecCompteSerializer.Meta):
        model = TypePrestation
