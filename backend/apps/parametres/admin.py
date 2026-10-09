"""Console d'administration du module Paramètres."""

from django.contrib import admin

from .models import InformationsIPM, TauxExceptionnel, TauxPriseEnCharge


@admin.register(TauxPriseEnCharge)
class TauxPriseEnChargeAdmin(admin.ModelAdmin):
    list_display = ('adherent', 'prestation', 'type_benef', 'taux', 'plafond', 'forfait')
    list_filter = ('adherent', 'type_benef')
    search_fields = ('prestation__code', 'prestation__libelle')
    ordering = ('adherent__code', 'prestation__code')


@admin.register(TauxExceptionnel)
class TauxExceptionnelAdmin(admin.ModelAdmin):
    list_display = ('participant', 'prestation', 'taux', 'plafond', 'forfait')
    search_fields = ('participant__matricule', 'participant__nom', 'prestation__libelle')
    ordering = ('participant__matricule',)


@admin.register(InformationsIPM)
class InformationsIPMAdmin(admin.ModelAdmin):
    list_display = ('intitule', 'telephone', 'email', 'modifie_le')
