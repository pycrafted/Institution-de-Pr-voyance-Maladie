"""Administration Django du module Données de base."""

from django.contrib import admin

from .models import (
    ArticleAchat,
    DemandeAgrement,
    FournisseurDivers,
    JournalComptable,
    Medicament,
    Specialite,
    StructureEntite,
    TypeBeneficiaire,
    TypePrestation,
)


@admin.register(TypeBeneficiaire)
class TypeBeneficiaireAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'actif', 'modifie_le')
    list_filter = ('actif',)
    search_fields = ('code', 'libelle')
    ordering = ('code',)


@admin.register(TypePrestation, Specialite)
class ReferentielAvecCompteAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'compte', 'actif', 'modifie_le')
    list_filter = ('actif',)
    search_fields = ('code', 'libelle', 'compte')
    ordering = ('code',)


@admin.register(ArticleAchat)
class ArticleAchatAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'prix_unitaire', 'compte', 'actif', 'modifie_le')
    list_filter = ('actif',)
    search_fields = ('code', 'libelle', 'compte')
    ordering = ('code',)


@admin.register(JournalComptable)
class JournalComptableAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'type', 'compte', 'actif', 'modifie_le')
    list_filter = ('actif', 'type')
    search_fields = ('code', 'libelle', 'compte')
    ordering = ('code',)


@admin.register(Medicament)
class MedicamentAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'compte', 'exclus', 'tarif', 'actif', 'modifie_le')
    list_filter = ('actif', 'exclus')
    search_fields = ('code', 'libelle')
    ordering = ('code',)


@admin.register(FournisseurDivers)
class FournisseurDiversAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'telephone', 'actif', 'modifie_le')
    list_filter = ('actif',)
    search_fields = ('code', 'libelle', 'telephone', 'ninea')
    ordering = ('code',)


@admin.register(StructureEntite)
class StructureEntiteAdmin(admin.ModelAdmin):
    list_display = ('code', 'libelle', 'type', 'parent', 'actif', 'modifie_le')
    list_filter = ('actif', 'type')
    search_fields = ('code', 'libelle')
    ordering = ('code',)


@admin.register(DemandeAgrement)
class DemandeAgrementAdmin(admin.ModelAdmin):
    # L'écran ne sert que les demandes en attente : c'est ici que se lit
    # l'historique des demandes validées — qui, quand, et le fournisseur né.
    list_display = (
        'code',
        'libelle',
        'specialite',
        'date_demande',
        'statut',
        'fournisseur',
        'valide_par',
        'valide_le',
    )
    list_filter = ('statut', 'specialite')
    search_fields = ('code', 'libelle')
    ordering = ('-code',)
    # La trace de validation se consulte, elle ne se corrige pas à la main.
    readonly_fields = ('statut', 'fournisseur', 'valide_par', 'valide_le')
