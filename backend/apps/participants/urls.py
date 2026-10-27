"""
URL du module Participants.

Les clés d'URL reprennent celles du frontend (« participants »,
« beneficiaires ») pour un branchement direct : /api/participants/ et
/api/beneficiaires/.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BeneficiaireViewSet, DemandePhotoViewSet, NotificationsView, ParticipantViewSet

router = DefaultRouter()
router.register('participants', ParticipantViewSet, basename='participant')
router.register('beneficiaires', BeneficiaireViewSet, basename='beneficiaire')
# Demandes de réinitialisation de photo, déposées depuis l'application mobile.
router.register('demandes-photo', DemandePhotoViewSet, basename='demande-photo')

urlpatterns = [
    # La cloche de l'application de gestion : ce qui attend une action de l'IPM.
    path('notifications/', NotificationsView.as_view(), name='notifications'),
] + router.urls
