"""Serializers du module Données de base."""

from .acte import ActeSerializer
from .article_achat import ArticleAchatSerializer
from .fournisseur_de_soins import DemandeAgrementSerializer, FournisseurDeSoinsSerializer
from .fournisseur_divers import FournisseurDiversSerializer
from .journal_comptable import JournalComptableSerializer
from .medicament import MedicamentSerializer
from .specialite import SpecialiteSerializer
from .structure_entite import StructureEntiteSerializer
from .type_beneficiaire import TypeBeneficiaireSerializer
from .type_prestation import TypePrestationSerializer

__all__ = [
    'TypeBeneficiaireSerializer',
    'TypePrestationSerializer',
    'SpecialiteSerializer',
    'ActeSerializer',
    'ArticleAchatSerializer',
    'JournalComptableSerializer',
    'MedicamentSerializer',
    'FournisseurDiversSerializer',
    'FournisseurDeSoinsSerializer',
    'DemandeAgrementSerializer',
    'StructureEntiteSerializer',
]
