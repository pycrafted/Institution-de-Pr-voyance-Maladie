"""Vue du référentiel Type de bénéficiaire."""

from ..models import TypeBeneficiaire
from ..serializers import TypeBeneficiaireSerializer
from .base import ReferentielViewSet


class TypeBeneficiaireViewSet(ReferentielViewSet):
    queryset = TypeBeneficiaire.objects.all()
    serializer_class = TypeBeneficiaireSerializer
