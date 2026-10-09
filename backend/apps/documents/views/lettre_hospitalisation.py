"""Vue des lettres de garantie hospitalisation."""

from donnees_de_base.views.base import ReferentielViewSet

from ..models import LettreHospitalisation
from ..serializers import LettreHospitalisationSerializer


class LettreHospitalisationViewSet(ReferentielViewSet):
    """
    Même socle que les autres documents : lister, créer (numéro attribué par
    le serveur), modifier, annuler, modifier en lot. Sans import Excel, et
    sans impression tant que le modèle de la lettre imprimée manque.
    """

    queryset = LettreHospitalisation.objects.select_related(
        'adherent',
        'participant',
        'type_benef',
        'beneficiaire',
        'prestataire',
        'prestataire__specialite',
        'nature_prestation',
        'specialite',
        'prescripteur',
        'cree_par',
    )
    serializer_class = LettreHospitalisationSerializer
    importer = None

    def perform_create(self, serializer):
        # Numéro du socle, et l'auteur de la lettre.
        code = serializer.validated_data.get('code') or LettreHospitalisation.prochain_code()
        serializer.save(code=code, cree_par=self.request.user)
