"""Vue des bons optique."""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.views.base import ReferentielViewSet

from ..cache_pdf import pdf_en_cache
from ..impression_optique import bon_optique_pdf
from ..models import BonOptique
from ..serializers import BonOptiqueSerializer


class BonOptiqueViewSet(ReferentielViewSet):
    """
    Même socle que les bons de pharmacie : lister, créer (numéro BCI attribué
    par le serveur), modifier, annuler, modifier en lot, et le bon imprimé en
    PDF. Sans import Excel.
    """

    queryset = BonOptique.objects.select_related(
        'adherent',
        'participant',
        'type_benef',
        'beneficiaire',
        'fournisseur',
        'fournisseur__specialite',
        'specialite',
        'prescripteur',
        'cree_par',
    )
    serializer_class = BonOptiqueSerializer
    importer = None

    def perform_create(self, serializer):
        # Numéro du socle, et l'auteur du bon : il figure sur le bon imprimé.
        code = serializer.validated_data.get('code') or BonOptique.prochain_code()
        serializer.save(code=code, cree_par=self.request.user)

    def _decider(self, request, accorde):
        bon = self.get_object()
        if not bon.en_attente:
            return Response(
                {'detail': 'Ce bon n’attend aucune validation.'}, status=status.HTTP_400_BAD_REQUEST
            )
        bon.decider(accorde, request.user)
        return Response(self.get_serializer(bon).data)

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        """Accorde un bon pris avant les deux ans : il devient imprimable."""
        return self._decider(request, True)

    @action(detail=True, methods=['post'])
    def refuser(self, request, pk=None):
        """Refuse un bon pris avant les deux ans : il est annulé."""
        return self._decider(request, False)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Le bon imprimé, au modèle de l'application d'origine (original et copie)."""
        bon = self.get_object()
        reponse = HttpResponse(
            pdf_en_cache(bon, request.user, bon_optique_pdf), content_type='application/pdf'
        )
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse
