"""Serializer du référentiel Spécialité."""

from ..models import Specialite
from .base import ReferentielAvecCompteSerializer


class SpecialiteSerializer(ReferentielAvecCompteSerializer):
    class Meta(ReferentielAvecCompteSerializer.Meta):
        model = Specialite
