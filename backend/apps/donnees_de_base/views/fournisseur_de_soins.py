"""Vue du référentiel Fournisseur de soins."""

from ..models import FournisseurDeSoins
from ..serializers import FournisseurDeSoinsSerializer
from .base import ReferentielViewSet


class FournisseurDeSoinsViewSet(ReferentielViewSet):
    # `select_related` : la liste affiche le code de la spécialité de chaque
    # ligne. Sans lui, soixante-dix fiches déclencheraient soixante-dix
    # requêtes supplémentaires.
    queryset = FournisseurDeSoins.objects.select_related('specialite')
    serializer_class = FournisseurDeSoinsSerializer
