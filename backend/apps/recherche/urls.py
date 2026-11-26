"""URL de la barre du haut, montées sous ``/api/``."""

from django.urls import path

from .views import RechercheView

urlpatterns = [
    path('recherche/', RechercheView.as_view(), name='recherche-globale'),
]
