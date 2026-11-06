# -*- coding: utf-8 -*-
"""
Interrogation Compte - le grand livre par compte et l'extrait de compte d'un
tiers (menu Comptabilité, captures 74 à 78).

Ces deux écrans que nous cherchions séparément n'en font qu'un. Six onglets,
un par famille de comptes, et le compte n'est jamais saisi : il est déduit du
référentiel choisi. Choisir la spécialité « 400000 - GENERALISTES », c'est
choisir le compte 400000 - la règle `compte = 4000 + code spécialité` est ici
à l'écran.

Trois choses séparent cet écran du Journal Central, dont il est par ailleurs
la variante :

1. **Les deux colonnes `Frais réel` / `Frais exclus`** sur l'onglet Charges
   Techniques, et sur lui seul. L'écriture porte sa propre liquidation : on
   réaudite une charge sans rouvrir le bon (cf. `EcritureCompta`).
2. **La sélection à cases et son `Solde sélection`.** C'est la mécanique du
   lettrage : on coche une facture et son règlement, le solde de la sélection
   tombe à zéro, le lot est lettrable. Le champ `lettrage` de l'écriture ne
   sert à rien sans cet écran.
3. **Le Lettrage ne s'offre que là où il y a un tiers.** Lettrer, c'est
   apparier un débit et un crédit sur un même tiers ; sur une charge ou une
   banque, il n'y a rien à apparier.

Et un parti pris qui vient de la lecture de la production : **un solde se
calcule par compte × société, jamais par compte seul**. Le compte 521700
porte trois reports à nouveau au 1er janvier 2026, un par société, dont un
d'un franc.
"""

from datetime import date

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.models import CompteComptable

from .impression_extrait import extrait_de_compte_pdf
from .journal_central import MOIS, PaginationJournal
from .models import EcritureCompta

# ---------------------------------------------------------------------------
# Les six onglets
#
# `prefixes` : les comptes généraux que l'onglet interroge. `tiers` : l'onglet
# porte-t-il un tiers (et donc le bouton Lettrage) ? `liquidation` : affiche-t-il
# les deux colonnes Frais réel / Frais exclus ?
#
# Les titres reprennent ceux de l'original, **faute comprise** : la page
# s'intitule « Intérrogation Comptes … », avec un accent de trop. Notre IPM
# refait le design, pas le vocabulaire.
# ---------------------------------------------------------------------------
ONGLETS = {
    'participants': {
        'titre': 'Intérrogation Comptes Participants',
        'prefixes': ['411'],
        'tiers': True,
        'liquidation': False,
    },
    'fournisseurs': {
        'titre': 'Intérrogation Comptes Fournisseurs de Soins',
        'prefixes': ['400'],
        'tiers': True,
        'liquidation': False,
    },
    'adherents': {
        'titre': 'Intérrogation Comptes Adhérents',
        'prefixes': ['463'],
        'tiers': True,
        'liquidation': False,
    },
    'charges': {
        'titre': 'Intérrogation Comptes Charges Techniques',
        'prefixes': ['60'],
        'tiers': False,
        'liquidation': True,
    },
    'banques': {
        'titre': 'Intérrogation Comptes Banques',
        'prefixes': ['521'],
        'tiers': False,
        'liquidation': False,
    },
    # « Autres » : tout le reste du plan. C'est le seul onglet que nous
    # n'ayons pas en capture ; il se déduit des cinq autres par complément,
    # ce qui le rend exact par construction - aucune écriture ne peut
    # échapper aux six onglets réunis.
    'autres': {
        'titre': 'Intérrogation Comptes Autres',
        'prefixes': [],
        'tiers': False,
        'liquidation': False,
    },
}

ONGLET_DEFAUT = 'participants'
# Les prefixes des cinq onglets nommés : « Autres » est leur complément.
PREFIXES_NOMMES = [p for cle, o in ONGLETS.items() if cle != 'autres' for p in o['prefixes']]


def definition(cle):
    return ONGLETS.get(cle) or ONGLETS[ONGLET_DEFAUT]


class EcritureInterrogationSerializer(serializers.ModelSerializer):
    """
    Les colonnes de l'écran. Les mêmes que le Journal Central, plus la
    liquidation portée par l'écriture et le drapeau de lettrage.
    """

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
    fraisReel = serializers.IntegerField(source='frais_reel')
    fraisExclus = serializers.IntegerField(source='frais_exclus')
    lettree = serializers.BooleanField(source='lettrage')

    class Meta:
        model = EcritureCompta
        fields = [
            'id', 'cJl', 'dCompta', 'moisTrait', 'numPiece', 'numCheque',
            'numFactIpm', 'compteGen', 'compteTiers', 'matricule', 'libelle',
            'codeSoc', 'debit', 'credit', 'fraisReel', 'fraisExclus', 'lettree',
        ]


