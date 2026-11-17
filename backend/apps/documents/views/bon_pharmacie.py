"""Vue des bons de pharmacie."""

from django.http import HttpResponse
from rest_framework.decorators import action

from donnees_de_base.views.base import ReferentielViewSet
from donnees_de_base.views.exercice import FiltreExerciceMixin, FiltreStatutDocumentMixin

from ..cache_pdf import pdf_en_cache
from ..impression import bon_pharmacie_pdf
from ..models import BonPharmacie
from ..serializers import BonPharmacieSerializer


class BonPharmacieViewSet(FiltreStatutDocumentMixin, FiltreExerciceMixin, ReferentielViewSet):
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
    # L'exercice se lit sur la date d'émission du document.
    champ_exercice = 'date'
    serializer_class = BonPharmacieSerializer
    importer = None

    # Pagination serveur (cf. ReferentielViewSet) : 66 429 bons ne partent pas
    # en entier. La recherche porte sur le numéro et les noms ; le tri par
    # défaut est le plus récent d'abord (le numéro BPI croît avec le temps).
    champs_recherche = (
        'code',
        'participant__nom',
        'participant__prenoms',
        'participant__matricule',
        'beneficiaire__nom',
        'beneficiaire__prenoms',
        'pharmacie__libelle',
    )
    tris = {
        'code': ['-code'],
        'date': ['-date', '-code'],
        'participant': ['participant__nom', 'participant__prenoms', '-code'],
        'pharmacie': ['pharmacie__libelle', '-code'],
    }
    # Plus récent d'abord. Par la date (indexée) et non le numéro : les bons
    # repris de LAMPS portent de vieux préfixes (TC…, P3A/…) dont l'ordre
    # alphabétique n'a rien de chronologique. Le ``-code`` départage à date égale.
    tri_defaut = ['-date', '-code']

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
            pdf_en_cache(bon, request.user.username, bon_pharmacie_pdf), content_type='application/pdf'
        )
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse
