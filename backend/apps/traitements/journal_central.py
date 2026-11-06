# -*- coding: utf-8 -*-
"""
Journal Central - la consultation du grand livre (menu Comptabilité).

Reprend l'écran de LAMPS (captures 70 à 72) : quatre filtres - Société,
Exercice, Mois, Journal -, une recherche, un bandeau de contrôle
« Débit / Crédit / Solde », et les treize colonnes des écritures.

**Trois partis pris de conception**, tous dictés par la volumétrie réelle
(396 873 écritures) :

1. **Tout se filtre côté serveur**, la recherche comprise. Rien ne descend
   dans le navigateur pour y être trié.
2. **La liste est paginée côté serveur**, avec le sélecteur « Nombre par
   page » de LAMPS (50 par défaut, cf. capture 60 : LAMPS pagine déjà son
   journal). Ce n'est pas une optimisation mais une condition d'existence :
   **janvier 2022 compte 37 140 écritures** à lui seul, dont 34 082 de report
   à nouveau.
3. **Le bandeau est une agrégation à part** (`totaux`), calculée sur le
   périmètre filtré entier - jamais sur la page affichée. Un solde calculé
   sur 50 lignes tomberait à zéro par hasard, ou annoncerait un faux écart :
   ce serait pire que pas de bandeau du tout.

L'écran est en **lecture seule**. Dans LAMPS on ne saisit pas d'écriture ici ;
c'est l'écran « Saisie Journal » qui le fait, et il n'est pas construit.
"""

from datetime import date

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce, ExtractYear
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .models import EcritureCompta

# Les mois, tels que le sélecteur de LAMPS les nomme.
MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]


class PaginationJournal(PageNumberPagination):
    """
    50 par page, comme LAMPS. Le sélecteur « Nombre par page » passe par
    ``?taille=`` ; la borne haute évite qu'un appel direct ne redemande les
    396 873 lignes d'un coup.
    """

    page_size = 50
    page_size_query_param = 'taille'
    max_page_size = 500

    def get_paginated_response(self, data):
        return Response({
            'nombre': self.page.paginator.count,
            'pages': self.page.paginator.num_pages,
            'page': self.page.number,
            'resultats': data,
        })


class EcritureSerializer(serializers.ModelSerializer):
    """Les treize colonnes de l'écran, dans leur ordre d'affichage."""

    cJl = serializers.CharField(source='codej')
    dCompta = serializers.DateField(source='date_compta')
    moisTrait = serializers.DateField(source='date_trait')
    numPiece = serializers.CharField(source='numpiece')
    numCheque = serializers.CharField(source='numcheque')
    numFactIpm = serializers.CharField(source='numfactipm')
    compteGen = serializers.CharField(source='comptegen')
    compteTiers = serializers.CharField(source='comptetiers')
    matricule = serializers.CharField(source='matri')
    codeSoc = serializers.CharField(source='codesoc')

    class Meta:
        model = EcritureCompta
        fields = [
            'id', 'cJl', 'dCompta', 'moisTrait', 'numPiece', 'numCheque',
            'numFactIpm', 'compteGen', 'compteTiers', 'matricule', 'libelle',
            'codeSoc', 'debit', 'credit',
        ]


class JournalCentralViewSet(viewsets.ReadOnlyModelViewSet):
    """Consultation du grand livre : liste paginée, totaux, exercices."""

    serializer_class = EcritureSerializer
    pagination_class = PaginationJournal
    # `only` : la fiche complète porte des colonnes que l'écran n'affiche pas
    # (numdoc, numfactfrs, numfourn, numtrans, lettrage, date_piece…). Sur
    # 400 000 lignes, ne lire que ce qu'on montre compte.
    queryset = EcritureCompta.objects.only(
        'id', 'codej', 'date_compta', 'date_trait', 'numpiece', 'numcheque',
        'numfactipm', 'comptegen', 'comptetiers', 'matri', 'libelle',
        'codesoc', 'debit', 'credit',
    )

    def filtrer(self, queryset):
        """
        Les quatre filtres de l'écran, plus la recherche.

        L'exercice vaut l'année en cours par défaut : ouvrir le journal sur
        les huit exercices à la fois n'aurait aucun sens comptable, et
        coûterait 400 000 lignes.
        """
        params = self.request.query_params

        exercice = (params.get('exercice') or '').strip()
        if exercice.lower() != 'tous':
            annee = int(exercice) if exercice.isdigit() else date.today().year
            queryset = queryset.filter(date_trait__year=annee)

        mois = (params.get('mois') or '').strip()
        if mois.isdigit() and 1 <= int(mois) <= 12:
            queryset = queryset.filter(date_trait__month=int(mois))

        societe = (params.get('societe') or '').strip()
        if societe:
            queryset = queryset.filter(codesoc=societe)

        journal = (params.get('journal') or '').strip()
        if journal and journal.upper() != 'ALL':
            queryset = queryset.filter(codej=journal)

        terme = (params.get('recherche') or '').strip()
        if terme:
            queryset = queryset.filter(
                Q(libelle__icontains=terme)
                | Q(comptegen__icontains=terme)
                | Q(comptetiers__icontains=terme)
                | Q(matri__icontains=terme)
                | Q(numpiece__icontains=terme)
                | Q(numcheque__icontains=terme)
                | Q(numfactipm__icontains=terme)
            )
        return queryset

    def get_queryset(self):
        return self.filtrer(super().get_queryset())

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """
        Le bandeau de contrôle : « Débit: … - Crédit … - Solde: … ».

        Une seule requête d'agrégation sur **tout** le périmètre filtré. Le
        solde est la seule valeur qui compte : tant qu'il est à zéro, la
        période tient.
        """
        zero = Coalesce(Sum('debit'), 0), Coalesce(Sum('credit'), 0)
        resultat = self.get_queryset().aggregate(debit=zero[0], credit=zero[1])
        debit, credit = resultat['debit'] or 0, resultat['credit'] or 0
        return Response({
            'debit': debit,
            'credit': credit,
            'solde': debit - credit,
            'ecritures': self.get_queryset().count(),
        })

    @action(detail=False, methods=['get'])
    def exercices(self, request):
        """
        Les exercices qui portent des écritures, du plus récent au plus
        ancien. L'année en cours y figure toujours : c'est celle qu'on ouvre
        par défaut, et une période vide est une réponse valable.
        """
        annees = (
            EcritureCompta.objects.exclude(date_trait=None)
            .annotate(an=ExtractYear('date_trait'))
            .values_list('an', flat=True)
            .distinct()
        )
        resultat = sorted({a for a in annees if a}, reverse=True)
        if date.today().year not in resultat:
            resultat.insert(0, date.today().year)
        return Response(resultat)

    @action(detail=False, methods=['get'])
    def mois(self, request):
        """Les douze mois, nommés comme dans LAMPS."""
        return Response([{'valeur': i + 1, 'libelle': m} for i, m in enumerate(MOIS)])