class InterrogationComptesViewSet(viewsets.ReadOnlyModelViewSet):
    """Consultation par compte, avec lettrage et extrait imprimé."""

    serializer_class = EcritureInterrogationSerializer
    pagination_class = PaginationJournal
    queryset = EcritureCompta.objects.only(
        'id', 'codej', 'date_compta', 'date_trait', 'numpiece', 'numcheque',
        'numfactipm', 'comptegen', 'comptetiers', 'matri', 'libelle',
        'codesoc', 'debit', 'credit', 'frais_reel', 'frais_exclus', 'lettrage',
    )

    # --- Filtrage -----------------------------------------------------------

    def onglet(self):
        return (self.request.query_params.get('onglet') or ONGLET_DEFAUT).strip()

    def filtrer_famille(self, queryset, cle):
        """
        Restreint aux comptes de l'onglet. « Autres » est le **complément** des
        cinq familles nommées : ainsi aucune écriture n'échappe aux six onglets.
        """
        prefixes = definition(cle)['prefixes']
        if prefixes:
            famille = Q()
            for prefixe in prefixes:
                famille |= Q(comptegen__startswith=prefixe)
            return queryset.filter(famille)
        reste = Q()
        for prefixe in PREFIXES_NOMMES:
            reste |= Q(comptegen__startswith=prefixe)
        return queryset.exclude(reste)

    def filtrer(self, queryset):
        params = self.request.query_params
        queryset = self.filtrer_famille(queryset, self.onglet())

        # L'exercice se lit sur le mois comptable, comme le Journal Central :
        # c'est l'axe sur lequel l'original range ses écritures.
        exercice = (params.get('exercice') or '').strip()
        if exercice.lower() != 'tous':
            annee = int(exercice) if exercice.isdigit() else date.today().year
            queryset = queryset.filter(date_trait__year=annee)

        # La période, elle, borne la **date de comptabilisation** - celle que
        # la colonne « Date Compta » affiche. L'écran l'ouvre sur l'exercice
        # entier (1er janvier - 31 décembre), comme l'original.
        du = parse_date((params.get('du') or '').strip() or '')
        au = parse_date((params.get('au') or '').strip() or '')
        if du:
            queryset = queryset.filter(date_compta__gte=du)
        if au:
            queryset = queryset.filter(date_compta__lte=au)

        societe = (params.get('societe') or '').strip()
        if societe:
            queryset = queryset.filter(codesoc=societe)

        # Type d'Écriture : le journal. L'original nomme ainsi son sélecteur
        # (« Toutes les Ecritures »), et ses valeurs sont bien les journaux.
        journal = (params.get('journal') or '').strip()
        if journal and journal.upper() != 'ALL':
            queryset = queryset.filter(codej=journal)

        compte = (params.get('compte') or '').strip()
        if compte:
            queryset = queryset.filter(comptegen=compte)

        tiers = (params.get('tiers') or '').strip()
        if tiers:
            queryset = queryset.filter(comptetiers=tiers)

        lettrees = (params.get('lettrees') or '').strip().lower()
        if lettrees in ('oui', 'non'):
            queryset = queryset.filter(lettrage=(lettrees == 'oui'))

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

    # --- Le bandeau -----------------------------------------------------------

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """
        Le bandeau noir : « Total débit: X - Total crédit Y - (Solde: Z) ».

        Agrégé sur **tout** le périmètre filtré, jamais sur la page affichée.
        Le `Solde sélection` du bandeau, lui, se calcule à l'écran : il suit
        les cases cochées, et rien ne sert de le demander au serveur.
        """
        resultat = self.get_queryset().aggregate(
            debit=Coalesce(Sum('debit'), 0),
            credit=Coalesce(Sum('credit'), 0),
            ecritures=Count('id'),
        )
        debit, credit = resultat['debit'] or 0, resultat['credit'] or 0
        return Response({
            'debit': debit,
            'credit': credit,
            'solde': debit - credit,
            'ecritures': resultat['ecritures'],
        })

    # --- Les listes des sélecteurs --------------------------------------------

    @action(detail=False, methods=['get'])
    def onglets(self, request):
        """Les six onglets, leur titre et ce dont ils disposent."""
        return Response([
            {
                'cle': cle,
                'titre': onglet['titre'],
                # Le libellé de l'onglet : le titre sans son préfixe commun.
                'libelle': onglet['titre'].replace('Intérrogation Comptes ', '') or 'Comptes',
                'tiers': onglet['tiers'],
                'liquidation': onglet['liquidation'],
                'comptes': onglet['prefixes'],
            }
            for cle, onglet in ONGLETS.items()
        ])

    @action(detail=False, methods=['get'])
    def comptes(self, request):
        """
        Les comptes **mouvementés** de l'onglet, avec leur intitulé.

        Mouvementés, et non tout le plan : un sélecteur qui propose 196 comptes
        dont trois seulement portent des écritures fait perdre du temps à
        chaque usage. L'intitulé vient du plan comptable ; un compte absent du
        plan - cela arrive dans l'historique repris - s'affiche sous son seul
        numéro plutôt que de disparaître.
        """
        base = self.filtrer_famille(EcritureCompta.objects.all(), self.onglet())
        lignes = (
            base.exclude(comptegen='')
            .values('comptegen')
            .annotate(ecritures=Count('id'))
            .order_by('comptegen')
        )
        codes = [ligne['comptegen'] for ligne in lignes]
        intitules = dict(
            CompteComptable.objects.filter(code__in=codes).values_list('code', 'libelle')
        )
        return Response([
            {
                'compte': ligne['comptegen'],
                'libelle': intitules.get(ligne['comptegen'], ''),
                'ecritures': ligne['ecritures'],
            }
            for ligne in lignes
        ])

    @action(detail=False, methods=['get'])
    def tiers(self, request):
        """
        Les tiers mouvementés de l'onglet (ou du compte choisi).

        Même raison que pour les comptes : l'original déroule ses 412
        prestataires un par un, avec deux flèches ‹ › pour passer au suivant.
        Proposer ceux qui n'ont aucune écriture ferait tourner les flèches à
        vide.
        """
        base = self.filtrer_famille(EcritureCompta.objects.all(), self.onglet())
        compte = (request.query_params.get('compte') or '').strip()
        if compte:
            base = base.filter(comptegen=compte)
        societe = (request.query_params.get('societe') or '').strip()
        if societe:
            base = base.filter(codesoc=societe)
        lignes = (
            base.exclude(comptetiers='')
            .values('comptetiers')
            .annotate(ecritures=Count('id'))
            .order_by('comptetiers')
        )
        return Response([
            {'tiers': ligne['comptetiers'], 'ecritures': ligne['ecritures']}
            for ligne in lignes
        ])

    @action(detail=False, methods=['get'])
    def mois(self, request):
        """Les douze mois, nommés comme dans l'original."""
        return Response([{'valeur': i + 1, 'libelle': m} for i, m in enumerate(MOIS)])

    # --- Le lettrage ----------------------------------------------------------

    @action(detail=False, methods=['post'])
    def lettrer(self, request):
        """
        Lettre les écritures cochées - à condition que leur solde soit nul.

        C'est toute la règle du lettrage : on apparie un débit et un crédit sur
        un même tiers, et un lot qui ne se solde pas n'est pas un
        rapprochement. L'écran l'annonce déjà par son « Solde sélection », mais
        un appel direct à l'API doit se heurter à la même règle - sans quoi le
        drapeau ne voudrait plus rien dire.
        """
        ids = request.data.get('ids') or []
        if not ids:
            return Response(
                {'detail': 'Cochez les écritures à lettrer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lot = EcritureCompta.objects.filter(pk__in=ids)
        resultat = lot.aggregate(
            debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0),
        )
        solde = (resultat['debit'] or 0) - (resultat['credit'] or 0)
        if solde != 0:
            return Response(
                {
                    'detail': f'Solde de la sélection : {solde:+}. '
                    'Un lot ne se lettre que si son solde est nul.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Les tiers doivent être les mêmes : lettrer deux tiers ensemble
        # apparierait la dette de l'un avec le règlement de l'autre.
        tiers = set(lot.values_list('comptetiers', flat=True))
        if len(tiers) > 1:
            return Response(
                {'detail': 'Les écritures lettrées ensemble doivent porter le même tiers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lettrees = lot.update(lettrage=True)
        return Response({'lettrees': lettrees, 'solde': solde})

    @action(detail=False, methods=['post'])
    def delettrer(self, request):
        """Retire le lettrage - un rapprochement se défait aussi."""
        ids = request.data.get('ids') or []
        if not ids:
            return Response(
                {'detail': 'Cochez les écritures à délettrer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        delettrees = EcritureCompta.objects.filter(pk__in=ids).update(lettrage=False)
        return Response({'delettrees': delettrees})

    # --- L'extrait imprimé ----------------------------------------------------

    @action(detail=False, methods=['get'])
    def extrait(self, request):
        """
        L'extrait de compte imprimé - le bouton « Imprimer Extrait ».

        Il imprime **tout le périmètre filtré**, pas la page affichée : un
        extrait tronqué à cinquante lignes ne serait pas un extrait. La borne
        haute protège d'un appel qui redemanderait les 400 000 écritures.
        """
        cle = self.onglet()
        ecritures = list(self.get_queryset()[:5000])
        resultat = self.get_queryset().aggregate(
            debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0),
        )
        contexte = {
            'titre': definition(cle)['titre'],
            'liquidation': definition(cle)['liquidation'],
            'compte': (request.query_params.get('compte') or '').strip(),
            'tiers': (request.query_params.get('tiers') or '').strip(),
            'intitule': (request.query_params.get('intitule') or '').strip(),
            'exercice': (request.query_params.get('exercice') or '').strip(),
            'du': (request.query_params.get('du') or '').strip(),
            'au': (request.query_params.get('au') or '').strip(),
            'debit': resultat['debit'] or 0,
            'credit': resultat['credit'] or 0,
        }
        pdf = extrait_de_compte_pdf(ecritures, contexte)
        nom = contexte['compte'] or contexte['tiers'] or cle
        reponse = HttpResponse(pdf, content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="extrait-{nom}.pdf"'
        return reponse
