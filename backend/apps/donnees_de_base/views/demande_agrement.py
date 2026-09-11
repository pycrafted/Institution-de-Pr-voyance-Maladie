"""Vue des demandes d'agrément de fournisseurs de soins."""

from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import DemandeAgrement
from ..models.demande_agrement import DemandeDejaTraitee
from ..serializers import DemandeAgrementSerializer, FournisseurDeSoinsSerializer
from .base import ReferentielViewSet


class DemandeAgrementViewSet(ReferentielViewSet):
    # Seules les demandes en attente sont servies : une demande validée est
    # close. Elle ne peut plus être modifiée, supprimée ni validée une seconde
    # fois — toute tentative répond 404. Son historique reste consultable dans
    # l'administration Django.
    queryset = DemandeAgrement.objects.filter(statut=DemandeAgrement.EN_ATTENTE).select_related(
        'specialite'
    )
    serializer_class = DemandeAgrementSerializer

    def perform_create(self, serializer):
        serializer.save(code=DemandeAgrement.prochain_code())

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        """
        Agrée le prestataire : le fournisseur naît avec le numéro suivant de la
        liste, et la demande sort des demandes en attente. Renvoie le
        fournisseur créé.
        """
        demande = self.get_object()
        try:
            fournisseur = demande.valider(request.user)
        except DemandeDejaTraitee:
            return Response(
                {'detail': 'Cette demande vient d’être validée par ailleurs.'},
                status=status.HTTP_409_CONFLICT,
            )
        except IntegrityError:
            # Deux validations simultanées ont visé le même numéro de
            # fournisseur : la transaction a tout annulé, la demande est
            # toujours en attente et peut être validée de nouveau.
            return Response(
                {'detail': 'Numéro de fournisseur pris entre-temps. Validez de nouveau.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(FournisseurDeSoinsSerializer(fournisseur).data, status=status.HTTP_201_CREATED)
