"""Vue du référentiel Acte."""

from ..models import Acte
from ..serializers import ActeSerializer
from .base import ReferentielViewSet


class ActeViewSet(ReferentielViewSet):
    queryset = Acte.objects.all()
    serializer_class = ActeSerializer
