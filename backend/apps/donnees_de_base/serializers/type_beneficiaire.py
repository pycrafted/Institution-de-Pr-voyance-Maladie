"""Serializer du référentiel Type de bénéficiaire."""

from ..models import TypeBeneficiaire
from .base import ReferentielSerializer


class TypeBeneficiaireSerializer(ReferentielSerializer):
    class Meta(ReferentielSerializer.Meta):
        model = TypeBeneficiaire
        # Le type de bénéficiaire n'ajoute aucun champ propre : les champs
        # communs (code, libellé, actif) suffisent.
