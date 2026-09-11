"""Vue du référentiel Structure."""

from ..models import StructureEntite
from ..serializers import StructureEntiteSerializer
from .base import ReferentielViewSet


class StructureEntiteViewSet(ReferentielViewSet):
    queryset = StructureEntite.objects.all()
    serializer_class = StructureEntiteSerializer
