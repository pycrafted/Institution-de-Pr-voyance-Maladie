"""Vue du référentiel Médicament."""

from ..models import Medicament
from ..serializers import MedicamentSerializer
from .base import ReferentielViewSet


class MedicamentViewSet(ReferentielViewSet):
    queryset = Medicament.objects.all()
    serializer_class = MedicamentSerializer
