"""Vue du référentiel Fournisseur divers."""

from ..models import FournisseurDivers
from ..serializers import FournisseurDiversSerializer
from .base import ReferentielViewSet


class FournisseurDiversViewSet(ReferentielViewSet):
    queryset = FournisseurDivers.objects.all()
    serializer_class = FournisseurDiversSerializer
