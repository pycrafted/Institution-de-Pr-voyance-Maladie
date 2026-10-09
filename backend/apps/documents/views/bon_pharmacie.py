"""Vue des bons de pharmacie."""

from django.http import HttpResponse
from rest_framework.decorators import action

from donnees_de_base.views.base import ReferentielViewSet

from ..impression import bon_pharmacie_pdf
from ..models import BonPharmacie
from ..serializers import BonPharmacieSerializer


class BonPharmacieViewSet(ReferentielViewSet):
    """
    Le socle des référentiels : lister, créer (numéro BPI attribué par le
    serveur), modifier, annuler (activation), modifier en lot. Sans import
    Excel : la page n'en a pas. En plus : le bon imprimé, en PDF.
    """

    queryset = BonPharmacie.objects.select_related(
        'adherent',
        'participant',
        'type_benef',
        'beneficiaire',
        'pharmacie',
        'specialite',
        'prescripteur',
        'cree_par',
    )
    serializer_class = BonPharmacieSerializer
    importer = None

    def perform_create(self, serializer):
        # Numéro du socle, et l'auteur du bon : il figure sur le bon imprimé.
        code = serializer.validated_data.get('code') or BonPharmacie.prochain_code()
        serializer.save(code=code, cree_par=self.request.user)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        Le bon imprimé, au modèle de l'application d'origine (original et
        copie). Tout bon s'imprime, comme dans l'origine - à l'émission
        surtout : c'est lui que le bénéficiaire apporte à la pharmacie.
        """
        bon = self.get_object()
        reponse = HttpResponse(
            bon_pharmacie_pdf(bon, request.user.username), content_type='application/pdf'
        )
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse
