"""Vue des bons optique."""

from django.http import HttpResponse
from rest_framework.decorators import action

from donnees_de_base.views.base import ReferentielViewSet

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

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Le bon imprimé, au modèle de l'application d'origine (original et copie)."""
        bon = self.get_object()
        reponse = HttpResponse(bon_optique_pdf(bon, request.user), content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse
