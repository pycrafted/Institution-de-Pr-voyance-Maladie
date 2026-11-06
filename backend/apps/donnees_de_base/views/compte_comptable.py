# -*- coding: utf-8 -*-
"""
Plan Comptable Général - menu Comptabilité (capture 73).

Liste à gauche, formulaire à droite : on clique une ligne, elle se charge dans
le formulaire ; « Nouveau Compte » le vide, « Modifier » enregistre.

Deux choses que l'écran de LAMPS ne montre pas, et que celui-ci ajoute parce
que nous avons de quoi les calculer :

- **le solde réel** de chaque compte, tiré des 396 873 écritures reprises.
  L'original affiche « Solde du Compte (0) » pour tout le monde, sa table
  `plancompta` n'ayant pas de colonne de solde ;
- **qui cite le compte**. Chez LAMPS, le plan comptable *est* le référentiel :
  les spécialités, prestations, adhérents, banques et cotisations ne sont que
  des vues de `plancompta`. Chez nous ce sont des tables distinctes, chacune
  portant son `compte` - l'écran dit donc d'où un compte est utilisé, ce qui
  évite de retirer sous le pied d'un référentiel le numéro qu'il désigne.
"""

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce, Length
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from adherents.models import Adherent
from traitements.models import EcritureCompta

from ..models import (
    ArticleAchat,
    CompteComptable,
    FournisseurDeSoins,
    JournalComptable,
    Medicament,
    Specialite,
    TypePrestation,
)

# Les référentiels qui désignent un compte, et le nom qu'on en donne à
# l'écran. L'ordre est celui de la lecture : du soin vers la trésorerie.
PORTEURS = [
    (Specialite, 'compte', 'Spécialité'),
    (TypePrestation, 'compte', 'Type de prestation'),
    (ArticleAchat, 'compte', "Article d'achat"),
    (Medicament, 'compte', 'Médicament'),
    (FournisseurDeSoins, 'compte', 'Fournisseur de soins'),
    (JournalComptable, 'compte', 'Journal comptable'),
    (Adherent, 'compte', 'Adhérent'),
]


class PaginationPlan(PageNumberPagination):
    """15 par page, comme l'original ; le sélecteur passe par ``?taille=``."""

    page_size = 15
    page_size_query_param = 'taille'
    max_page_size = 500

    def get_paginated_response(self, data):
        return Response({
            'nombre': self.page.paginator.count,
            'pages': self.page.paginator.num_pages,
            'page': self.page.number,
            'resultats': data,
        })


class CompteSerializer(serializers.ModelSerializer):
    typeCompte = serializers.CharField(source='type_compte', required=False)
    sousCompte = serializers.CharField(source='sous_compte', required=False, allow_blank=True)
    # Calculés par la vue (cf. `_enrichir`), jamais stockés.
    solde = serializers.IntegerField(read_only=True, default=0)
    usages = serializers.ListField(read_only=True, default=list)

    class Meta:
        model = CompteComptable
        fields = [
            'id', 'code', 'libelle', 'niveau', 'sousCompte', 'classe',
            'typeCompte', 'actif', 'solde', 'usages',
        ]

    def validate_code(self, valeur):
        """
        « minimum 6 caractères », comme le rappelle le formulaire d'origine.

        La règle ne vaut qu'à la saisie : les classes, niveaux et sous-comptes
        repris de LAMPS sont plus courts, et c'est normal - ce ne sont pas des
        comptes où l'on écrit.
        """
        numero = (valeur or '').strip()
        if len(numero) < 6:
            raise serializers.ValidationError('Un compte général fait au moins 6 caractères.')
        if not numero.isdigit():
            raise serializers.ValidationError('Un compte général ne porte que des chiffres.')
        return numero


