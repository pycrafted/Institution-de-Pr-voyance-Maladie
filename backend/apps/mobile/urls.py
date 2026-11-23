"""
URL du module Mobile, montées sous ``/api/mobile/`` par ``config/urls.py``.

Les chemins qu'appelle l'application IPM Mobile (pwa/src/api/).
"""

from django.urls import path

from .cles_acces import (
    CleView,
    ClesView,
    ConnexionOptionsView,
    ConnexionView,
    InscriptionOptionsView,
    InscriptionView,
)
from .compte import ActivationView, MotDePasseView

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
    CompteView,
    ConventionnesView,
    IdentificationView,
    ScanView,
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
    # Le compte : choisir son mot de passe (code de l'IPM), le changer.
    path('activation/', ActivationView.as_view(), name='mobile-activation'),
    path('moi/mot-de-passe/', MotDePasseView.as_view(), name='mobile-mot-de-passe'),
    # Empreinte / Face ID (clés d'accès WebAuthn).
    path('cles/connexion/options/', ConnexionOptionsView.as_view(), name='mobile-cle-connexion-options'),
    path('cles/connexion/', ConnexionView.as_view(), name='mobile-cle-connexion'),
    path('moi/cles/inscription/options/', InscriptionOptionsView.as_view(), name='mobile-cle-inscription-options'),
    path('moi/cles/inscription/', InscriptionView.as_view(), name='mobile-cle-inscription'),
    path('moi/cles/', ClesView.as_view(), name='mobile-cles'),
    path('moi/cles/<int:pk>/', CleView.as_view(), name='mobile-cle'),
    path('moi/', MoiView.as_view(), name='mobile-moi'),
    path('moi/compte/', CompteView.as_view(), name='mobile-compte'),
    path('scan/', ScanView.as_view(), name='mobile-scan'),
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
