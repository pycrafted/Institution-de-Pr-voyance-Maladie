"""URL du module Traitements."""

from rest_framework.routers import DefaultRouter

from .views import (
    BanqueViewSet,
    FactureViewSet,
    OrdrePaiementViewSet,
    RemboursementViewSet,
    SuspensionsViewSet,
)

router = DefaultRouter()
router.register('factures', FactureViewSet, basename='facture')
router.register('banques', BanqueViewSet, basename='banque')
router.register('ordres-paiement', OrdrePaiementViewSet, basename='ordre-paiement')
router.register('suspensions', SuspensionsViewSet, basename='suspension')
router.register('remboursements', RemboursementViewSet, basename='remboursement')

urlpatterns = router.urls
