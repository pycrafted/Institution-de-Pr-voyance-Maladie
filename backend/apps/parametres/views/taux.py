"""Vues des taux de prise en charge."""

from rest_framework import status, viewsets
from rest_framework.response import Response

from ..models import TauxExceptionnel, TauxPriseEnCharge
from ..serializers import TauxExceptionnelSerializer, TauxPriseEnChargeSerializer

BAREME_SANS_TROU = (
    'Un taux ne se supprime pas : le barème couvre chaque nature de '
    'prestation pour chaque qualité de bénéficiaire, et la ligne retirée '
    'laisserait ces soins sans prise en charge, sans que rien ne le dise. '
    'Mettez le taux à 0 si la société ne couvre plus ces soins.'
)


class TauxPriseEnChargeViewSet(viewsets.ModelViewSet):
    """
    Les taux d'une société : lister, créer, modifier.

    Pas de suppression. Le barème est un produit complet - chaque société,
    chaque nature de prestation, chaque qualité de bénéficiaire - et c'est sa
    complétude qui fait foi au moment de liquider une facture : une
    combinaison absente n'est pas « zéro », c'est un trou que personne ne voit.
    Un taux qui ne s'applique plus se met à 0 ; il reste alors lisible, et le
    barème reste entier.
    """

    queryset = TauxPriseEnCharge.objects.select_related('adherent', 'prestation', 'type_benef')
    serializer_class = TauxPriseEnChargeSerializer

    def destroy(self, request, *args, **kwargs):
        return Response({'detail': BAREME_SANS_TROU}, status=status.HTTP_405_METHOD_NOT_ALLOWED)


class TauxExceptionnelViewSet(viewsets.ModelViewSet):
    """Les taux ciblés sur une personne."""

    queryset = TauxExceptionnel.objects.select_related('participant__adherent', 'prestation')
    serializer_class = TauxExceptionnelSerializer
