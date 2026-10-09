"""
URL du module Paramètres : /api/taux-prise-en-charge/,
/api/taux-exceptionnels/ et /api/informations-ipm/.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import InformationsIPMView, TauxExceptionnelViewSet, TauxPriseEnChargeViewSet

router = DefaultRouter()
router.register('taux-prise-en-charge', TauxPriseEnChargeViewSet, basename='taux-prise-en-charge')
router.register('taux-exceptionnels', TauxExceptionnelViewSet, basename='taux-exceptionnel')

urlpatterns = router.urls + [
    path('informations-ipm/', InformationsIPMView.as_view(), name='informations-ipm'),
]
