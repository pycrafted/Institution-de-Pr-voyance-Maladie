# -*- coding: utf-8 -*-
"""
Retenues Frais Médicaux (menu Traitements, captures 86 à 91).

**Le recouvrement de ce que l'IPM a avancé.** Quand un participant consulte,
l'IPM règle le prestataire en entier, puis porte la part qui revient à l'agent
- le ticket modérateur - au débit de son compte 411. Cette dette ne se paie
pas au guichet : elle se prélève sur le salaire. Cet écran est la courroie
entre l'IPM et la paie.

Le circuit est **contraignant**, dans cet ordre (relevé en direct le
2026-11-04, docs/lamps/retenues-frais-medicaux.md §3) :

    Appel Retenues  ->  Importer  ->  Comptabiliser  ->  Export du solde
    photographie       le fichier     102 crédits 411     le fichier qui
    la dette de        de Sage,       + 1 débit 463       repart vers Sage
    chaque agent       rubrique 6600  au journal RP

Cinq partis pris, tous tirés de la production (20 136 lignes, 144 campagnes) :

1. **L'IPM ne calcule pas la retenue.** La colonne « Retenue IPM » vaut
   `min(solde, 35 000)` et ne part jamais en comptabilité : sur les 142 pièces
   réelles, le montant comptabilisé est 142 fois celui de la paie. On garde la
   proposition pour l'identité avec LAMPS, mais c'est l'import qui commande.
2. **Le solde est photographié à l'appel**, puis figé sur la ligne.
3. **La comptabilisation n'agrège pas.** Un crédit 411 par participant servi,
   avec son tiers `01-0699`, et un seul débit 463 pour la société. C'est la
   différence avec les cotisations, où l'adhérent est un compte collectif.
4. **Un prélèvement au-delà de la dette est signalé, jamais bloqué.** Le
   montant est déjà retenu sur le bulletin ; refuser l'import ne le rendrait à
   personne et ferait diverger notre comptabilité de celle de Sage.
5. **Rien ne se comptabilise deux fois**, et une campagne comptabilisée ne se
   modifie plus. LAMPS laissait l'écran seul juge ; la règle est ici dans
   l'API, qui est le seul endroit où elle tienne.
"""

from datetime import date

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from adherents.models import Adherent
from participants.models import Participant

from .models import (
    JOURNAL_RETENUE,
    PLAFOND_RETENUE_IPM,
    PREFIXE_COMPTE_PARTICIPANT,
    STATUT_APPEL_COMPTABILISE,
    STATUT_APPEL_OUVERT,
    CampagneRetenue,
    EcritureCompta,
    LigneRetenue,
    dernier_jour,
)

# **Aucun filtre sur l'état du dossier**, et c'est volontaire.
#
# La cotisation se filtre par état - un résilié ne cotise plus. La retenue,
# non : ce qu'un agent doit, il le doit encore après son départ. Le seul
# critère d'entrée dans la campagne est **la dette**. Un dossier qui n'a plus
# de paie derrière lui restera simplement à zéro, et c'est exactement ce que
# montre la production : 160 lignes appelées pour 102 servies en juin 2026,
# 35,3 % des 20 136 lignes jamais prélevées. Masquer ces dossiers masquerait
# une créance.


def totaux_relus(campagne):
    """
    Les totaux de la campagne, relus en base.

    Les propriétés du modèle somment les lignes **déjà chargées** : c'est ce
    qu'il faut pour la liste, qui les prefetche en un coup, mais pas juste
    après les avoir modifiées - elles renverraient l'état d'avant.
    """
    agrege = campagne.lignes.aggregate(
        paie=Coalesce(Sum('retenue_paie'), 0),
        ipm=Coalesce(Sum('retenue_ipm'), 0),
        solde=Coalesce(Sum('solde'), 0),
    )
    lignes = list(campagne.lignes.all())
    return {
        'participants': len(lignes),
        'preleves': sum(1 for l in lignes if l.retenue_paie),
        'totalPaie': agrege['paie'],
        'totalIpm': agrege['ipm'],
        'totalSolde': agrege['solde'],
        'anomalies': sum(1 for l in lignes if l.excedent),
        'excedent': sum(l.excedent for l in lignes),
    }


