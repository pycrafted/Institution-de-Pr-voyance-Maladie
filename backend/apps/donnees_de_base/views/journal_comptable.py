"""Vue du référentiel Journal comptable."""

from ..models import JournalComptable
from ..serializers import JournalComptableSerializer
from .base import ReferentielViewSet


class JournalComptableViewSet(ReferentielViewSet):
    queryset = JournalComptable.objects.all()
    serializer_class = JournalComptableSerializer
