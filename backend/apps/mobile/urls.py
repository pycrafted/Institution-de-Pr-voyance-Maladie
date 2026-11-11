"""
URL du module Mobile, montées sous ``/api/mobile/`` par ``config/urls.py``.

Les chemins qu'appelle l'application IPM Mobile (pwa/src/api/).
"""

from django.urls import path

from .views import (
    ArticlesOptiqueView,
    BeneficiairePhotoView,
    BonOptiquePdfView,
    BonOptiqueView,
    BonPdfView,
    BonsOptiqueView,
    DemandePhotoView,
    BonsView,
    BonView,
    ConventionnesView,
    IdentificationView,
    LettrePdfView,
    LettresView,
    LettreView,
    MoiView,
    NotificationsView,
    NaturesPrestationView,
    OpticiensView,
    PhotoView,
    PharmaciesView,
    PrescripteursView,
    SpecialitesView,
)

urlpatterns = [
    path('identification/', IdentificationView.as_view(), name='mobile-identification'),
    path('moi/', MoiView.as_view(), name='mobile-moi'),
    path('moi/photo/', PhotoView.as_view(), name='mobile-photo'),
    path('moi/demandes-photo/', DemandePhotoView.as_view(), name='mobile-demande-photo'),
    path('notifications/', NotificationsView.as_view(), name='mobile-notifications'),
    path(
        'moi/beneficiaires/<str:matricule>/photo/',
        BeneficiairePhotoView.as_view(),
        name='mobile-beneficiaire-photo',
    ),
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
    # Bon d'optique : les opticiens, les articles de la nomenclature, et le bon.
    path('opticiens/', OpticiensView.as_view(), name='mobile-opticiens'),
    path('articles-optique/', ArticlesOptiqueView.as_view(), name='mobile-articles-optique'),
    path('bons-optique/', BonsOptiqueView.as_view(), name='mobile-bons-optique'),
    path('bons-optique/<int:pk>/', BonOptiqueView.as_view(), name='mobile-bon-optique'),
    path('bons-optique/<int:pk>/pdf/', BonOptiquePdfView.as_view(), name='mobile-bon-optique-pdf'),
]
