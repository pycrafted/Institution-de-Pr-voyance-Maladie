"""
Routage racine.

Chaque module métier expose ses propres URL. On les monte toutes sous ``/api/``
pour coller à ce qu'attend le frontend (cf. services/api.js → API_BASE).
"""

from django.contrib import admin
from django.urls import include, path

from .importer_base import importer_base

urlpatterns = [
    path('admin/', admin.site.urls),
    # Import ponctuel d'une base (transfert vrai_base -> Railway). TEMPORAIRE :
    # désactivé tant que IMPORT_BASE_TOKEN n'est pas posé. À retirer après usage.
    path('api/maintenance/importer-base/', importer_base),
    # Avant les modules métier : c'est la porte d'entrée, et elle est la seule
    # à ne pas exiger de jeton.
    path('api/auth/', include('authentification.urls')),
    path('api/donnees-de-base/', include('donnees_de_base.urls')),
    path('api/', include('adherents.urls')),
    path('api/', include('participants.urls')),
    path('api/', include('documents.urls')),
    path('api/', include('parametres.urls')),
    path('api/', include('traitements.urls')),
    # Agrégats de l'accueil : des chiffres, pas des listes brutes.
    path('api/tableau-de-bord/', include('tableau_de_bord.urls')),
    # Application IPM Mobile (pwa/) : ses propres jetons, ceux des participants.
    path('api/mobile/', include('mobile.urls')),
]
