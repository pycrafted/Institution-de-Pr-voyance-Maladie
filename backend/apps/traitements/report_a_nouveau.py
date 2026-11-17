# -*- coding: utf-8 -*-
"""
Report À Nouveau - la vraie « clôture d'exercice » de LAMPS (journal RAN).

LAMPS n'a pas de bouton « clôturer l'exercice » qui verrouille l'année et sort
un résultat. La clôture s'y fait par le **report à nouveau** : on édite la
balance, puis on reporte les soldes de l'exercice clos sur le suivant, en
écritures du journal **RAN** (« R.A.N … », « SOLDE OUVERTURE »). Vérifié sur les
396 873 écritures réelles (cf. docs/lamps/comptabilite-lamps.md) :

- **97 067 écritures RAN** (24,5 % du grand livre) - c'est un journal à part
  entière, pas un sous-produit.
- Le RAN ne porte que les comptes de **bilan** (classes 1, 2, 4, 5) et **jamais**
  les classes 6/7 (charges/produits) : à la clôture, charges et produits
  repartent de zéro, seul le bilan se reporte. C'est la règle qu'on applique ici.
- Il n'est pas équilibré au centime d'une année sur l'autre (l'écart est le
  résultat non encore affecté) : LAMPS ne l'impose pas, nous non plus.

On reporte donc, par compte général et par tiers, le **solde cumulé** de tous les
exercices jusqu'à l'exercice clos inclus, en une écriture RAN datée du 1er janvier
de l'exercice suivant. Un solde débiteur se reporte au débit, créditeur au crédit
- le même côté, comme LAMPS.
"""

from datetime import date

from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.models import CompteComptable

from .models import EcritureCompta
from .saisie_journal import prochain_numero

# Journal du report à nouveau, comme LAMPS.
JOURNAL_RAN = 'RAN'

# Les comptes de bilan, seuls reportés : classes 1 à 5. Les classes 6 et 7
# (charges et produits) ne se reportent pas - elles repartent de zéro.
CLASSES_BILAN = ('1', '2', '3', '4', '5')


def _soldes_bilan(exercice):
    """
    Solde cumulé par (compte général, tiers, société) de tous les comptes de
    bilan, jusqu'à la fin de l'exercice clos inclus. L'axe est le mois comptable
    (`date_trait`), celui sur lequel LAMPS calcule l'exercice ; à défaut, la date
    de comptabilisation puis la date de pièce.

    Rend la liste des lignes à reporter (solde non nul), triée par compte puis
    tiers, et les totaux débit/crédit.
    """
    bilan = Q()
    for classe in CLASSES_BILAN:
        bilan |= Q(comptegen__startswith=classe)

    lignes = (
        EcritureCompta.objects
        .annotate(axe=Coalesce('date_trait', 'date_compta', 'date_piece'))
        .filter(axe__year__lte=exercice)
        .filter(bilan)
        .exclude(comptegen='')
        .values('comptegen', 'comptetiers', 'codesoc')
        .annotate(debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0))
        .order_by('comptegen', 'comptetiers')
    )

    # Intitulés du plan comptable, pour un libellé lisible.
    intitules = dict(CompteComptable.objects.values_list('code', 'libelle'))

    reports, total_debit, total_credit = [], 0, 0
    for ligne in lignes:
        solde = (ligne['debit'] or 0) - (ligne['credit'] or 0)
        if solde == 0:
            continue
        debit = solde if solde > 0 else 0
        credit = -solde if solde < 0 else 0
        total_debit += debit
        total_credit += credit
        reports.append({
            'comptegen': ligne['comptegen'],
            'intitule': intitules.get(ligne['comptegen'], ''),
            'comptetiers': ligne['comptetiers'] or '',
            'codesoc': ligne['codesoc'] or '',
            'debit': debit,
            'credit': credit,
        })
    return reports, total_debit, total_credit


class ReportANouveauViewSet(viewsets.ViewSet):
    """
    Aperçu et génération du report à nouveau d'un exercice sur le suivant.

    Ce n'est pas un `ModelViewSet` : l'unité n'est pas l'écriture, mais le
    **report d'un exercice entier** - une pièce RAN qui en porte autant qu'il y
    a de soldes à reporter.
    """

    def _exercice_demande(self, request):
        brut = (request.query_params.get('exercice') or request.data.get('exercice') or '').strip()
        return int(brut) if str(brut).isdigit() else date.today().year - 1

    def _deja_reporte(self, cible):
        """Un report existe déjà si une pièce RAN est datée du 1er janvier cible."""
        return EcritureCompta.objects.filter(
            codej=JOURNAL_RAN, date_trait=date(cible, 1, 1),
        ).exists()

    @action(detail=False, methods=['get'])
    def apercu(self, request):
        """
        Le report tel qu'il serait généré, sans rien écrire : la balance d'entrée
        de l'exercice suivant. De quoi la relire avant de valider.
        """
        exercice = self._exercice_demande(request)
        cible = exercice + 1
        reports, total_debit, total_credit = _soldes_bilan(exercice)
        return Response({
            'exercice': exercice,
            'exerciceCible': cible,
            'dejaReporte': self._deja_reporte(cible),
            'lignes': reports,
            'nombre': len(reports),
            'totalDebit': total_debit,
            'totalCredit': total_credit,
            # L'écart = le résultat non encore affecté ; informatif, non bloquant.
            'ecart': total_debit - total_credit,
        })

    @action(detail=False, methods=['post'])
    def generer(self, request):
        """
        Génère le report à nouveau : une pièce RAN datée du 1er janvier de
        l'exercice suivant, une ligne par solde de bilan. Idempotent - un
        exercice déjà reporté est refusé.
        """
        exercice = self._exercice_demande(request)
        cible = exercice + 1
        date_cible = date(cible, 1, 1)

        if self._deja_reporte(cible):
            return Response(
                {'detail': f'Le report à nouveau de {exercice} vers {cible} a déjà été généré.'},
                status=status.HTTP_409_CONFLICT,
            )

        reports, total_debit, total_credit = _soldes_bilan(exercice)
        if not reports:
            return Response(
                {'detail': f'Aucun solde de bilan à reporter pour l’exercice {exercice}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            numero = prochain_numero(JOURNAL_RAN)
            EcritureCompta.objects.bulk_create([
                EcritureCompta(
                    rang=rang,
                    codej=JOURNAL_RAN,
                    numpiece=numero,
                    date_piece=date_cible,
                    date_compta=date_cible,
                    date_trait=date_cible,
                    comptegen=report['comptegen'],
                    comptetiers=report['comptetiers'],
                    libelle=f'R.A.N SOLDE OUVERTURE {exercice}'[:120],
                    debit=report['debit'],
                    credit=report['credit'],
                    codesoc=report['codesoc'],
                )
                for rang, report in enumerate(reports)
            ])

        return Response(
            {
                'exercice': exercice,
                'exerciceCible': cible,
                'numPiece': numero,
                'lignes': len(reports),
                'totalDebit': total_debit,
                'totalCredit': total_credit,
                'message': (
                    f'Report à nouveau {exercice} → {cible} généré : '
                    f'{len(reports)} soldes reportés au journal RAN (pièce {numero}).'
                ),
            },
            status=status.HTTP_201_CREATED,
        )
