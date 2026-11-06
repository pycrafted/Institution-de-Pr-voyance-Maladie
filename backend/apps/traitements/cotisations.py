# -*- coding: utf-8 -*-
"""
Cotisations - la recette de l'IPM (menu Traitements, captures 81 à 83).

Tout le reste de ce module dépense. Cet écran est le seul qui **crée du
produit** : il appelle chaque mois, auprès des sociétés adhérentes et de leurs
salariés, les cotisations qui financent les remboursements. C'est la
contrepartie exacte des charges techniques du 602 : le **produit 701**.

L'écran porte deux onglets qui ne font pas le même métier, et qui sont un
avant et un après :

- **Appels cotisations** travaille **au cotisant**. On choisit société, mois
  et type, et la liste nominative des participants s'ouvre avec, devant chaque
  nom, le montant dû. On l'exporte, la paie y porte les montants réels pour
  les cotisations proportionnelles, on la réimporte.
- **Saisie cotisations** travaille **à la pièce comptable**. Un appel = une
  ligne, avec ses deux mouvements et son état. C'est de là qu'on comptabilise.

Quatre partis pris, tous tirés de la production (docs/lamps/cotisations.md) :

1. **La comptabilisation agrège.** 219 lignes nominatives donnent **deux**
   écritures, pas 219 : `Dr 463xxx société / Cr 701xxx produit`. Le détail
   nominatif ne descend jamais au grand livre, parce que l'adhérent est un
   compte collectif. Vérifié sur la pièce réelle `01-2024-8-C910`.
2. **Le type de cotisation est un journal.** `JournalComptable` où
   `type = 'COTISATION'` ; son `compte` donne le 701 à créditer. Aucun
   référentiel à créer.
3. **`date_trait` au 1er du mois**, déduite et non saisissable, comme le champ
   grisé de l'original.
4. **Rien ne se comptabilise deux fois**, et un appel comptabilisé ne se
   modifie plus. L'original laissait l'écran seul juge ; la règle est ici dans
   l'API, qui est le seul endroit où elle tienne.
"""

from datetime import date

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from adherents.models import Adherent
from donnees_de_base.models import JournalComptable
from participants.models import Participant

from .impression_cotisations import etat_cotisations_pdf
from .models import (
    STATUT_APPEL_COMPTABILISE,
    STATUT_APPEL_OUVERT,
    TYPE_JOURNAL_COTISATION,
    AppelCotisation,
    EcritureCompta,
    LigneCotisation,
    mois_abrege,
)

# Le journal porte le compte de produit à créditer. À défaut - un journal mal
# renseigné -, le 701 générique plutôt qu'une écriture sans compte.
COMPTE_PRODUIT_DEFAUT = '701000'

# Les états qui rendent un participant cotisant. Un dossier résilié, radié ou
# encore en attente ne cotise pas ; un dossier suspendu, si : la suspension
# ferme le droit aux prestations, pas l'obligation de cotiser.
ETATS_COTISANTS = ['Actif', 'Suspendu']


def journaux_cotisation():
    """Les journaux de type COTISATION, dans l'ordre de leur code."""
    return JournalComptable.objects.filter(
        type__iexact=TYPE_JOURNAL_COTISATION, actif=True,
    ).order_by('code')


def compte_produit(code_journal):
    journal = JournalComptable.objects.filter(code=code_journal).first()
    return (journal.compte if journal and journal.compte else '') or COMPTE_PRODUIT_DEFAUT


def libelle_journal(code_journal):
    journal = JournalComptable.objects.filter(code=code_journal).first()
    return journal.libelle if journal else code_journal


def total_relu(appel):
    """
    Le total de l'appel, relu en base.

    `AppelCotisation.total` somme les lignes **deja chargees** : c'est ce qu'il
    faut pour la liste, qui les prefetche en un coup, mais pas juste apres les
    avoir modifiees - il renverrait alors l'etat d'avant.
    """
    return appel.lignes.aggregate(t=Coalesce(Sum('montant'), 0))['t']


