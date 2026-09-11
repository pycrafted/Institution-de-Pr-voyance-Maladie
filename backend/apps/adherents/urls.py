"""
URL du module Adhérents.

La clé d'URL reprend celle du frontend (« adherents ») pour que le branchement
soit direct : /api/adherents/.
"""

from rest_framework.routers import DefaultRouter

from .views import AdherentViewSet

router = DefaultRouter()
router.register('adherents', AdherentViewSet, basename='adherent')

urlpatterns = router.urls
