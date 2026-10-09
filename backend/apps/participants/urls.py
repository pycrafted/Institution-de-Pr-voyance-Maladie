"""
URL du module Participants.

Les clés d'URL reprennent celles du frontend (« participants »,
« beneficiaires ») pour un branchement direct : /api/participants/ et
/api/beneficiaires/.
"""

from rest_framework.routers import DefaultRouter

from .views import BeneficiaireViewSet, ParticipantViewSet

router = DefaultRouter()
router.register('participants', ParticipantViewSet, basename='participant')
router.register('beneficiaires', BeneficiaireViewSet, basename='beneficiaire')

urlpatterns = router.urls
