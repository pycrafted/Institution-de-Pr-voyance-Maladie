"""URL des agrégats du tableau de bord, montées sous ``/api/tableau-de-bord/``."""

from django.urls import path

from .views import GraphiquesView, ListesView, TuilesView

urlpatterns = [
    path('tuiles/', TuilesView.as_view(), name='tdb-tuiles'),
    path('graphiques/', GraphiquesView.as_view(), name='tdb-graphiques'),
    path('listes/', ListesView.as_view(), name='tdb-listes'),
]
