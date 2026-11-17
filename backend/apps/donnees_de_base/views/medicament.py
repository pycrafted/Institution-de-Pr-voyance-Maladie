"""Vue du référentiel Médicament."""

from ..models import Medicament
from ..serializers import MedicamentSerializer
from .base import ReferentielViewSet


class MedicamentViewSet(ReferentielViewSet):
    queryset = Medicament.objects.all()
    serializer_class = MedicamentSerializer

    # Pagination serveur (cf. ReferentielViewSet) : 6 009 médicaments. Recherche
    # sur le code et le libellé, tri par code (l'ordre du modèle). Le segment
    # « Non exclus / Exclus » de l'écran arrive en filtre serveur ``?exclus=``.
    champs_recherche = ('code', 'libelle')
    tris = {'code': ['code'], 'libelle': ['libelle', 'code']}
    tri_defaut = ['code']

    def get_queryset(self):
        queryset = super().get_queryset()
        exclus = self.request.query_params.get('exclus')
        if exclus in ('true', 'false'):
            return queryset.filter(exclus=(exclus == 'true'))
        return queryset
