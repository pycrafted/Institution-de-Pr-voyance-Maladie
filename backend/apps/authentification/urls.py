"""
URL du module Authentification.

Les trois chemins appelés par ``src/services/api.js``, montés sous
``/api/auth/`` par ``config/urls.py``.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import LoginView, LogoutView, MoiView, UtilisateursViewSet

router = DefaultRouter()
router.register('utilisateurs', UtilisateursViewSet, basename='utilisateur')

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', MoiView.as_view(), name='auth-me'),
] + router.urls
