"""Console d'administration du module Documents."""

from django.contrib import admin

from .models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation


@admin.register(BonPharmacie)
class BonPharmacieAdmin(admin.ModelAdmin):
    list_display = ('code', 'date', 'adherent', 'participant', 'beneficiaire', 'pharmacie', 'traite', 'actif')
    list_filter = ('traite', 'actif', 'adherent')
    search_fields = ('code', 'participant__matricule', 'participant__nom', 'numero_facture')
    ordering = ('-code',)


@admin.register(LettreGarantie)
class LettreGarantieAdmin(admin.ModelAdmin):
    list_display = ('code', 'date', 'adherent', 'participant', 'beneficiaire', 'prestataire', 'traite', 'actif')
    list_filter = ('traite', 'actif', 'adherent')
    search_fields = ('code', 'participant__matricule', 'participant__nom', 'numero_facture')
    ordering = ('-code',)


@admin.register(BonOptique)
class BonOptiqueAdmin(admin.ModelAdmin):
    list_display = ('code', 'date', 'adherent', 'participant', 'beneficiaire', 'fournisseur', 'traite', 'actif')
    list_filter = ('traite', 'actif', 'adherent')
    search_fields = ('code', 'participant__matricule', 'participant__nom', 'numero_facture')
    ordering = ('-code',)


@admin.register(LettreHospitalisation)
class LettreHospitalisationAdmin(admin.ModelAdmin):
    list_display = ('code', 'date', 'adherent', 'participant', 'type_structure', 'prestataire', 'traite', 'actif')
    list_filter = ('type_structure', 'categorie', 'traite', 'actif', 'adherent')
    search_fields = ('code', 'participant__matricule', 'participant__nom', 'numero_facture')
    ordering = ('-code',)
