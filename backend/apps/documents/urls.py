"""
URL du module Documents.

Les clés d'URL reprennent celles du frontend pour un branchement direct :
/api/bons-pharmacie/, /api/lettres-garantie/, /api/bons-optique/ et
/api/lg-hospitalisation/.
"""

from rest_framework.routers import DefaultRouter

from .views import (
    BonOptiqueViewSet,
    BonPharmacieViewSet,
    LettreGarantieViewSet,
    LettreHospitalisationViewSet,
)

router = DefaultRouter()
router.register('bons-pharmacie', BonPharmacieViewSet, basename='bon-pharmacie')
router.register('lettres-garantie', LettreGarantieViewSet, basename='lettre-garantie')
router.register('bons-optique', BonOptiqueViewSet, basename='bon-optique')
router.register('lg-hospitalisation', LettreHospitalisationViewSet, basename='lettre-hospitalisation')

urlpatterns = router.urls
