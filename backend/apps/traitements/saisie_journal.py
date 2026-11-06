# -*- coding: utf-8 -*-
"""
Saisie Journal - l'écriture comptable à la main (captures 84 et 85).

C'est le seul écran où un comptable pose lui-même un débit et un crédit, sans
qu'une facture, un règlement ou un appel de cotisation les lui dictent. Il
écrit directement dans le grand livre (`EcritureCompta`), au journal choisi -
en pratique **OD**, qui porte 6 923 écritures en production.

Tout ce qui suit a été vérifié sur la base restaurée (`lamps_analyse`), et le
dossier complet est dans `docs/lamps/saisie-journal.md`. Six règles en sortent,
et elles sont toutes tenues ici plutôt qu'à l'écran :

1. **Une pièce est multi-lignes.** Sur 2 284 pièces OD : 1 707 à deux lignes,
   **474 à quatre** (le forfait maternité, qui constate la charge puis la
   paie), jusqu'à 66. Un formulaire à deux lignes serait faux.
2. **Une pièce est équilibrée.** Zéro déséquilibre sur les 2 152 pièces
   modernes. C'est la condition de validation, pas un voeu.
3. **Une ligne porte exactement un des deux côtés, non nul.** Aucune des
   6 923 lignes ne porte les deux, aucune n'est à zéro des deux côtés.
4. **Le montant peut être négatif.** LAMPS annule en reposant la même écriture
   **en négatif du même côté** : 458 des 519 écritures « ANNULATION… ». Un
   contrôle « strictement positif » rendrait l'annulation impossible.
5. **Le compte tiers est obligatoire sur un 411 ou un 400, interdit ailleurs**,
   et son format change : `société-matricule` pour un participant (`02-0713`,
   1 367 fois sur 1 368), **code nu** pour un fournisseur (`0609`, 0 sur 289
   préfixé).
6. **Le numéro de pièce est séquentiel et préfixé du code journal** :
   `OD000001` à `OD002270`. C'est propre à `OD` et `RAN` ; les autres journaux
   numérotent autrement, donc la règle ne vaut que pour celui qu'on saisit.

**Un point assumé.** L'écran de LAMPS porte une colonne `Etat` et un bouton
`Comptabiliser`, donc un état « saisi, non comptabilisé » existe - mais aucune
trace n'en subsiste : `date_compta` est servie sur les 396 873 écritures de la
base, et en OD la saisie et la comptabilisation tombent le même jour sur 6 889
lignes sur 6 923. On retient donc l'hypothèse la plus simple : **`date_compta`
vide = saisi, non comptabilisé**.
"""

from datetime import date

from django.db import transaction
from django.db.models import Max, Q, Sum
from django.db.models.functions import Coalesce, ExtractYear
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from adherents.models import Adherent
from donnees_de_base.models import CompteComptable, FournisseurDeSoins, JournalComptable
from participants.models import Participant

from .impression_saisie_journal import etat_saisie_journal_pdf
from .models import EcritureCompta

# Les deux familles de comptes qui exigent un tiers - et les seules. Vérifié
# sur les 6 923 écritures OD : 1 367 tiers sur 1 368 lignes de 411, 289 sur
# 291 lignes de 400, et **zéro** sur les 521, 631, 463, 602, 640 et 460.
RACINE_PARTICIPANT = '411'
RACINE_FOURNISSEUR = '400'
RACINES_AVEC_TIERS = (RACINE_PARTICIPANT, RACINE_FOURNISSEUR)

MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]


def fr(nombre):
    """« 1 000 ». Séparateur d'espace, sans toucher aux virgules de la phrase."""
    return f'{int(nombre):,}'.replace(',', ' ')


