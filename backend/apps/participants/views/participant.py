"""
Vues des participants et de leurs bénéficiaires.

Elles héritent du socle des référentiels - lister, créer, modifier, supprimer,
activer, modifier en lot (le changement d'état des lignes cochées) - sans sa
numérotation ni son import Excel : un participant et un bénéficiaire
s'identifient par leur matricule, saisi, et la page n'importe rien.
"""

from donnees_de_base.views.base import ReferentielViewSet

from ..models import Beneficiaire, Participant
from ..serializers import BeneficiaireSerializer, ParticipantSerializer


class _SansNumerotation(ReferentielViewSet):
    # L'import du socle repose sur un code numéroté : sans objet ici, il n'est
    # pas exposé (une action à None n'est pas routée).
    importer = None

    def perform_create(self, serializer):
        serializer.save()


class ParticipantViewSet(_SansNumerotation):
    queryset = Participant.objects.select_related('adherent')
    serializer_class = ParticipantSerializer


class BeneficiaireViewSet(_SansNumerotation):
    # `select_related` : la liste affiche le nom et la société du participant
    # de chaque ligne, sans une requête par ligne.
    queryset = Beneficiaire.objects.select_related('participant__adherent')
    serializer_class = BeneficiaireSerializer
