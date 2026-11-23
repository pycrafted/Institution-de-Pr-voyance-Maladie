"""URL du module Traitements."""

from rest_framework.routers import DefaultRouter

from .cotisations import CotisationsViewSet
from .interrogation_comptes import InterrogationComptesViewSet
from .journal_central import JournalCentralViewSet
from .mois_comptable import MoisComptableViewSet
from .report_a_nouveau import ReportANouveauViewSet
from .retenues import RetenuesViewSet
from .saisie_journal import SaisieJournalViewSet
from .views import (
    BanqueViewSet,
    BonAchatViewSet,
    FactureViewSet,
    OrdrePaiementViewSet,
    RemboursementViewSet,
    SuspensionsViewSet,
)

router = DefaultRouter()
router.register('factures', FactureViewSet, basename='facture')
router.register('banques', BanqueViewSet, basename='banque')
router.register('ordres-paiement', OrdrePaiementViewSet, basename='ordre-paiement')
router.register('suspensions', SuspensionsViewSet, basename='suspension')
router.register('bons-achats', BonAchatViewSet, basename='bon-achat')
router.register('remboursements', RemboursementViewSet, basename='remboursement')
# La recette : l'appel de cotisation et sa comptabilisation (deux onglets).
router.register('cotisations', CotisationsViewSet, basename='cotisation')
# La depense recuperee : ce que l'IPM a avance pour un agent revient par la
# paie (captures 86-91). Appel, import du fichier de Sage, comptabilisation.
router.register('retenues', RetenuesViewSet, basename='retenue')
# L'ecriture comptable a la main : la seule qui ecrive au grand livre sans
# document source (captures 84-85).
router.register('saisie-journal', SaisieJournalViewSet, basename='saisie-journal')
# Consultation du grand livre (menu Comptabilité).
router.register('journal-central', JournalCentralViewSet, basename='journal-central')
# Grand livre par compte et extrait de compte d'un tiers : le meme ecran.
router.register(
    'interrogation-comptes', InterrogationComptesViewSet, basename='interrogation-comptes',
)
# Les deux entrées du menu « Gestion » du Journal Central (capture 72), qui
# n'ont pas d'écran à elles dans LAMPS :
#   - « Cloture Mensuelle » : la période ouverte avance d'un mois (`params`) ;
#   - « Nouvel exercice »   : le report à nouveau des soldes de bilan au
#     journal RAN, de l'exercice clos sur le suivant.
router.register('mois-comptable', MoisComptableViewSet, basename='mois-comptable')
router.register('report-a-nouveau', ReportANouveauViewSet, basename='report-a-nouveau')

urlpatterns = router.urls