# ---------------------------------------------------------------------------
# Sérialisation
# ---------------------------------------------------------------------------


class LigneCotisationSerializer(serializers.ModelSerializer):
    """
    Une ligne de l'onglet Appels : le cotisant et ce qu'il doit.

    Prénom, Nom, Adresse et Téléphone sont **joints**, pas stockés : ils
    appartiennent à la fiche du participant, qui reste la seule source.
    """

    codeCotis = serializers.CharField(source='appel.code', read_only=True)
    matricule = serializers.CharField(source='participant.matricule', read_only=True)
    codeSoc = serializers.CharField(source='appel.adherent.code', read_only=True)
    prenoms = serializers.CharField(source='participant.prenoms', read_only=True)
    nom = serializers.CharField(source='participant.nom', read_only=True)
    adresse = serializers.CharField(source='participant.adresse', read_only=True)
    telephone = serializers.CharField(source='participant.mobile', read_only=True)
    etat = serializers.CharField(source='appel.statut', read_only=True)

    class Meta:
        model = LigneCotisation
        fields = [
            'id', 'codeCotis', 'matricule', 'codeSoc', 'prenoms', 'nom',
            'adresse', 'telephone', 'montant', 'etat',
        ]


class AppelCotisationSerializer(serializers.ModelSerializer):
    """
    L'appel vu de l'onglet Saisie : une ligne, deux mouvements, un état.

    `mvtDebit` et `mvtCredit` portent le même nombre - une cotisation est
    équilibrée par construction. L'écran les montre tout de même en deux
    colonnes, et le bandeau les totalise séparément : c'est ce qui permet de
    voir d'un coup d'oeil qu'aucune pièce ne boite.
    """

    cJl = serializers.CharField(source='journal', read_only=True)
    datePiece = serializers.DateField(source='date_piece')
    dateSaisie = serializers.DateField(source='date_compta', read_only=True)
    numPiece = serializers.CharField(source='code', read_only=True)
    moisTrait = serializers.DateField(source='date_trait', read_only=True)
    periode = serializers.CharField(read_only=True)

    societe = serializers.SlugRelatedField(
        slug_field='code', queryset=Adherent.objects.all(), source='adherent',
    )
    societeLibelle = serializers.CharField(source='adherent.libelle', read_only=True)
    compteGen = serializers.SerializerMethodField()
    compteProduit = serializers.SerializerMethodField()
    libelle = serializers.SerializerMethodField()

    montantUnitaire = serializers.IntegerField(
        source='montant_unitaire', required=False, allow_null=True, min_value=1,
    )
    cotisants = serializers.IntegerField(read_only=True)
    total = serializers.IntegerField(read_only=True)
    mvtDebit = serializers.IntegerField(source='total', read_only=True)
    mvtCredit = serializers.IntegerField(source='total', read_only=True)
    comptabilise = serializers.BooleanField(read_only=True)

    class Meta:
        model = AppelCotisation
        fields = [
            'id', 'code', 'numPiece', 'cJl', 'journal', 'societe', 'societeLibelle',
            'annee', 'mois', 'periode', 'datePiece', 'dateSaisie', 'moisTrait',
            'compteGen', 'compteProduit', 'libelle', 'montantUnitaire',
            'cotisants', 'total', 'mvtDebit', 'mvtCredit', 'statut', 'comptabilise',
        ]
        read_only_fields = ['code', 'statut']
        # Le contrôle d'unicité est fait dans `validate`, qui nomme la société
        # et le mois en cause (« 02 a déjà un appel C910 pour nov.-2026 »).
        # Celui que DRF pose d'office répondrait d'abord, et il ne sait dire
        # que « ces champs doivent former un ensemble unique ».
        validators = []

    def get_compteGen(self, appel):
        """Le 463 de la société : porté par la fiche adhérent, jamais calculé."""
        return appel.adherent.compte if appel.adherent_id else ''

    def get_compteProduit(self, appel):
        return compte_produit(appel.journal)

    def get_libelle(self, appel):
        return libelle_ecriture(appel)

    def validate_journal(self, valeur):
        code = (valeur or '').strip()
        if not journaux_cotisation().filter(code=code).exists():
            raise serializers.ValidationError(
                "Ce type de cotisation n'existe pas, ou n'est pas un journal de cotisation."
            )
        return code

    def validate_mois(self, valeur):
        if not 1 <= int(valeur) <= 12:
            raise serializers.ValidationError('Mois invalide.')
        return valeur

    def validate(self, donnees):
        instance = self.instance
        # Un appel comptabilisé est figé : ses écritures sont parties au grand
        # livre, les rouvrir ferait diverger la pièce de ce qu'elle a produit.
        if instance and instance.comptabilise:
            raise serializers.ValidationError(
                'Cet appel est comptabilisé : il ne peut plus être modifié.'
            )

        adherent = donnees.get('adherent') or (instance.adherent if instance else None)
        journal = donnees.get('journal') or (instance.journal if instance else '')
        annee = donnees.get('annee') or (instance.annee if instance else None)
        mois = donnees.get('mois') or (instance.mois if instance else None)

        if adherent and journal and annee and mois:
            doublon = AppelCotisation.objects.filter(
                adherent=adherent, journal=journal, annee=annee, mois=mois,
            )
            if instance:
                doublon = doublon.exclude(pk=instance.pk)
            if doublon.exists():
                raise serializers.ValidationError(
                    f'{adherent.code} a déjà un appel {journal} pour '
                    f'{mois_abrege(annee, mois)}.'
                )
        return donnees


