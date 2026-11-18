from .bon_optique import BonOptiqueViewSet
from .bon_pharmacie import BonPharmacieViewSet
from .lettre_garantie import LettreGarantieViewSet
from .lettre_hospitalisation import LettreHospitalisationViewSet
from .modele_pdf import ModelePdfView, ModelesPdfView

__all__ = [
    'BonOptiqueViewSet',
    'BonPharmacieViewSet',
    'LettreGarantieViewSet',
    'LettreHospitalisationViewSet',
    'ModelePdfView',
    'ModelesPdfView',
]
