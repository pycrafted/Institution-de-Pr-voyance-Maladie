"""Console d'administration du module Documents."""

from django.contrib import admin

from .models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation, ModelePdf


@admin.register(ModelePdf)
class ModelePdfAdmin(admin.ModelAdmin):
    """
    Les gabarits officiels déposés en base. En lecture seule : ils se déposent
    par la commande ``deposer_modeles`` ou par /api/modeles-pdf/, qui vérifient
    que le fichier est bien un PDF et vident le cache des documents déjà
    fabriqués.
    """

    list_display = ('nom', 'taille', 'depose_le', 'depose_par')
    readonly_fields = ('nom', 'taille', 'empreinte', 'depose_le', 'depose_par')
    exclude = ('contenu',)

    def has_add_permission(self, requete):
        return False

    def has_change_permission(self, requete, obj=None):
        return False


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
