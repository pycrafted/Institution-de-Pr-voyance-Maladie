"""Vue des informations générales de l'IPM."""

from rest_framework.generics import RetrieveUpdateAPIView

from ..models import InformationsIPM
from ..serializers import InformationsIPMSerializer


class InformationsIPMView(RetrieveUpdateAPIView):
    """
    La fiche unique de la caisse : on la lit, on la modifie. Elle naît vide au
    premier appel plutôt que de répondre « introuvable ».
    """

    serializer_class = InformationsIPMSerializer

    def get_object(self):
        return InformationsIPM.actuelles()
