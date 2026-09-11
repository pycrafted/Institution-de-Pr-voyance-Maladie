"""Vue du référentiel Adhérent."""

from donnees_de_base.views.base import ReferentielViewSet

from ..models import Adherent
from ..serializers import AdherentSerializer


class AdherentViewSet(ReferentielViewSet):
    queryset = Adherent.objects.all()
    serializer_class = AdherentSerializer
