"""
Vues des participants et de leurs bénéficiaires.

Elles héritent du socle des référentiels - lister, créer, modifier, supprimer,
activer, modifier en lot (le changement d'état des lignes cochées) - sans sa
numérotation ni son import Excel : un participant et un bénéficiaire
s'identifient par leur matricule, saisi, et la page n'importe rien.
"""

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from donnees_de_base.views.base import ReferentielViewSet

from ..models import Beneficiaire, DemandePhoto, Participant
from ..models.demande_photo import EN_ATTENTE
from ..serializers import BeneficiaireSerializer, DemandePhotoSerializer, ParticipantSerializer


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
    # `type_benef` aussi : la colonne « Type » se lisait sinon par une requête
    # par ligne (3 000 requêtes pour la liste réelle).
    queryset = Beneficiaire.objects.select_related('participant__adherent', 'type_benef')
    serializer_class = BeneficiaireSerializer


class DemandePhotoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Les demandes de réinitialisation de photo venues du mobile, et leur
    instruction : réinitialiser (la photo est effacée, le titulaire la
    repose) ou refuser. Une demande ne se crée pas ici : c'est le titulaire
    qui la dépose, depuis l'application mobile.
    """

    queryset = DemandePhoto.objects.select_related(
        'participant__adherent', 'beneficiaire__type_benef', 'traite_par'
    )
    serializer_class = DemandePhotoSerializer

    def _en_attente(self):
        demande = self.get_object()
        if demande.statut != EN_ATTENTE:
            return demande, Response(
                {'detail': f'Cette demande est déjà {demande.statut.lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return demande, None

    @action(detail=True, methods=['post'])
    def reinitialiser(self, request, pk=None):
        demande, refus = self._en_attente()
        if refus:
            return refus
        demande.reinitialiser(request.user)
        return Response(self.get_serializer(demande).data)

    @action(detail=True, methods=['post'])
    def refuser(self, request, pk=None):
        demande, refus = self._en_attente()
        if refus:
            return refus
        demande.refuser(request.user)
        return Response(self.get_serializer(demande).data)


class NotificationsView(APIView):
    """
    Ce qui attend une action de l'IPM, pour la cloche de l'application de
    gestion : demandes de réinitialisation de photo, et bons d'optique émis
    depuis le mobile avant les deux ans. Calculées à la volée (rien à
    marquer « lu ») : une notification disparaît quand la demande est traitée.
    """

    def get(self, request):
        from documents.models import BonOptique
        from documents.models.bon_optique import VALIDATION_EN_ATTENTE

        elements = []
        photos = DemandePhoto.objects.filter(statut=EN_ATTENTE).count()
        if photos:
            pluriel = 's' if photos > 1 else ''
            elements.append({
                'cle': 'demandes-photo',
                'titre': 'Demandes de photo',
                'message': f'{photos} demande{pluriel} de changement de photo à instruire',
                'nombre': photos,
                'lien': '/participants?onglet=photos',
            })
        optiques = BonOptique.objects.filter(validation=VALIDATION_EN_ATTENTE).count()
        if optiques:
            pluriel = 's' if optiques > 1 else ''
            elements.append({
                'cle': 'bons-optique',
                'titre': 'Bons d’optique à valider',
                'message': (
                    f'{optiques} bon{pluriel} d’optique pris avant les deux ans, '
                    'à accorder ou refuser'
                ),
                'nombre': optiques,
                'lien': '/documents/bons-optique?segment=a-valider',
            })
        return Response({'total': sum(e['nombre'] for e in elements), 'elements': elements})