def soldes_participants(adherent):
    """
    Le solde 411 de chaque participant de la société, par matricule.

    Un solde se calcule, il ne se stocke pas : c'est la somme des mouvements
    du compte, `débit - crédit`. Le débit est ce que l'IPM a avancé pour
    l'agent (le ticket modérateur), le crédit ce qu'on lui a déjà retenu. Un
    solde positif est donc une dette envers l'IPM.

    Le tiers porte la forme `société-matricule` (« 01-0699 ») : c'est la seule
    clé qui distingue deux agents, puisque 79 matricules existent dans les
    deux sociétés à la fois.
    """
    compte = f'{PREFIXE_COMPTE_PARTICIPANT}{adherent.code}'
    mouvements = (
        EcritureCompta.objects.filter(comptegen=compte)
        .values('comptetiers')
        .annotate(debit=Coalesce(Sum('debit'), 0), credit=Coalesce(Sum('credit'), 0))
    )
    prefixe = f'{adherent.code}-'
    soldes = {}
    for ligne in mouvements:
        tiers = (ligne['comptetiers'] or '').strip()
        if not tiers.startswith(prefixe):
            continue
        soldes[tiers[len(prefixe):]] = int(ligne['debit']) - int(ligne['credit'])
    return soldes


def retenue_proposee(solde):
    """
    `min(solde, 35 000)` - la colonne « Retenue IPM ».

    Le plafond est une valeur en dur de LAMPS, sans aucune règle derrière : il
    vaut ceci sur 20 136 lignes sur 20 136, et la paie ne le suit que 5,5 %
    du temps. On le reprend pour rester identique, pas parce qu'il décide.
    """
    return min(max(0, int(solde)), PLAFOND_RETENUE_IPM)


# ---------------------------------------------------------------------------
# Sérialisation
# ---------------------------------------------------------------------------


class LigneRetenueSerializer(serializers.ModelSerializer):
    """
    Une ligne de la liste nominative : l'agent, sa dette, les deux montants.

    Matricule, nom et prénoms sont **joints**, pas recopiés : ils
    appartiennent à la fiche du participant, qui reste la seule source. LAMPS
    les dupliquait dans sa ligne de retenue, ce qui les laissait vieillir.
    """

    codeRetenue = serializers.CharField(source='campagne.code', read_only=True)
    matricule = serializers.CharField(source='participant.matricule', read_only=True)
    codeSoc = serializers.CharField(source='campagne.adherent.code', read_only=True)
    prenoms = serializers.CharField(source='participant.prenoms', read_only=True)
    nom = serializers.CharField(source='participant.nom', read_only=True)
    # L'original n'a qu'une colonne « Participant », et sa table la stocke
    # telle quelle : « OUSMANE FALL », prénom puis nom. On la compose ici
    # plutôt que de la recopier en base - la fiche reste la seule source.
    participantNom = serializers.SerializerMethodField()
    compte = serializers.CharField(source='campagne.compte_participant', read_only=True)
    tiers = serializers.CharField(read_only=True)
    retenueIpm = serializers.IntegerField(source='retenue_ipm', read_only=True)
    retenuePaie = serializers.IntegerField(source='retenue_paie', read_only=True)
    # Ce qui repart vers la paie : la dette **après** le prélèvement du mois,
    # et la proposition qui va avec. Voir `LigneRetenue.solde_restant`.
    soldeRestant = serializers.IntegerField(source='solde_restant', read_only=True)
    retenueSuivante = serializers.IntegerField(source='retenue_suivante', read_only=True)
    excedent = serializers.IntegerField(read_only=True)
    etat = serializers.CharField(source='campagne.statut', read_only=True)

    class Meta:
        model = LigneRetenue
        fields = [
            'id', 'codeRetenue', 'matricule', 'codeSoc', 'prenoms', 'nom',
            'participantNom', 'compte', 'tiers', 'solde', 'retenueIpm',
            'retenuePaie', 'soldeRestant', 'retenueSuivante', 'excedent', 'etat',
        ]

    def get_participantNom(self, ligne):  # noqa: N802 - le champ s'appelle ainsi en JSON
        personne = ligne.participant
        return f'{personne.prenoms} {personne.nom}'.strip()


