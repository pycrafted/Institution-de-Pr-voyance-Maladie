"""Console d'administration du module Traitements."""

from django.contrib import admin

from .models import Facture


@admin.register(Facture)
class FactureAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'type_fournisseur', 'numero_fournisseur', 'adherent',
        'frais_reel', 'etat', 'recu_le', 'actif',
    )
    list_filter = ('type_fournisseur', 'etat', 'actif', 'adherent')
    search_fields = ('numero_fournisseur',)
    ordering = ('-id',)