def prochain_numero(codej):
    """
    « OD000001 », « OD000002 »… Le suivant du journal, sur six chiffres.

    Le maximum se lit en texte, ce qui est exact tant que la partie numérique
    est de largeur fixe - c'est le cas depuis 2020. Les numéros d'avant
    (chiffres nus) sont écartés par le filtre, sinon ils domineraient le tri.
    """
    prefixe = (codej or '').upper()
    dernier = (
        EcritureCompta.objects
        .filter(codej=codej, numpiece__regex=rf'^{prefixe}[0-9]{{6}}$')
        .aggregate(m=Max('numpiece'))['m']
    )
    suite = int(dernier[len(prefixe):]) + 1 if dernier else 1
    return f'{prefixe}{suite:06d}'


# ---------------------------------------------------------------------------
# Sérialisation
# ---------------------------------------------------------------------------


class LigneJournalSerializer(serializers.ModelSerializer):
    """Les treize colonnes de la liste (capture 84), dans leur ordre."""

    cJl = serializers.CharField(source='codej', read_only=True)
    datePiece = serializers.DateField(source='date_piece', read_only=True)
    numPiece = serializers.CharField(source='numpiece', read_only=True)
    dateSaisie = serializers.DateField(source='date_compta', read_only=True)
    moisTrait = serializers.DateField(source='date_trait', read_only=True)
    compteGen = serializers.CharField(source='comptegen', read_only=True)
    compteTiers = serializers.CharField(source='comptetiers', read_only=True)
    codeSoc = serializers.CharField(source='codesoc', read_only=True)
    numCheque = serializers.CharField(source='numcheque', read_only=True)
    etat = serializers.SerializerMethodField()

    class Meta:
        model = EcritureCompta
        fields = [
            'id', 'cJl', 'datePiece', 'numPiece', 'dateSaisie', 'moisTrait',
            'compteGen', 'compteTiers', 'codeSoc', 'libelle', 'debit',
            'credit', 'numCheque', 'etat',
        ]

    def get_etat(self, obj):
        return 'Comptabilisé' if obj.date_compta else 'Saisi'


class PaginationJournal(PageNumberPagination):
    """50 par page, comme le Journal Central."""

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


# ---------------------------------------------------------------------------
# Validation d'une pièce
# ---------------------------------------------------------------------------


class ErreurPiece(Exception):
    """Une pièce refusée, avec la raison que l'écran affichera telle quelle."""


def nettoyer_ligne(brut, rang):
    """
    Contrôle et normalise une ligne saisie. Lève `ErreurPiece` au premier
    manquement, en nommant le rang : sur une pièce de huit lignes, « la ligne
    3 » est la seule indication utile.
    """
    ou = f'Ligne {rang}'
    compte = str(brut.get('compteGen') or '').strip()
    if not compte:
        raise ErreurPiece(f'{ou} : le compte général est obligatoire.')

    debit = int(brut.get('debit') or 0)
    credit = int(brut.get('credit') or 0)
    if debit and credit:
        raise ErreurPiece(f'{ou} : une ligne porte un débit **ou** un crédit, jamais les deux.')
    if not debit and not credit:
        raise ErreurPiece(f'{ou} : il manque le montant.')

    tiers = str(brut.get('compteTiers') or '').strip()
    attendu = compte.startswith(RACINES_AVEC_TIERS)
    if attendu and not tiers:
        famille = 'participant' if compte.startswith(RACINE_PARTICIPANT) else 'fournisseur'
        raise ErreurPiece(f'{ou} : le compte {compte} est un compte {famille}, son tiers est obligatoire.')
    if tiers and not attendu:
        raise ErreurPiece(
            f'{ou} : le compte {compte} ne prend pas de tiers '
            '(seuls les comptes 411 et 400 en portent un).'
        )

    libelle = str(brut.get('libelle') or '').strip()
    if not libelle:
        raise ErreurPiece(f'{ou} : le libellé est obligatoire.')

    return {
        'comptegen': compte,
        'comptetiers': tiers,
        'libelle': libelle[:120],
        'debit': debit,
        'credit': credit,
        'codesoc': str(brut.get('societe') or '').strip(),
        'numcheque': str(brut.get('numCheque') or '').strip(),
    }


