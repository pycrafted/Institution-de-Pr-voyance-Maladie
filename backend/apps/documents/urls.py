"""
URL du module Documents.

Les clés d'URL reprennent celles du frontend pour un branchement direct :
/api/bons-pharmacie/, /api/lettres-garantie/, /api/bons-optique/ et
/api/lg-hospitalisation/.

S'y ajoute /api/modeles-pdf/, réservée au personnel : le dépôt des gabarits
officiels, pour les serveurs où l'on ne peut pas poser de fichier à la main.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BonOptiqueViewSet,
    BonPharmacieViewSet,
    LettreGarantieViewSet,
    LettreHospitalisationViewSet,
    ModelePdfView,
    ModelesPdfView,
)

router = DefaultRouter()
router.register('bons-pharmacie', BonPharmacieViewSet, basename='bon-pharmacie')
router.register('lettres-garantie', LettreGarantieViewSet, basename='lettre-garantie')
router.register('bons-optique', BonOptiqueViewSet, basename='bon-optique')
router.register('lg-hospitalisation', LettreHospitalisationViewSet, basename='lettre-hospitalisation')

urlpatterns = router.urls + [
    path('modeles-pdf/', ModelesPdfView.as_view(), name='modeles-pdf'),
    path('modeles-pdf/<str:nom>/', ModelePdfView.as_view(), name='modele-pdf'),
]
