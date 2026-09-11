"""Vue du référentiel Spécialité."""

from ..models import Specialite
from ..serializers import SpecialiteSerializer
from .base import ReferentielViewSet


class SpecialiteViewSet(ReferentielViewSet):
    queryset = Specialite.objects.all()
    serializer_class = SpecialiteSerializer
