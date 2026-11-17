"""Vue des lettres de garantie."""

from django.http import HttpResponse
from rest_framework.decorators import action

from donnees_de_base.views.base import ReferentielViewSet
from donnees_de_base.views.exercice import FiltreExerciceMixin, FiltreStatutDocumentMixin

from ..cache_pdf import pdf_en_cache
from ..impression_lettre import lettre_garantie_pdf
from ..models import LettreGarantie
from ..serializers import LettreGarantieSerializer


class LettreGarantieViewSet(FiltreStatutDocumentMixin, FiltreExerciceMixin, ReferentielViewSet):
    """
    Même socle que les bons de pharmacie : lister, créer (numéro LGI attribué
    par le serveur), modifier, annuler, modifier en lot, et la lettre
    imprimée en PDF. Sans import Excel.
    """

    queryset = LettreGarantie.objects.select_related(
        'adherent',
        'participant',
        'type_benef',
        'beneficiaire',
        'specialite_prestataire',
        'prestataire',
        'nature_prestation',
        'specialite',
        'prescripteur',
        'cree_par',
    )
    # L'exercice se lit sur la date d'émission du document.
    champ_exercice = 'date'
    serializer_class = LettreGarantieSerializer
    importer = None

    # Pagination serveur (cf. ReferentielViewSet) : 45 906 lettres. Recherche
    # sur le numéro et les noms, tri par défaut au plus récent (par la date).
    champs_recherche = (
        'code',
        'participant__nom',
        'participant__prenoms',
        'participant__matricule',
        'beneficiaire__nom',
        'beneficiaire__prenoms',
        'prestataire__libelle',
    )
    tris = {
        'code': ['-code'],
        'date': ['-date', '-code'],
        'participant': ['participant__nom', 'participant__prenoms', '-code'],
        'prestataire': ['prestataire__libelle', '-code'],
    }
    tri_defaut = ['-date', '-code']

    def perform_create(self, serializer):
        # Numéro du socle, et l'auteur de la lettre : il figure sur la lettre imprimée.
        code = serializer.validated_data.get('code') or LettreGarantie.prochain_code()
        serializer.save(code=code, cree_par=self.request.user)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """La lettre imprimée, au modèle de l'application d'origine (original et copie)."""
        lettre = self.get_object()
        reponse = HttpResponse(
            pdf_en_cache(lettre, request.user.username, lettre_garantie_pdf),
            content_type='application/pdf',
        )
        reponse['Content-Disposition'] = f'inline; filename="{lettre.code}.pdf"'
        return reponse
