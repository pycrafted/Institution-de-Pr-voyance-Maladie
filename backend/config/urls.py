"""
Routage racine.

Chaque module métier expose ses propres URL. On les monte toutes sous ``/api/``
pour coller à ce qu'attend le frontend (cf. services/api.js → API_BASE).
"""

from django.contrib import admin
from django.urls import include, path

from donnees_de_base.exercices import ExercicesView

urlpatterns = [
    path('admin/', admin.site.urls),
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
    # Ce que porte la barre du haut : la recherche globale.
    path('api/', include('recherche.urls')),
    # Les exercices que la base porte vraiment : tous les modules filtrent
    # dessus, d'où la racine plutôt qu'un préfixe de module.
    path('api/exercices/', ExercicesView.as_view(), name='exercices'),
    # Application IPM Mobile (pwa/) : ses propres jetons, ceux des participants.
    path('api/mobile/', include('mobile.urls')),
]
