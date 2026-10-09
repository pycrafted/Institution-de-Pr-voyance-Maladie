"""
URL du module Mobile, montées sous ``/api/mobile/`` par ``config/urls.py``.

Les chemins qu'appelle l'application IPM Mobile (pwa/src/api/).
"""

from django.urls import path

from .views import (
    BonPdfView,
    BonsView,
    BonView,
    ConventionnesView,
    IdentificationView,
    LettrePdfView,
    LettresView,
    LettreView,
    MoiView,
    NaturesPrestationView,
    PhotoView,
    PharmaciesView,
    PrescripteursView,
    SpecialitesView,
)

urlpatterns = [
    path('identification/', IdentificationView.as_view(), name='mobile-identification'),
    path('moi/', MoiView.as_view(), name='mobile-moi'),
    path('moi/photo/', PhotoView.as_view(), name='mobile-photo'),
    path('pharmacies/', PharmaciesView.as_view(), name='mobile-pharmacies'),
    path('conventionnes/', ConventionnesView.as_view(), name='mobile-conventionnes'),
    path('specialites/', SpecialitesView.as_view(), name='mobile-specialites'),
    path('prescripteurs/', PrescripteursView.as_view(), name='mobile-prescripteurs'),
    path('bons-pharmacie/', BonsView.as_view(), name='mobile-bons'),
    path('bons-pharmacie/<int:pk>/', BonView.as_view(), name='mobile-bon'),
    path('bons-pharmacie/<int:pk>/pdf/', BonPdfView.as_view(), name='mobile-bon-pdf'),
    path('natures-prestation/', NaturesPrestationView.as_view(), name='mobile-natures'),
    path('lettres-garantie/', LettresView.as_view(), name='mobile-lettres'),
    path('lettres-garantie/<int:pk>/', LettreView.as_view(), name='mobile-lettre'),
    path('lettres-garantie/<int:pk>/pdf/', LettrePdfView.as_view(), name='mobile-lettre-pdf'),
]
