"""Console d'administration du module Participants."""

from django.contrib import admin

from .models import Beneficiaire, Participant


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ('matricule', 'nom', 'prenoms', 'adherent', 'etat', 'retraite', 'actif')
    # « Retraité » se déduit du régime de la société (cf. Participant.retraite) :
    # il se lit dans la liste, mais c'est la société qui se filtre.
    list_filter = ('etat', 'adherent', 'adherent__type')
    search_fields = ('matricule', 'nom', 'prenoms')
    ordering = ('matricule',)


@admin.register(Beneficiaire)
class BeneficiaireAdmin(admin.ModelAdmin):
    list_display = ('matricule_benef', 'type_benef', 'prenoms', 'nom', 'participant', 'etat')
    list_filter = ('type_benef', 'etat')
    search_fields = ('matricule_benef', 'nom', 'prenoms', 'participant__matricule')
    ordering = ('matricule_benef',)