def libelle_ecriture(appel):
    """
    Le libellé des deux écritures, à la forme exacte de l'original :

        COTISATION  PATRONALE CSM  IPM SAR PERSONNEL MOO : oct.-2020
        └─ libellé du journal ──┘  └─ intitulé société ─┘   └ mois ┘

    Le double espace après « COTISATION » vient du référentiel des journaux de
    LAMPS. Il est dans les données réelles : on ne le corrige pas.
    """
    societe = appel.adherent.libelle if appel.adherent_id else ''
    return f'{libelle_journal(appel.journal)}  {societe} : {appel.periode}'[:120]


# ---------------------------------------------------------------------------
# La vue
# ---------------------------------------------------------------------------


class CotisationsViewSet(viewsets.ModelViewSet):
    """Les deux onglets de l'écran Cotisations."""

    serializer_class = AppelCotisationSerializer
    queryset = AppelCotisation.objects.select_related('adherent').prefetch_related('lignes')

    # --- Filtrage de l'onglet Saisie ----------------------------------------

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'action', None) not in ('list', 'totaux', 'etat'):
            return queryset
        params = self.request.query_params

        annee = (params.get('annee') or '').strip()
        if annee.isdigit():
            queryset = queryset.filter(annee=int(annee))

        mois = (params.get('mois') or '').strip()
        if mois.isdigit() and 1 <= int(mois) <= 12:
            queryset = queryset.filter(mois=int(mois))

        societe = (params.get('societe') or '').strip()
        if societe and societe.lower() != 'tous':
            queryset = queryset.filter(adherent__code=societe)

        journal = (params.get('journal') or '').strip()
        if journal and journal.lower() != 'tous':
            queryset = queryset.filter(journal=journal)

        statut = (params.get('statut') or '').strip()
        if statut and statut.lower() != 'tous':
            queryset = queryset.filter(statut=statut)

        terme = (params.get('recherche') or '').strip()
        if terme:
            queryset = queryset.filter(
                Q(code__icontains=terme)
                | Q(journal__icontains=terme)
                | Q(adherent__libelle__icontains=terme)
            )
        return queryset

    def perform_create(self, serializer):
        """
        Créer l'appel, c'est le générer : l'en-tête sans ses lignes n'a aucun
        sens, et l'original ne laisse pas non plus d'appel vide derrière lui.
        """
        utilisateur = self.request.user if self.request.user.is_authenticated else None
        appel = serializer.save(saisi_par=utilisateur)
        self.generer_lignes(appel)

    def perform_destroy(self, appel):
        """
        Supprimer un appel supprime ses lignes - et rien d'autre.

        Un appel comptabilisé ne se supprime pas : ses écritures sont au grand
        livre, et le grand livre ne se réécrit pas. C'est la règle de tout ce
        module : on annule par une écriture, on n'efface pas.
        """
        if appel.comptabilise:
            raise serializers.ValidationError(
                'Cet appel est comptabilisé : il ne peut plus être supprimé.'
            )
        appel.delete()

    # --- La génération de l'appel --------------------------------------------

    @staticmethod
    def cotisants_de(adherent):
        """Les participants qui cotisent pour cette société, par matricule."""
        return Participant.objects.filter(
            adherent=adherent, etat__in=ETATS_COTISANTS,
        ).order_by('matricule')

    @classmethod
    def generer_lignes(cls, appel, montant=None):
        """
        (Re)pose une ligne par cotisant, au montant forfaitaire de l'appel.

        Quand aucun montant n'est connu - un appel proportionnel, dont les
        montants viendront du fichier importé -, les lignes se posent tout de
        même, à zéro : c'est la liste nominative qu'on exporte pour la remplir.
        """
        unitaire = montant if montant is not None else (appel.montant_unitaire or 0)
        with transaction.atomic():
            appel.lignes.all().delete()
            LigneCotisation.objects.bulk_create([
                LigneCotisation(appel=appel, participant=participant, montant=unitaire)
                for participant in cls.cotisants_de(appel.adherent)
            ])
        return appel.lignes.count()

    @action(detail=True, methods=['post'], url_path='appeler')
    def appeler(self, request, pk=None):
        """
        Le bouton « Appel Cotisations » : (re)dérouler la liste nominative.

        Utile quand l'effectif a bougé depuis la création de l'appel - une
        embauche, un départ. Les montants déjà saisis sont réécrits au
        forfait : c'est un appel qu'on relance, pas une mise à jour partielle.
        """
        appel = self.get_object()
        if appel.comptabilise:
            return Response(
                {'detail': 'Cet appel est comptabilisé : il ne peut plus être relancé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        montant = request.data.get('montant')
        if montant not in (None, ''):
            appel.montant_unitaire = int(montant)
            appel.save(update_fields=['montant_unitaire'])
        cotisants = self.generer_lignes(appel)
        return Response({
            'cotisants': cotisants,
            'total': total_relu(appel),
            'message': f'{cotisants} cotisants appelés pour {appel.periode}.',
        })

    # --- Les lignes de l'onglet Appels ---------------------------------------

    @action(detail=True, methods=['get'])
    def lignes(self, request, pk=None):
        """La liste nominative, avec son en-tête « 219 Cotisants - Total … »."""
        appel = self.get_object()
        lignes = appel.lignes.select_related('participant', 'appel', 'appel__adherent')

        terme = (request.query_params.get('recherche') or '').strip()
        if terme:
            lignes = lignes.filter(
                Q(participant__matricule__icontains=terme)
                | Q(participant__nom__icontains=terme)
                | Q(participant__prenoms__icontains=terme)
                | Q(participant__adresse__icontains=terme)
            )

        return Response({
            'appel': AppelCotisationSerializer(appel).data,
            # L'en-tête de l'original : « Août 2024 / 01 - … - COTISATION … /
            # 219 Cotisants - Total Cotisé: 394 200 ».
            'entete': {
                'periode': f'{appel.periode}',
                'titre': (
                    f'{appel.adherent.code} - {appel.adherent.libelle} - '
                    f'{libelle_journal(appel.journal)}'
                ),
                'cotisants': appel.cotisants,
                'total': total_relu(appel),
            },
            'lignes': LigneCotisationSerializer(lignes, many=True).data,
        })

    @action(detail=True, methods=['post'], url_path='modifier-lignes')
    def modifier_lignes(self, request, pk=None):
        """
        Porter des montants sur des lignes existantes - ce que fait l'import.

        Reçoit `[{matricule, montant}, …]`. Les matricules inconnus de l'appel
        sont **signalés, pas ignorés** : un fichier qui ne correspond pas à
        l'appel est une erreur de l'utilisateur, et la taire la lui cache.
        """
        appel = self.get_object()
        if appel.comptabilise:
            return Response(
                {'detail': 'Cet appel est comptabilisé : ses montants sont figés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        montants = {}
        for entree in request.data.get('lignes') or []:
            matricule = str(entree.get('matricule') or '').strip()
            if matricule:
                montants[matricule] = int(entree.get('montant') or 0)

        lignes = list(appel.lignes.select_related('participant'))
        connus, modifiees = set(), []
        for ligne in lignes:
            matricule = ligne.participant.matricule
            if matricule in montants:
                connus.add(matricule)
                ligne.montant = montants[matricule]
                modifiees.append(ligne)
        if modifiees:
            LigneCotisation.objects.bulk_update(modifiees, ['montant'])

        inconnus = sorted(set(montants) - connus)
        portes, ecartes = len(modifiees), len(inconnus)
        marque = lambda n: 's' if n > 1 else ''  # noqa: E731
        return Response({
            'modifiees': portes,
            'inconnus': inconnus,
            'total': total_relu(appel),
            'message': (
                f'{portes} montant{marque(portes)} porté{marque(portes)}'
                + (
                    f", {ecartes} matricule{marque(ecartes)} hors de l'appel"
                    if inconnus
                    else ''
                )
                + '.'
            ),
        })

    # --- La comptabilisation --------------------------------------------------

    @action(detail=False, methods=['post'])
    def comptabiliser(self, request):
        """
        Le bouton « Comptabiliser » : deux écritures par appel, pas 219.

            Dr 463xxx  société adhérente      total de l'appel
            Cr 701xxx  produit de cotisation  total de l'appel

        Un appel vide ou à zéro est refusé : une pièce sans montant encombre le
        grand livre sans rien y dire. Un appel déjà comptabilisé est ignoré
        sans erreur - c'est une sélection en lot, et redemander ce qui est
        fait ne doit pas faire échouer le reste.
        """
        identifiants = request.data.get('appels') or []
        appels = list(
            AppelCotisation.objects.filter(pk__in=identifiants)
            .select_related('adherent').prefetch_related('lignes')
        )
        if not appels:
            return Response(
                {'detail': 'Aucun appel sélectionné.'}, status=status.HTTP_400_BAD_REQUEST,
            )

        faits, ignores, refuses = [], [], []
        aujourdhui = date.today()

        with transaction.atomic():
            for appel in appels:
                if appel.comptabilise:
                    ignores.append(appel.code)
                    continue
                total = appel.total
                if total <= 0:
                    refuses.append(appel.code)
                    continue

                commun = {
                    'codej': appel.journal,
                    'date_piece': appel.date_piece,
                    'date_compta': aujourdhui,
                    'date_trait': appel.date_trait,
                    'numpiece': appel.code,
                    'libelle': libelle_ecriture(appel),
                    'codesoc': appel.adherent.code,
                    'numtrans': appel.code,
                }
                EcritureCompta.objects.bulk_create([
                    EcritureCompta(
                        # **Pas de compte tiers.** On y mettait le code société,
                        # ce qui faisait doublon avec `codesoc` et contredisait
                        # la règle que la production tient sans exception : le
                        # tiers n'existe que sur un compte **411** (participant,
                        # `société-matricule`) ou **400** (fournisseur, code nu).
                        # Sur les 1 360 écritures de cotisation de LAMPS, aucune
                        # n'en porte. Corrigé le 2026-11-04.
                        rang=0, comptegen=appel.adherent.compte,
                        comptetiers='', debit=total, credit=0, **commun,
                    ),
                    EcritureCompta(
                        rang=1, comptegen=compte_produit(appel.journal),
                        comptetiers='', debit=0, credit=total, **commun,
                    ),
                ])
                appel.statut = STATUT_APPEL_COMPTABILISE
                appel.date_compta = aujourdhui
                appel.save(update_fields=['statut', 'date_compta'])
                faits.append(appel.code)

        parties = []
        if faits:
            parties.append(f'{len(faits)} appel(s) comptabilisé(s)')
        if ignores:
            parties.append(f'{len(ignores)} déjà comptabilisé(s)')
        if refuses:
            parties.append(f'{len(refuses)} sans montant, refusé(s)')
        return Response({
            'comptabilises': faits,
            'ignores': ignores,
            'refuses': refuses,
            'message': ', '.join(parties) + '.' if parties else 'Rien à comptabiliser.',
        })

    # --- Les listes des sélecteurs --------------------------------------------

    @action(detail=False, methods=['get'])
    def references(self, request):
        """
        Ce que les sélecteurs de l'écran proposent : sociétés et types.

        Les deux en un seul appel : l'écran ne s'ouvre pas sans eux, et deux
        allers-retours pour ouvrir une page en valent un.
        """
        societes = Adherent.objects.filter(actif=True).order_by('code')
        return Response({
            'societes': [
                {
                    'code': adherent.code,
                    'libelle': adherent.libelle,
                    'intitule': f'{adherent.code} - {adherent.libelle}',
                    'compte': adherent.compte,
                }
                for adherent in societes
            ],
            'types': [
                {
                    'code': journal.code,
                    'libelle': journal.libelle,
                    'intitule': f'{journal.code} - {journal.libelle}',
                    'compte': journal.compte,
                }
                for journal in journaux_cotisation()
            ],
        })

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """
        Le bandeau « Solde débit : X - Solde crédit : Y » de l'onglet Saisie.

        Les deux doivent toujours porter le même nombre : une cotisation est
        équilibrée. S'ils divergent, c'est qu'une pièce boite, et l'écran le
        montre sans qu'on ait à ouvrir le grand livre.
        """
        appels = self.get_queryset()
        total = sum(appel.total for appel in appels)
        return Response({
            'debit': total,
            'credit': total,
            'appels': appels.count(),
            'comptabilises': appels.filter(statut=STATUT_APPEL_COMPTABILISE).count(),
            'ouverts': appels.filter(statut=STATUT_APPEL_OUVERT).count(),
        })

    @action(detail=False, methods=['get'])
    def periodes(self, request):
        """Les années qui portent un appel, pour le sélecteur d'année."""
        annees = (
            AppelCotisation.objects.values('annee')
            .annotate(appels=Count('id'))
            .order_by('-annee')
        )
        courante = date.today().year
        liste = [ligne['annee'] for ligne in annees]
        if courante not in liste:
            liste.insert(0, courante)
        return Response(liste)

    # --- L'impression ---------------------------------------------------------

    @action(detail=False, methods=['get'])
    def etat(self, request):
        """Le bouton « Imprimer » : l'état des cotisations du mois filtré."""
        appels = list(self.get_queryset())
        params = request.query_params
        pdf = etat_cotisations_pdf(
            appels,
            annee=params.get('annee') or '',
            mois=params.get('mois') or '',
        )
        reponse = HttpResponse(pdf, content_type='application/pdf')
        reponse['Content-Disposition'] = 'inline; filename="cotisations.pdf"'
        return reponse
