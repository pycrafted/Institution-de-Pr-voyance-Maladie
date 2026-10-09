"""Vues du module Données de base."""

from .acte import ActeViewSet
from .article_achat import ArticleAchatViewSet
from .demande_agrement import DemandeAgrementViewSet
from .fournisseur_de_soins import FournisseurDeSoinsViewSet
from .fournisseur_divers import FournisseurDiversViewSet
from .journal_comptable import JournalComptableViewSet
from .medicament import MedicamentViewSet
from .specialite import SpecialiteViewSet
from .structure_entite import StructureEntiteViewSet
from .type_beneficiaire import TypeBeneficiaireViewSet
from .type_prestation import TypePrestationViewSet

__all__ = [
    'TypeBeneficiaireViewSet',
    'TypePrestationViewSet',
    'SpecialiteViewSet',
    'ActeViewSet',
    'ArticleAchatViewSet',
    'JournalComptableViewSet',
    'MedicamentViewSet',
    'FournisseurDiversViewSet',
    'FournisseurDeSoinsViewSet',
    'DemandeAgrementViewSet',
    'StructureEntiteViewSet',
]
