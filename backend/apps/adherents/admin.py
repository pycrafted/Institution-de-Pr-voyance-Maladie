"""Console d'administration du module Adhérents."""

from django.contrib import admin

from .models import Adherent


@admin.register(Adherent)
class AdherentAdmin(admin.ModelAdmin):
    list_display = ('code', 'type', 'libelle', 'compte', 'actif')
    list_filter = ('type', 'actif')
    search_fields = ('code', 'libelle', 'compte')
    ordering = ('code',)
