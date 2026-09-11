"""
URL du module Données de base.

Un référentiel = une entrée dans le routeur. La clé d'URL reprend celle du
frontend (« types-beneficiaires », « types-prestations »…) pour que le
branchement soit direct.
"""

from rest_framework.routers import DefaultRouter

from .views import (
    ArticleAchatViewSet,
    DemandeAgrementViewSet,
    FournisseurDeSoinsViewSet,
    FournisseurDiversViewSet,
    JournalComptableViewSet,
    MedicamentViewSet,
    SpecialiteViewSet,
    StructureEntiteViewSet,
    TypeBeneficiaireViewSet,
    TypePrestationViewSet,
)

router = DefaultRouter()
router.register('types-beneficiaires', TypeBeneficiaireViewSet, basename='type-beneficiaire')
router.register('types-prestations', TypePrestationViewSet, basename='type-prestation')
router.register('specialites', SpecialiteViewSet, basename='specialite')
router.register('articles-achat', ArticleAchatViewSet, basename='article-achat')
router.register('journaux-comptables', JournalComptableViewSet, basename='journal-comptable')
router.register('medicaments', MedicamentViewSet, basename='medicament')
router.register('fournisseurs-divers', FournisseurDiversViewSet, basename='fournisseur-divers')
router.register(
    'fournisseurs-de-soins', FournisseurDeSoinsViewSet, basename='fournisseur-de-soins'
)
router.register('demandes-agrement', DemandeAgrementViewSet, basename='demande-agrement')
router.register('structure', StructureEntiteViewSet, basename='structure-entite')

urlpatterns = router.urls
