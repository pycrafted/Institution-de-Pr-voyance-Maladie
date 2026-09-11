"""Vue du référentiel Type de prestation."""

from ..models import TypePrestation
from ..serializers import TypePrestationSerializer
from .base import ReferentielViewSet


class TypePrestationViewSet(ReferentielViewSet):
    queryset = TypePrestation.objects.all()
    serializer_class = TypePrestationSerializer