# ---------------------------------------------------------------------------
# La vue
# ---------------------------------------------------------------------------


class SaisieJournalViewSet(viewsets.ViewSet):
    """
    La liste des écritures saisissables, et la création d'une pièce entière.

    Ce n'est pas un `ModelViewSet` : l'unité de travail n'est pas l'écriture
    mais **la pièce**, qui en porte deux à soixante-six. On crée une pièce, on
    comptabilise une pièce ; une écriture seule n'a pas de sens ici.
    """

    pagination_class = PaginationJournal

    # --- Lecture -----------------------------------------------------------

    def base(self):
        return EcritureCompta.objects.only(
            'id', 'codej', 'date_piece', 'date_compta', 'date_trait', 'numpiece',
            'numcheque', 'comptegen', 'comptetiers', 'codesoc', 'libelle',
            'debit', 'credit',
        )

    def filtrer(self, queryset, params):
        """
        Les trois filtres de la capture : Exercice, Mois, Journal, plus la
        recherche. L'exercice vaut l'année en cours par défaut - ouvrir le
        journal sur huit exercices n'aurait pas de sens comptable.
        """
        exercice = (params.get('exercice') or '').strip()
        if exercice.lower() != 'tous':
            annee = int(exercice) if exercice.isdigit() else date.today().year
            queryset = queryset.filter(date_trait__year=annee)

        mois = (params.get('mois') or '').strip()
        if mois.isdigit() and 1 <= int(mois) <= 12:
            queryset = queryset.filter(date_trait__month=int(mois))

        journal = (params.get('journal') or '').strip()
        if journal and journal.upper() != 'TOUS':
            queryset = queryset.filter(codej=journal)

        societe = (params.get('societe') or '').strip()
        if societe:
            queryset = queryset.filter(codesoc=societe)

        terme = (params.get('recherche') or '').strip()
        if terme:
            queryset = queryset.filter(
                Q(libelle__icontains=terme)
                | Q(comptegen__icontains=terme)
                | Q(comptetiers__icontains=terme)
                | Q(numpiece__icontains=terme)
                | Q(numcheque__icontains=terme)
            )
        return queryset

    def queryset_filtre(self, request):
        return self.filtrer(self.base(), request.query_params)

    def list(self, request):
        queryset = self.queryset_filtre(request).order_by('numpiece', 'rang', 'id')
        pagination = self.pagination_class()
        page = pagination.paginate_queryset(queryset, request, view=self)
        return pagination.get_paginated_response(LigneJournalSerializer(page, many=True).data)

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """Le bandeau « Solde débit / Solde crédit » de la capture 84."""
        resultat = self.queryset_filtre(request).aggregate(
            debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0),
        )
        debit, credit = resultat['debit'] or 0, resultat['credit'] or 0
        return Response({'debit': debit, 'credit': credit, 'solde': debit - credit})

    @action(detail=False, methods=['get'])
    def exercices(self, request):
        annees = (
            EcritureCompta.objects.exclude(date_trait=None)
            .annotate(an=ExtractYear('date_trait'))
            .values_list('an', flat=True).distinct()
        )
        resultat = sorted({a for a in annees if a}, reverse=True)
        if date.today().year not in resultat:
            resultat.insert(0, date.today().year)
        return Response(resultat)

    @action(detail=False, methods=['get'])
    def references(self, request):
        """
        Tout ce que le modal déroule : journaux, sociétés, comptes, tiers.

        Les tiers viennent en deux familles parce que leur **format diffère** :
        un participant s'écrit `société-matricule`, un fournisseur par son code
        nu. L'écran choisit la bonne liste d'après le compte général.
        """
        participants = (
            Participant.objects.select_related('adherent')
            .exclude(adherent=None).order_by('adherent__code', 'matricule')
        )
        return Response({
            'journaux': [
                {'code': j.code, 'intitule': f'{j.code} - {j.libelle}', 'type': j.type}
                for j in JournalComptable.objects.filter(actif=True).order_by('code')
            ],
            'societes': [
                {'code': a.code, 'intitule': f'{a.code} - {a.libelle}', 'compte': a.compte}
                for a in Adherent.objects.all().order_by('code')
            ],
            # Seuls les vrais comptes : les étages du plan (« 4 », « 41 »,
            # « 411 ») rangent, ils ne se mouvementent pas.
            'comptes': [
                {'code': c.code, 'intitule': f'{c.code} - {c.libelle}'}
                for c in CompteComptable.objects.filter(actif=True).order_by('code')
                if c.est_un_compte
            ],
            'participants': [
                {
                    'code': f'{p.adherent.code}-{p.matricule}',
                    'intitule': f'{p.adherent.code}-{p.matricule} - {p.nom} {p.prenoms}'.strip(),
                }
                for p in participants
            ],
            'fournisseurs': [
                {'code': f.code, 'intitule': f'{f.code} - {f.libelle}'}
                for f in FournisseurDeSoins.objects.filter(actif=True).order_by('code')
            ],
            'mois': [{'valeur': i + 1, 'libelle': m} for i, m in enumerate(MOIS)],
        })

    @action(detail=False, methods=['get'], url_path='piece')
    def piece(self, request):
        """Les lignes d'une pièce, pour la relire avant de comptabiliser."""
        numero = (request.query_params.get('numero') or '').strip()
        if not numero:
            return Response({'detail': 'Numéro de pièce manquant.'},
                            status=status.HTTP_400_BAD_REQUEST)
        lignes = self.base().filter(numpiece=numero).order_by('rang', 'id')
        return Response(LigneJournalSerializer(lignes, many=True).data)

    # --- Écriture ----------------------------------------------------------

    def create(self, request):
        """
        Enregistre une pièce entière : le bouton « Valider » du modal.

        La pièce naît **non comptabilisée** (`date_compta` vide) : c'est ce que
        la colonne `Etat` de la liste montre, et ce que le bouton
        « Comptabiliser » vient ensuite servir.
        """
        donnees = request.data or {}
        journal = str(donnees.get('journal') or '').strip()
        if not JournalComptable.objects.filter(code=journal, actif=True).exists():
            return Response({'detail': f'Journal inconnu : {journal or "(vide)"}.'},
                            status=status.HTTP_400_BAD_REQUEST)

        brutes = donnees.get('lignes') or []
        if len(brutes) < 2:
            return Response(
                {'detail': 'Une pièce porte au moins deux lignes : un débit et un crédit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            lignes = [nettoyer_ligne(b, i + 1) for i, b in enumerate(brutes)]
        except ErreurPiece as erreur:
            return Response({'detail': str(erreur)}, status=status.HTTP_400_BAD_REQUEST)

        debit = sum(l['debit'] for l in lignes)
        credit = sum(l['credit'] for l in lignes)
        if debit != credit:
            ecart = abs(debit - credit)
            return Response(
                {'detail': f'Pièce déséquilibrée : débit {fr(debit)} contre crédit '
                           f'{fr(credit)}, soit {fr(ecart)} d\'écart.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if debit == 0:
            return Response({'detail': 'Une pièce à zéro n\'a rien à enregistrer.'},
                            status=status.HTTP_400_BAD_REQUEST)

        date_piece = donnees.get('datePiece') or date.today().isoformat()
        date_trait = donnees.get('dateTrait') or date_piece
        annee, mois, _ = (int(x) for x in str(date_trait)[:10].split('-'))
        mois_comptable = date(annee, mois, 1)

        societe_entete = str(donnees.get('societe') or '').strip()
        cheque_entete = str(donnees.get('numCheque') or '').strip()
        numero = str(donnees.get('numPiece') or '').strip()

        with transaction.atomic():
            if not numero:
                numero = prochain_numero(journal)
            elif EcritureCompta.objects.filter(codej=journal, numpiece=numero).exists():
                return Response(
                    {'detail': f'La pièce {numero} existe déjà au journal {journal}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            EcritureCompta.objects.bulk_create([
                EcritureCompta(
                    rang=rang,
                    codej=journal,
                    numpiece=numero,
                    date_piece=date_piece,
                    date_trait=mois_comptable,
                    # Vide : la pièce est saisie, pas encore comptabilisée.
                    date_compta=None,
                    comptegen=ligne['comptegen'],
                    comptetiers=ligne['comptetiers'],
                    libelle=ligne['libelle'],
                    debit=ligne['debit'],
                    credit=ligne['credit'],
                    codesoc=ligne['codesoc'] or societe_entete,
                    numcheque=ligne['numcheque'] or cheque_entete,
                )
                for rang, ligne in enumerate(lignes)
            ])

        return Response(
            {
                'numPiece': numero,
                'journal': journal,
                'lignes': len(lignes),
                'debit': debit,
                'credit': credit,
                'message': f'Pièce {numero} enregistrée : {len(lignes)} lignes, '
                           f'{fr(debit)} F de part et d\'autre.',
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'])
    def comptabiliser(self, request):
        """
        Le bouton « Comptabiliser » : poser la date de comptabilisation.

        La sélection se fait ligne par ligne à l'écran, mais **la
        comptabilisation porte sur la pièce entière** : une pièce à moitié
        comptabilisée serait un grand livre faux. On remonte donc des lignes
        cochées à leurs pièces, et on refuse celles qui ne s'équilibrent pas.
        """
        identifiants = request.data.get('ecritures') or []
        pieces = set(
            EcritureCompta.objects.filter(pk__in=identifiants)
            .exclude(numpiece='').values_list('numpiece', flat=True)
        )
        if not pieces:
            return Response({'detail': 'Aucune écriture sélectionnée.'},
                            status=status.HTTP_400_BAD_REQUEST)

        faites, ignorees, refusees = [], [], []
        aujourdhui = date.today()
        with transaction.atomic():
            for numero in sorted(pieces):
                lignes = EcritureCompta.objects.filter(numpiece=numero)
                if not lignes.filter(date_compta=None).exists():
                    ignorees.append(numero)
                    continue
                totaux = lignes.aggregate(
                    d=Coalesce(Sum('debit'), 0), c=Coalesce(Sum('credit'), 0),
                )
                if totaux['d'] != totaux['c']:
                    refusees.append(numero)
                    continue
                lignes.filter(date_compta=None).update(date_compta=aujourdhui)
                faites.append(numero)

        parties = []
        if faites:
            parties.append(f'{len(faites)} pièce(s) comptabilisée(s)')
        if ignorees:
            parties.append(f'{len(ignorees)} déjà comptabilisée(s)')
        if refusees:
            parties.append(f'{len(refusees)} déséquilibrée(s), refusée(s)')
        return Response({
            'comptabilisees': faites,
            'ignorees': ignorees,
            'refusees': refusees,
            'message': ', '.join(parties) + '.' if parties else 'Rien à faire.',
        })

    # --- Impression --------------------------------------------------------

    @action(detail=False, methods=['get'])
    def etat(self, request):
        """Le bouton « Imprimer » : l'état du périmètre filtré, en PDF."""
        params = request.query_params
        lignes = self.queryset_filtre(request).order_by('numpiece', 'rang', 'id')[:2000]
        pdf = etat_saisie_journal_pdf(
            LigneJournalSerializer(lignes, many=True).data,
            exercice=params.get('exercice') or '',
            mois=params.get('mois') or '',
            journal=params.get('journal') or '',
        )
        reponse = HttpResponse(pdf, content_type='application/pdf')
        reponse['Content-Disposition'] = 'inline; filename="saisie-journal.pdf"'
        return reponse