class CompteComptableViewSet(viewsets.ModelViewSet):
    """Le plan comptable : consultation, création, modification, désactivation."""

    serializer_class = CompteSerializer
    pagination_class = PaginationPlan
    # Seuls les vrais comptes. En deçà de quatre caractères, ce sont les étages
    # du plan (classe « 7 », niveau « 27 », sous-compte « 400 ») : LAMPS les
    # garde dans la même table et les écarte de la même façon de ses listes.
    queryset = CompteComptable.objects.annotate(taille=Length('code')).filter(taille__gt=3)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action not in ('list', 'etat'):
            return CompteComptable.objects.all()

        params = self.request.query_params
        type_compte = (params.get('type') or '').strip()
        if type_compte and type_compte.lower() != 'tous':
            queryset = queryset.filter(type_compte=type_compte)

        terme = (params.get('recherche') or '').strip()
        if terme:
            queryset = queryset.filter(Q(code__icontains=terme) | Q(libelle__icontains=terme))
        return queryset

    # ------------------------------------------------------------- enrichir

    def _soldes(self, comptes):
        """
        Le solde de chaque compte affiché, en **une** requête.

        Débit moins crédit, sur toutes les écritures du compte. Les montants
        peuvent être négatifs (une annulation se pose en négatif du même côté),
        la somme en tient compte d'elle-même.
        """
        lignes = (
            EcritureCompta.objects.filter(comptegen__in=comptes)
            .values('comptegen')
            .annotate(debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0))
        )
        return {l['comptegen']: (l['debit'] or 0) - (l['credit'] or 0) for l in lignes}

    def _usages(self, comptes):
        """Les référentiels qui désignent chacun de ces comptes."""
        trouves = {}
        for modele, champ, nom in PORTEURS:
            for numero in modele.objects.filter(**{'%s__in' % champ: comptes}).values_list(
                champ, flat=True
            ).distinct():
                trouves.setdefault(numero, []).append(nom)
        return trouves

    def _enrichir(self, donnees, comptes):
        soldes, usages = self._soldes(comptes), self._usages(comptes)
        for ligne in donnees:
            ligne['solde'] = soldes.get(ligne['code'], 0)
            ligne['usages'] = usages.get(ligne['code'], [])
        return donnees

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        donnees = self.get_serializer(page, many=True).data
        self._enrichir(donnees, [l['code'] for l in donnees])
        return self.get_paginated_response(donnees)

    def retrieve(self, request, *args, **kwargs):
        donnees = self.get_serializer(self.get_object()).data
        self._enrichir([donnees], [donnees['code']])
        return Response(donnees)

    # --------------------------------------------------------------- actions

    def destroy(self, request, *args, **kwargs):
        """
        On ne supprime pas un compte : on le désactive.

        L'original porte une corbeille sur chaque ligne. Nous nous en tenons à
        la règle de l'application (cf. `ReferentielViewSet.destroy`), et pour
        une raison qui vaut ici plus qu'ailleurs : **396 873 écritures
        désignent ces comptes par leur numéro**. Un compte effacé, et dix ans
        de grand livre n'affichent plus qu'un nombre sans intitulé.

        Un compte qui porte des écritures ou qu'un référentiel désigne ne se
        désactive même pas : il est refusé, en disant pourquoi.
        """
        compte = self.get_object()
        ecritures = EcritureCompta.objects.filter(comptegen=compte.code).count()
        usages = self._usages([compte.code]).get(compte.code, [])
        if ecritures or usages:
            raisons = []
            if ecritures:
                raisons.append('%d écriture%s' % (ecritures, 's' if ecritures > 1 else ''))
            if usages:
                raisons.append(', '.join(usages).lower())
            return Response(
                {
                    'detail': 'Le compte %s est utilisé (%s) : il ne peut pas être retiré.'
                    % (compte.code, ' et '.join(raisons))
                },
                status=status.HTTP_409_CONFLICT,
            )
        compte.actif = False
        compte.save(update_fields=['actif', 'modifie_le'])
        return Response(self.get_serializer(compte).data)

    @action(detail=False, methods=['get'])
    def repartition(self, request):
        """
        Le compte de chaque segment, pour le sélecteur du haut. « Tous » y
        figure en premier, comme dans l'original.
        """
        base = super().get_queryset()
        parts = {}
        for type_compte in base.values_list('type_compte', flat=True):
            parts[type_compte] = parts.get(type_compte, 0) + 1
        resultat = [
            {'valeur': cle, 'libelle': cle, 'nombre': parts.get(cle, 0)}
            for cle in sorted(parts)
        ]
        resultat.append({'valeur': 'tous', 'libelle': 'Tous', 'nombre': base.count()})
        return Response(resultat)
