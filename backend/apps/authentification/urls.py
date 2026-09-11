"""
URL du module Authentification.

Les trois chemins appelés par ``src/services/api.js``, montés sous
``/api/auth/`` par ``config/urls.py``.
"""

from django.urls import path

from .views import LoginView, LogoutView, MoiView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', MoiView.as_view(), name='auth-me'),
]