class CampagneRetenueSerializer(serializers.ModelSerializer):
    """La campagne vue de la liste : une ligne, ses totaux, son état."""

    cJl = serializers.SerializerMethodField()
    numPiece = serializers.CharField(source='code', read_only=True)
    datePiece = serializers.DateField(source='date_piece', read_only=True)
    dateSaisie = serializers.DateField(source='date_compta', read_only=True)
    moisTrait = serializers.DateField(source='date_trait', read_only=True)
    periode = serializers.CharField(read_only=True)
    libelle = serializers.CharField(read_only=True)

    societe = serializers.CharField(source='adherent.code', read_only=True)
    societeLibelle = serializers.CharField(source='adherent.libelle', read_only=True)
    compteGen = serializers.CharField(source='adherent.compte', read_only=True)
    compteParticipant = serializers.CharField(source='compte_participant', read_only=True)

    participants = serializers.IntegerField(read_only=True)
    preleves = serializers.IntegerField(read_only=True)
    totalPaie = serializers.IntegerField(source='total_paie', read_only=True)
    totalIpm = serializers.IntegerField(source='total_ipm', read_only=True)
    totalSolde = serializers.IntegerField(source='total_solde', read_only=True)
    anomalies = serializers.IntegerField(read_only=True)
    excedent = serializers.IntegerField(read_only=True)
    comptabilise = serializers.BooleanField(read_only=True)

    class Meta:
        model = CampagneRetenue
        fields = [
            'id', 'code', 'numPiece', 'cJl', 'societe', 'societeLibelle',
            'annee', 'mois', 'periode', 'datePiece', 'dateSaisie', 'moisTrait',
            'compteGen', 'compteParticipant', 'libelle', 'participants',
            'preleves', 'totalPaie', 'totalIpm', 'totalSolde', 'anomalies',
            'excedent', 'statut', 'comptabilise',
        ]

    def get_cJl(self, campagne):
        return JOURNAL_RETENUE


# ---------------------------------------------------------------------------
# La vue
# ---------------------------------------------------------------------------


class RetenuesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    L'écran des Retenues Frais Médicaux.

    En lecture seule par le chemin ordinaire : une campagne ne se crée pas au
    formulaire, elle se **déroule** depuis les soldes (action `appeler`), et
    ses montants ne se saisissent pas, ils s'**importent**. C'est tout le sens
    de l'écran, et un POST générique le contredirait.
    """

    serializer_class = CampagneRetenueSerializer
    queryset = (
        CampagneRetenue.objects.select_related('adherent').prefetch_related('lignes')
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'action', None) not in ('list', 'totaux'):
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

        statut = (params.get('statut') or '').strip()
        if statut and statut.lower() != 'tous':
            queryset = queryset.filter(statut=statut)
        return queryset

    # --- L'appel ------------------------------------------------------------

    @staticmethod
    def prelevables_de(adherent):
        """Les participants de la société, tous états confondus.

        Le tri sur l'état se ferait ici ; il n'y en a pas, et l'en-tête du
        module dit pourquoi. C'est le solde qui décide, pas le dossier.
        """
        return Participant.objects.filter(adherent=adherent).order_by('matricule')

    @classmethod
    def derouler(cls, campagne):
        """
        Photographier la dette : une ligne par participant qui doit quelque
        chose, avec son solde du jour et la proposition de l'IPM.

        Un participant à solde nul **n'entre pas** dans la campagne : il n'a
        rien à rembourser, et LAMPS ne le liste pas non plus (160 lignes pour
        344 participants en société 01).

        Relancer l'appel rephotographie les soldes - utile quand des factures
        sont passées depuis - mais **conserve les montants déjà importés** des
        participants encore présents. Perdre le fichier de la paie parce qu'on
        a cliqué sur « Appel Retenues » serait une punition, pas une règle.
        """
        soldes = soldes_participants(campagne.adherent)
        deja = {
            ligne.participant_id: ligne.retenue_paie
            for ligne in campagne.lignes.all()
        }
        nouvelles = []
        for participant in cls.prelevables_de(campagne.adherent):
            solde = soldes.get(participant.matricule, 0)
            if solde <= 0:
                continue
            nouvelles.append(
                LigneRetenue(
                    campagne=campagne, participant=participant, solde=solde,
                    retenue_ipm=retenue_proposee(solde),
                    retenue_paie=deja.get(participant.id, 0),
                )
            )
        with transaction.atomic():
            campagne.lignes.all().delete()
            LigneRetenue.objects.bulk_create(nouvelles)
        return len(nouvelles)

    @action(detail=False, methods=['post'])
    def appeler(self, request):
        """
        Le bouton « Appel Retenues » : ouvrir le mois et dérouler les dettes.

        C'est le premier geste du circuit, et rien ne peut le précéder : sans
        appel, l'import n'a aucune ligne à remplir. L'écran le dit plutôt que
        de rester vide sans explication.
        """
        code_societe = (request.data.get('societe') or '').strip()
        annee = request.data.get('annee')
        mois = request.data.get('mois')
        adherent = Adherent.objects.filter(code=code_societe).first()
        if not adherent:
            return Response(
                {'detail': 'Société inconnue.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            annee, mois = int(annee), int(mois)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Mois ou année manquants.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        if not 1 <= mois <= 12:
            return Response({'detail': 'Mois invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        campagne = CampagneRetenue.objects.filter(
            adherent=adherent, annee=annee, mois=mois,
        ).first()
        if campagne and campagne.comptabilise:
            return Response(
                {
                    'detail': f'La campagne {campagne.code} est comptabilisée : '
                    'elle ne peut plus être relancée.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        nouvelle = campagne is None
        if nouvelle:
            campagne = CampagneRetenue.objects.create(
                adherent=adherent, annee=annee, mois=mois,
                date_trait=dernier_jour(annee, mois),
                saisi_par=request.user if request.user.is_authenticated else None,
            )
        lignes = self.derouler(campagne)

        verbe = 'ouverte' if nouvelle else 'relancée'
        dette = (
            f'{lignes} participant(s) ont une dette'
            if lignes
            else "aucun participant n'a de dette"
        )
        return Response({
            'campagne': CampagneRetenueSerializer(campagne).data,
            **totaux_relus(campagne),
            'message': f'Campagne {campagne.code} {verbe} : {dette} en {campagne.periode}.',
        })

    # --- Les lignes ----------------------------------------------------------

    @action(detail=True, methods=['get'])
    def lignes(self, request, pk=None):
        """
        La liste nominative, avec son en-tête et ses totaux.

        Le paramètre `filtre` porte les trois boutons de l'original -
        **Voir tout / Anomalies / Normales**. Ce qu'ils désignent n'est pas
        dans les captures, et notre lecture est celle que les données
        imposent : une anomalie est une ligne où la paie a prélevé **au-delà
        de la dette**. C'est le seul défaut que la production porte vraiment,
        il est rare (1,5 % des lignes), et c'est exactement ce qu'un agent
        veut isoler avant de comptabiliser. Les deux autres candidats - l'écart
        entre Retenue IPM et Retenue Paie (14 252 lignes), les lignes restées
        à zéro (7 106) - sont bien trop fréquents pour mériter un bouton.
        """
        campagne = self.get_object()
        lignes = campagne.lignes.select_related(
            'participant', 'campagne', 'campagne__adherent',
        )

        terme = (request.query_params.get('recherche') or '').strip()
        if terme:
            lignes = lignes.filter(
                Q(participant__matricule__icontains=terme)
                | Q(participant__nom__icontains=terme)
                | Q(participant__prenoms__icontains=terme)
            )

        toutes = list(lignes)
        filtre = (request.query_params.get('filtre') or 'tout').lower()
        if filtre == 'anomalies':
            toutes = [ligne for ligne in toutes if ligne.excedent]
        elif filtre == 'normales':
            toutes = [ligne for ligne in toutes if not ligne.excedent]

        return Response({
            'campagne': CampagneRetenueSerializer(campagne).data,
            'entete': {
                'periode': campagne.periode,
                'titre': f'{campagne.adherent.code} - {campagne.adherent.libelle}',
                **totaux_relus(campagne),
            },
            'lignes': LigneRetenueSerializer(toutes, many=True).data,
        })

    # --- L'import -------------------------------------------------------------

    @action(detail=True, methods=['post'])
    def importer(self, request, pk=None):
        """
        Porter les montants du fichier de la paie sur les lignes de l'appel.

        Reçoit `[{matricule, montant}, …]`, lus de la colonne « Indicateur-
        Valeur » du classeur de Sage. Deux règles, et elles disent la même
        chose : **on signale, on ne décide pas à la place de l'agent**.

        - Les matricules que l'appel ne connaît pas sont **rendus**, pas
          ignorés : un agent parti en cours de mois figure encore sur l'état
          de la paie, et le taire le cacherait.
        - Les montants qui dépassent la dette sont **chargés quand même**, et
          comptés à part. Le montant est déjà retenu sur le bulletin de
          l'agent : le refuser ici ne le lui rendrait pas, et creuserait un
          écart entre notre comptabilité et celle de Sage. LAMPS n'en disait
          rien du tout, et la production porte 310 cas pour 8 563 422 F.
        """
        campagne = self.get_object()
        if campagne.comptabilise:
            return Response(
                {'detail': f'La campagne {campagne.code} est comptabilisée : '
                           'ses montants sont figés.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        montants = {}
        for entree in request.data.get('lignes') or []:
            matricule = str(entree.get('matricule') or '').strip()
            if matricule:
                montants[matricule] = int(entree.get('montant') or 0)

        lignes = list(campagne.lignes.select_related('participant'))
        connus, modifiees, depassements = set(), [], []
        for ligne in lignes:
            matricule = ligne.participant.matricule
            if matricule not in montants:
                continue
            connus.add(matricule)
            ligne.retenue_paie = montants[matricule]
            modifiees.append(ligne)
            if ligne.excedent:
                depassements.append({
                    'matricule': matricule,
                    'nom': f'{ligne.participant.prenoms} {ligne.participant.nom}'.strip(),
                    'solde': int(ligne.solde),
                    'retenuePaie': int(ligne.retenue_paie),
                    'excedent': ligne.excedent,
                })
        if modifiees:
            LigneRetenue.objects.bulk_update(modifiees, ['retenue_paie'])

        inconnus = sorted(set(montants) - connus)
        marque = lambda n: 's' if n > 1 else ''  # noqa: E731
        portes, ecartes = len(modifiees), len(inconnus)
        message = f'{portes} montant{marque(portes)} porté{marque(portes)}'
        if inconnus:
            message += f", {ecartes} matricule{marque(ecartes)} hors de l'appel"
        if depassements:
            # L'espace fine des milliers se pose à part : appliquer le
            # remplacement à la phrase entière lui mangerait sa virgule.
            total = format(sum(d['excedent'] for d in depassements), ',').replace(',', ' ')
            message += f', {len(depassements)} au-delà de la dette ({total} F)'
        return Response({
            'modifiees': portes,
            'inconnus': inconnus,
            'depassements': depassements,
            **totaux_relus(campagne),
            'message': message + '.',
        })

    # --- La comptabilisation ---------------------------------------------------

    @staticmethod
    def ecritures_de(campagne, jour=None):
        """
        Les écritures que la campagne produirait, **sans rien enregistrer**.

        C'est le contenu du modal « Aperçu écritures au journal », et c'est la
        même fonction qui sert à les écrire pour de bon : l'aperçu ne peut pas
        mentir sur ce qui sera posé.

            Cr 411001  participant, tiers 01-0699   retenue de la paie
            …          (une ligne par agent servi)
            Dr 463001  société                      le total

        Vérifié au franc près sur la pièce réelle `01-2026-6` : 102 crédits et
        un débit de 6 485 011. Les lignes à zéro ne descendent pas - une
        écriture sans montant encombre le grand livre sans rien y dire.
        """
        jour = jour or date.today()
        adherent = campagne.adherent
        commun = {
            'codej': JOURNAL_RETENUE,
            'date_piece': jour,
            'date_compta': jour,
            'date_trait': campagne.date_trait,
            'numpiece': campagne.code,
            'libelle': campagne.libelle,
            'codesoc': adherent.code,
            'numtrans': campagne.code,
        }
        lignes, total, rang = [], 0, 0
        for ligne in campagne.lignes.select_related('participant').order_by(
            'participant__matricule'
        ):
            montant = int(ligne.retenue_paie or 0)
            if montant <= 0:
                continue
            lignes.append(EcritureCompta(
                rang=rang,
                comptegen=campagne.compte_participant,
                comptetiers=ligne.tiers,
                matri=ligne.participant.matricule,
                debit=0, credit=montant, **commun,
            ))
            rang += 1
            total += montant

        if total:
            # La contrepartie unique : la société doit à l'IPM ce qu'elle a
            # retenu sur les salaires, et le lui reversera.
            lignes.append(EcritureCompta(
                rang=rang, comptegen=adherent.compte, comptetiers='',
                debit=total, credit=0, **commun,
            ))
        return lignes

    @staticmethod
    def en_clair(ecriture):
        """Une écriture de l'aperçu, telle que le modal l'affiche."""
        return {
            'codej': ecriture.codej,
            'datePiece': ecriture.date_piece,
            'dateCompta': ecriture.date_compta,
            'dateTrait': ecriture.date_trait,
            'numpiece': ecriture.numpiece,
            'comptegen': ecriture.comptegen,
            'comptetiers': ecriture.comptetiers,
            'matri': ecriture.matri,
            'libelle': ecriture.libelle,
            'debit': ecriture.debit,
            'credit': ecriture.credit,
        }

    @action(detail=True, methods=['get'])
    def apercu(self, request, pk=None):
        """Le modal de vérification : les écritures, et leurs deux totaux."""
        campagne = self.get_object()
        ecritures = self.ecritures_de(campagne)
        return Response({
            'campagne': CampagneRetenueSerializer(campagne).data,
            'ecritures': [self.en_clair(e) for e in ecritures],
            'debit': sum(e.debit for e in ecritures),
            'credit': sum(e.credit for e in ecritures),
        })

    @action(detail=False, methods=['post'])
    def comptabiliser(self, request):
        """
        Le bouton « Comptabiliser » : poser les écritures au journal RP.

        Une campagne sans aucun prélèvement est refusée - il n'y a rien à
        écrire. Une campagne déjà comptabilisée est ignorée sans erreur :
        c'est une sélection en lot, et redemander ce qui est fait ne doit pas
        faire échouer le reste.

        Les dépassements, eux, **ne bloquent pas** : ils ont été signalés à
        l'import et le sont encore dans l'aperçu. L'agent qui valide le fait
        en connaissance de cause, et c'est sa décision (2026-11-05).
        """
        identifiants = request.data.get('campagnes') or []
        campagnes = list(
            CampagneRetenue.objects.filter(pk__in=identifiants)
            .select_related('adherent').prefetch_related('lignes')
        )
        if not campagnes:
            return Response(
                {'detail': 'Aucune campagne sélectionnée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        faits, ignorees, refusees, signalees = [], [], [], 0
        aujourdhui = date.today()

        with transaction.atomic():
            for campagne in campagnes:
                if campagne.comptabilise:
                    ignorees.append(campagne.code)
                    continue
                ecritures = self.ecritures_de(campagne, aujourdhui)
                if not ecritures:
                    refusees.append(campagne.code)
                    continue
                EcritureCompta.objects.bulk_create(ecritures)
                signalees += campagne.anomalies
                campagne.statut = STATUT_APPEL_COMPTABILISE
                campagne.date_piece = aujourdhui
                campagne.date_compta = aujourdhui
                campagne.save(update_fields=['statut', 'date_piece', 'date_compta'])
                faits.append(campagne.code)

        parties = []
        if faits:
            parties.append(f'{len(faits)} campagne(s) comptabilisée(s)')
        if ignorees:
            parties.append(f'{len(ignorees)} déjà comptabilisée(s)')
        if refusees:
            parties.append(f'{len(refusees)} sans prélèvement, refusée(s)')
        if signalees:
            parties.append(f'{signalees} ligne(s) au-delà de la dette, passée(s) telles quelles')
        return Response({
            'comptabilisees': faits,
            'ignorees': ignorees,
            'refusees': refusees,
            'anomalies': signalees,
            'message': ', '.join(parties) + '.' if parties else 'Rien à comptabiliser.',
        })

    # --- Les listes des sélecteurs ---------------------------------------------

    @action(detail=False, methods=['get'])
    def references(self, request):
        """Les sociétés que les sélecteurs proposent."""
        societes = Adherent.objects.filter(actif=True).order_by('code')
        return Response({
            'societes': [
                {
                    'code': adherent.code,
                    'libelle': adherent.libelle,
                    'intitule': f'{adherent.code} - {adherent.libelle}',
                    'compte': adherent.compte,
                    'compteParticipant': f'{PREFIXE_COMPTE_PARTICIPANT}{adherent.code}',
                }
                for adherent in societes
            ],
            # Le plafond de la proposition, affiché plutôt que caché dans le
            # code : l'agent doit pouvoir lire d'où sort la colonne.
            'plafond': PLAFOND_RETENUE_IPM,
            'journal': JOURNAL_RETENUE,
        })

    @action(detail=False, methods=['get'])
    def totaux(self, request):
        """Le bandeau de la liste : les campagnes du filtre et leurs totaux."""
        campagnes = self.get_queryset()
        totaux = {'debit': 0, 'credit': 0, 'anomalies': 0, 'excedent': 0}
        for campagne in campagnes:
            total = campagne.total_paie
            totaux['debit'] += total
            totaux['credit'] += total
            totaux['anomalies'] += campagne.anomalies
            totaux['excedent'] += campagne.excedent
        return Response({
            **totaux,
            'campagnes': campagnes.count(),
            'comptabilisees': campagnes.filter(statut=STATUT_APPEL_COMPTABILISE).count(),
            'ouvertes': campagnes.filter(statut=STATUT_APPEL_OUVERT).count(),
        })

    @action(detail=False, methods=['get'])
    def periodes(self, request):
        """Les années qui portent une campagne, pour le sélecteur d'année."""
        annees = (
            CampagneRetenue.objects.values('annee')
            .annotate(campagnes=Count('id'))
            .order_by('-annee')
        )
        liste = [ligne['annee'] for ligne in annees]
        courante = date.today().year
        if courante not in liste:
            liste.insert(0, courante)
        return Response(liste)
