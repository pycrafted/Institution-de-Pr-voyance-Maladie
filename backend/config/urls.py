"""
Routage racine.

Chaque module métier expose ses propres URL. On les monte toutes sous ``/api/``
pour coller à ce qu'attend le frontend (cf. services/api.js → API_BASE).
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    # Avant les modules métier : c'est la porte d'entrée, et elle est la seule
    # à ne pas exiger de jeton.
    path('api/auth/', include('authentification.urls')),
    path('api/donnees-de-base/', include('donnees_de_base.urls')),
    path('api/', include('adherents.urls')),
]
