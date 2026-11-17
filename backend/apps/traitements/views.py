"""Vue des factures (module Traitements)."""

import math
from datetime import date

from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.views.base import ReferentielViewSet
from donnees_de_base.views.exercice import FiltreExerciceMixin

from datetime import date as _date

from . import bons as bons_service
from .comptabilisation import generer_ecritures
from .editions import editer_liste_factures
from .impression_bon_achat import bon_achat_pdf
from .liquidation import arrondi, liquider, taux_et_plafond
from .reglement import (
    generer_ecritures_annulation_reglement,
    generer_ecritures_reglement,
)
from .remboursement import (
    generer_ecritures_comptabilisation_remboursement,
    generer_ecritures_reglement_remboursement,
    ligne_banque_du_cheque,
)
from .models import (
    CODES_BON_MANUEL,
    ETAT_COMPTABILISEE,
    ETAT_EN_COURS,
    ETAT_PAYEE,
    ETAT_RECUE,
    ETAT_TRAITEE,
    TYPE_BON_MANUEL,
    TYPE_DIVERS,
    TYPE_SOINS,
    Banque,
    BonAchat,
    EcritureCompta,
    Facture,
    LiquidationBon,
    OrdrePaiement,
)
from .serializers import (
    BanqueSerializer,
    BonAchatSerializer,
    EcritureComptaSerializer,
    FactureSerializer,
    LiquidationBonSerializer,
    OrdrePaiementSerializer,
)

# « sept.-2026 » : le mois de traitement, comme l'application d'origine.
_MOIS = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]


def _mois_traitement(jour):
    return f'{_MOIS[jour.month - 1]}-{jour.year}'


def _premier_du_mois(jour):
    """Le mois comptable, en date : toujours le 1er, comme `datetrait`."""
    return jour.replace(day=1)


def _poser_mois_comptable(facture, jour=None):
    """
    Fixe le mois comptable de la facture, s'il ne l'est pas déjà.

    L'étiquette (« oct.-2026 ») et la date (2026-10-01) vont de pair : la
    première s'affiche, la seconde porte les écritures. Renvoie la liste des
    champs modifiés, à joindre à `update_fields`.
    """
    jour = jour or date.today()
    champs = []
    if not facture.mois_traitement:
        facture.mois_traitement = _mois_traitement(jour)
        champs.append('mois_traitement')
    if not facture.date_trait:
        facture.date_trait = _premier_du_mois(jour)
        champs.append('date_trait')
    return champs


def _entier(valeur):
    try:
        return int(valeur or 0)
    except (TypeError, ValueError):
        return 0


def _normaliser_actes(bruts):
    """Nettoie les lignes d'actes saisies et en calcule les totaux agrégés."""
    actes = []
    totaux = {'freel': 0, 'qpipm': 0, 'qppart': 0, 'qpassur': 0, 'fexclus': 0, 'ajustement': 0}
    for brut in bruts or []:
        if not isinstance(brut, dict):
            continue
        prestation = str(brut.get('prestation', '')).strip()
        freel = max(0, _entier(brut.get('freel')))
        if not prestation and freel == 0:
            continue
        qpipm = max(0, _entier(brut.get('qpipm')))
        qppart = max(0, _entier(brut.get('qppart')))
        qpassur = max(0, _entier(brut.get('qpassur')))
        fexclus = max(0, _entier(brut.get('fexclus')))
        ajustement = _entier(brut.get('ajustement'))
        quantite = max(1, _entier(brut.get('quantite')) or 1)
        actes.append({
            'prestation': prestation,
            'libelle': str(brut.get('libelle', '')),
            'quantite': quantite,
            'freel': freel,
            'qpipm': qpipm,
            'qppart': qppart,
            'qpassur': qpassur,
            'fexclus': fexclus,
            'ajustement': ajustement,
        })
        totaux['freel'] += freel
        totaux['qpipm'] += qpipm
        totaux['qppart'] += qppart
        totaux['qpassur'] += qpassur
        totaux['fexclus'] += fexclus
        totaux['ajustement'] += ajustement
    return actes, totaux


class FactureViewSet(FiltreExerciceMixin, ReferentielViewSet):
    """
    Même socle que les référentiels (liste, création, modification, écoute de
    fond) : le composant <Referentiel /> du frontend affiche la liste et sert
    la réception sans code spécifique. S'y ajoutent les actions du traitement :
    bons en instance, rattachement, validation. Pas d'import Excel.
    """

    queryset = Facture.objects.select_related(
        'adherent',
        'specialite',
        'fournisseur_soins',
        'fournisseur_divers',
        'saisie_par',
        'traitee_par',
        'comptabilisee_par',
    )
    # L'exercice d'une facture se lit sur SA date, celle que le
    # prestataire a portée dessus - pas sur la date de réception.
    champ_exercice = 'date_facture'
    serializer_class = FactureSerializer
    importer = None

    # Pagination serveur (cf. ReferentielViewSet) : 24 668 factures. La facture
    # n'a pas de code : son identifiant est son id (exposé « numero »), et
    # l'ordre par id décroissant est déjà chronologique (et indexé par la clé).
    champs_recherche = (
        'numero_fournisseur',
        'numero_reglement',
        'fournisseur_soins__libelle',
        'fournisseur_divers__libelle',
        'adherent__libelle',
    )
    tris = {
        'numero': ['-id'],
        'date': ['-date_facture', '-id'],
        'fournisseur': ['fournisseur_soins__libelle', 'fournisseur_divers__libelle', '-id'],
    }
    tri_defaut = ['-id']
    # Filtres de liste des pages Factures ET Règlements (même endpoint) : Société,
    # État de la facture, Spécialité, et - pour les règlements - l'état du
    # règlement (segments « Non Echue / Echue / Reglée / … »).
    filtres_liste = {
        'codeSoc': 'adherent__code',
        'etat': 'etat',
        'specialite': 'specialite__code',
        'etatReglement': 'etat_reglement',
    }

    def get_queryset(self):
        """Le socle (exercice) + le type de fournisseur, + le filtre « réglable ».

        La page « Factures » a deux onglets, Soins et Divers, sur le même
        endpoint : en pagination serveur, la distinction se fait ici
        (``?type=soins|divers``) et non sur la page. La page « Règlements »
        réutilise le même endpoint mais ne montre que les factures
        **réglables** (``?reglable=true``) : non remboursement-ticket et déjà
        comptabilisées ou payées (cf. estReglable côté écran).
        """
        queryset = super().get_queryset()
        type_frs = (self.request.query_params.get('type') or '').strip().lower()
        if type_frs in (TYPE_SOINS, TYPE_DIVERS):
            queryset = queryset.filter(type_fournisseur=type_frs)
        if (self.request.query_params.get('reglable') or '').strip().lower() == 'true':
            queryset = queryset.filter(
                remboursement_ticket=False, etat__in=[ETAT_COMPTABILISEE, ETAT_PAYEE],
            )
        return queryset

    def perform_create(self, serializer):
        # Réception : la facture entre « Reçue », avec l'auteur et le jour de
        # saisie. Le numéro interne est l'identifiant, posé par la base.
        serializer.save(
            saisie_par=self.request.user,
            saisie_le=date.today(),
            etat=ETAT_RECUE,
        )

    # --- Traitement ----------------------------------------------------------
    @action(detail=True, methods=['get'], url_path='bons-en-instance')
    def bons_en_instance(self, request, pk=None):
        """Les bons/lettres émis pour le prestataire de la facture, non traités."""
        return Response(bons_service.bons_en_instance(self.get_object()))

    @action(detail=True, methods=['get'], url_path='bons-traites')
    def bons_traites(self, request, pk=None):
        """Les bons déjà rattachés et liquidés sur cette facture."""
        facture = self.get_object()
        serializer = LiquidationBonSerializer(facture.bons.all(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def rattacher(self, request, pk=None):
        """
        Rattache un bon à la facture et le liquide (proposition 85/15 ajustable,
        cf. liquidation.py). Corps : { typeDocument, documentId }.
        """
        facture = self.get_object()
        type_document = request.data.get('typeDocument')
        document_id = request.data.get('documentId')
        bon = bons_service.charger_bon(type_document, document_id)
        if bon is None:
            return Response(
                {'detail': 'Bon introuvable.'}, status=status.HTTP_404_NOT_FOUND
            )
        if LiquidationBon.objects.filter(
            type_document=type_document, document_id=document_id
        ).exists():
            return Response(
                {'detail': 'Ce bon est déjà rattaché à une facture.'},
                status=status.HTTP_409_CONFLICT,
            )

        infos = bons_service.infos_bon(bon, type_document)
        code_soc = infos['codeSoc']
        # La nature de la prestation ouvre le barème : sans elle, un bon
        # optique serait liquidé au taux de la pharmacie.
        montants = liquider(
            infos['montant'], code_soc, infos['typeBenef'],
            code_prestation=infos.get('prestation'),
        )

        with transaction.atomic():
            liquidation = LiquidationBon.objects.create(
                facture=facture,
                type_document=type_document,
                document_id=bon.id,
                numero=infos['numero'],
                date_bon=bon.date,
                code_soc=code_soc,
                matricule_part=infos['matriculePart'],
                participant=infos['participant'],
                type_benef=infos['typeBenef'],
                beneficiaire=infos['beneficiaire'],
                **montants,
            )
            # Le bon quitte la liste des émis : il est traité, rattaché à cette
            # facture (son N° de facture est celui du fournisseur).
            bon.traite = True
            bon.numero_facture = facture.numero_fournisseur or str(facture.id)
            bon.save(update_fields=['traite', 'numero_facture', 'modifie_le'])
            # La facture passe « en cours de traitement » dès le premier bon.
            if facture.etat == ETAT_RECUE:
                facture.etat = ETAT_EN_COURS
                champs = _poser_mois_comptable(facture)
                facture.traitee_par = request.user
                facture.save(update_fields=['etat', 'traitee_par', 'modifie_le'] + champs)

        return Response(LiquidationBonSerializer(liquidation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def liquider(self, request, pk=None):
        """
        Liquide un bon **acte par acte** (capture 39) : enregistre les lignes
        d'actes (prestation, frais réel, QP.IPM, QP.PART…) et en recalcule les
        totaux. Crée la liquidation si le bon n'était pas encore rattaché, la
        met à jour sinon. Corps : { typeDocument, documentId, actes:[…] }.
        """
        facture = self.get_object()
        type_document = request.data.get('typeDocument')
        document_id = request.data.get('documentId')
        bon = bons_service.charger_bon(type_document, document_id)
        if bon is None:
            return Response({'detail': 'Bon introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        actes, totaux = _normaliser_actes(request.data.get('actes'))
        infos = bons_service.infos_bon(bon, type_document)

        with transaction.atomic():
            liquidation = LiquidationBon.objects.filter(
                type_document=type_document, document_id=document_id
            ).first()
            if liquidation is None:
                liquidation = LiquidationBon(
                    type_document=type_document, document_id=document_id
                )
            liquidation.facture = facture
            liquidation.numero = infos['numero']
            liquidation.date_bon = bon.date
            liquidation.code_soc = infos['codeSoc']
            liquidation.matricule_part = infos['matriculePart']
            liquidation.participant = infos['participant']
            liquidation.type_benef = infos['typeBenef']
            liquidation.beneficiaire = infos['beneficiaire']
            liquidation.actes = actes
            liquidation.freel = totaux['freel']
            liquidation.qpipm = totaux['qpipm']
            liquidation.qppart = totaux['qppart']
            liquidation.qpassur = totaux['qpassur']
            liquidation.fexclus = totaux['fexclus']
            liquidation.ajustement = totaux['ajustement']
            liquidation.save()

            bon.traite = True
            bon.numero_facture = facture.numero_fournisseur or str(facture.id)
            bon.save(update_fields=['traite', 'numero_facture', 'modifie_le'])
            if facture.etat == ETAT_RECUE:
                facture.etat = ETAT_EN_COURS
                champs = _poser_mois_comptable(facture)
                facture.traitee_par = request.user
                facture.save(
                    update_fields=['etat', 'traitee_par', 'modifie_le'] + champs
                )

        return Response(LiquidationBonSerializer(liquidation).data)

    @action(detail=True, methods=['post'], url_path='creer-bon-manuel')
    def creer_bon_manuel(self, request, pk=None):
        """
        Crée un bon manuel au traitement d'une facture (capture 69) : on choisit
        un TYPE de document (4 types de bon + bon d'avoir + ticket remboursement),
        un n°, une date, un MONTANT, le participant et le bénéficiaire, et l'option
        « remboursement intégral ». La liquidation se fait sur le seul montant,
        SANS saisie d'actes : QP.IPM = taux × montant (ou = montant si intégral),
        QP.PART = montant − QP.IPM. Le bon s'ajoute aux bons traités et compte dans
        l'écart. En interne il reste un « manuel » (séquence BMI propre, pas de
        collision avec un vrai document) ; le type choisi est gardé dans `type_manuel`.

        Corps : { typeManuel, numero, date, montant, matriculePart, participant,
        typeBenef, beneficiaire, remboursementIntegral }.
        """
        facture = self.get_object()
        if facture.etat not in (ETAT_RECUE, ETAT_EN_COURS):
            return Response(
                {'detail': 'La facture est déjà validée : on ne peut plus y ajouter de bon.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        d = request.data
        type_manuel = str(d.get('typeManuel', '')).strip()
        if type_manuel not in CODES_BON_MANUEL:
            return Response(
                {'detail': 'Choisissez un type de document.'}, status=status.HTTP_400_BAD_REQUEST
            )
        montant = max(0, _entier(d.get('montant')))
        if montant <= 0:
            return Response(
                {'detail': 'Saisissez un montant.'}, status=status.HTTP_400_BAD_REQUEST
            )
        matricule_part = str(d.get('matriculePart', '')).strip()
        if not matricule_part:
            return Response(
                {'detail': 'Choisissez un participant.'}, status=status.HTTP_400_BAD_REQUEST
            )
        beneficiaire = str(d.get('beneficiaire', '')).strip()
        if not beneficiaire:
            return Response(
                {'detail': 'Choisissez un bénéficiaire.'}, status=status.HTTP_400_BAD_REQUEST
            )

        code_soc = facture.adherent.code if facture.adherent_id else ''
        integral = bool(d.get('remboursementIntegral'))
        # Le bon manuel porte le **type de document** qu'il remplace : il donne
        # donc la nature de prestation d'un bon de pharmacie ou d'un bon
        # optique, et le barème s'ouvre comme pour un vrai bon. Pour un avoir
        # ou un ticket, il n'y a pas de nature : le moteur retombe sur son
        # filet, ce qui est le comportement d'avant.
        taux, plafond = taux_et_plafond(
            code_soc, bons_service.PRESTATION_IMPLICITE.get(type_manuel), str(d.get('typeBenef', '')),
        )
        # Remboursement intégral : l'IPM prend 100 %. Sinon, le barème.
        qpipm = montant if integral else arrondi(taux * montant / 100)
        if plafond and not integral:
            qpipm = min(qpipm, plafond)
        qpipm = min(qpipm, montant)
        qppart = max(0, montant - qpipm)
        date_bon = parse_date(str(d.get('date', '')) or '') or date.today()
        numero_saisi = str(d.get('numero', '')).strip()

        # Numéro et identifiant propres aux bons manuels (séquence « BMI… »).
        dernier = (
            LiquidationBon.objects.filter(type_document=TYPE_BON_MANUEL)
            .order_by('-document_id')
            .first()
        )
        prochain = (dernier.document_id + 1) if dernier else 1
        with transaction.atomic():
            liquidation = LiquidationBon.objects.create(
                facture=facture,
                type_document=TYPE_BON_MANUEL,
                type_manuel=type_manuel,
                document_id=prochain,
                numero=numero_saisi or f'BMI{prochain:06d}',
                date_bon=date_bon,
                code_soc=code_soc,
                matricule_part=matricule_part,
                participant=str(d.get('participant', '')).strip()[:160],
                # Code du lien de parenté (« 1 » = le participant lui-même).
                type_benef=str(d.get('typeBenef', '')).strip()[:4],
                beneficiaire=beneficiaire,
                remboursement_integral=integral,
                freel=montant,
                qpipm=qpipm,
                qppart=qppart,
                actes=[],
            )
            if facture.etat == ETAT_RECUE:
                facture.etat = ETAT_EN_COURS
                champs = _poser_mois_comptable(facture)
                facture.traitee_par = request.user
                facture.save(
                    update_fields=['etat', 'traitee_par', 'modifie_le'] + champs
                )
        return Response(
            LiquidationBonSerializer(liquidation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def detacher(self, request, pk=None):
        """Détache un bon de la facture (il redevient « en instance »).

        Corps : { liquidationId }."""
        facture = self.get_object()
        liquidation = facture.bons.filter(id=request.data.get('liquidationId')).first()
        if liquidation is None:
            return Response({'detail': 'Ligne introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            bon = bons_service.charger_bon(liquidation.type_document, liquidation.document_id)
            if bon is not None:
                bon.traite = False
                bon.numero_facture = ''
                bon.save(update_fields=['traite', 'numero_facture', 'modifie_le'])
            liquidation.delete()
            # Plus aucun bon : la facture revient « Reçue ».
            if facture.etat == ETAT_EN_COURS and not facture.bons.exists():
                facture.etat = ETAT_RECUE
                facture.save(update_fields=['etat', 'modifie_le'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        """Valide la facture : elle passe « Traitée »."""
        facture = self.get_object()
        if not facture.bons.exists():
            return Response(
                {'detail': 'Aucun bon rattaché : rien à valider.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        facture.etat = ETAT_TRAITEE
        facture.traitee_le = date.today()
        facture.traitee_par = request.user
        if not facture.mois_traitement:
            facture.mois_traitement = _mois_traitement(date.today())
        facture.save(
            update_fields=['etat', 'traitee_le', 'traitee_par', 'mois_traitement', 'modifie_le']
        )
        return Response(self.get_serializer(facture).data)

    @action(detail=True, methods=['get'])
    def ecritures(self, request, pk=None):
        """Les écritures comptables de la facture (après comptabilisation)."""
        facture = self.get_object()
        serializer = EcritureComptaSerializer(facture.ecritures.all(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def comptabiliser(self, request, pk=None):
        """
        Comptabilise une facture **traitée** : engendre les écritures du journal
        IF (débit prestation/participant par bon, crédit fournisseur) et passe la
        facture « Comptabilisée ». Les factures « divers » ne sont pas encore
        prises en charge (circuit comptable non décodé).
        """
        facture = self.get_object()
        if facture.type_fournisseur != TYPE_SOINS:
            return Response(
                {'detail': 'La comptabilisation des factures « divers » est à venir.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if facture.etat != ETAT_TRAITEE:
            return Response(
                {'detail': 'Seule une facture validée (« Traitée ») se comptabilise.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not facture.bons.exists():
            return Response(
                {'detail': 'Aucun bon rattaché : rien à comptabiliser.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Filet : une facture sans mois comptable n'aurait aucune écriture
            # visible au Journal Central, qui se range sur cet axe.
            champs_mois = _poser_mois_comptable(facture)
            facture.ecritures.all().delete()
            EcritureCompta = facture.ecritures.model
            if facture.remboursement_ticket:
                # Circuit remboursement : l'assuré a avancé l'argent. Le
                # prestataire n'a rien à recevoir et le ticket reste à la
                # charge de l'agent - le schéma du tiers payant (Cr 400
                # fournisseur, Dr 411 ticket) serait faux ici. On pose la
                # reconnaissance de dette envers l'assuré, journal RIB/RIC.
                lignes = []
                for bon in facture.bons.all():
                    ecritures, _m = generer_ecritures_comptabilisation_remboursement(
                        bon, _date.today(), depart=len(lignes)
                    )
                    lignes.extend(ecritures)
            else:
                lignes, _total = generer_ecritures(facture)
            EcritureCompta.objects.bulk_create(lignes)
            facture.etat = ETAT_COMPTABILISEE
            facture.date_compta = _date.today()
            facture.comptabilisee_par = request.user
            facture.save(
                update_fields=['etat', 'date_compta', 'comptabilisee_par', 'modifie_le']
                + champs_mois
            )
        return Response(self.get_serializer(facture).data)

    # --- Règlements : paiement des factures (§17) ---------------------------
    @action(detail=False, methods=['post'])
    def regler(self, request):
        """
        Règle (paie) une ou plusieurs factures comptabilisées. Corps :
        { typeReglement, numeroReglement, dateReglement, lignes:[{id, montant}] }.
        Le montant s'ajoute au déjà réglé : s'il couvre le montant net, la facture
        passe « Payée » ; sinon c'est un acompte (paiement partiel).
        """
        data = request.data
        type_r = str(data.get('typeReglement', '')).strip()
        numero_r = str(data.get('numeroReglement', '')).strip()
        try:
            date_r = date.fromisoformat(str(data.get('dateReglement', '')))
        except ValueError:
            date_r = date.today()
        lignes = data.get('lignes') or []
        if not type_r:
            return Response(
                {'detail': 'Choisissez un type de règlement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not lignes:
            return Response(
                {'detail': 'Aucune facture à régler.'}, status=status.HTTP_400_BAD_REQUEST
            )
        reglees = []
        with transaction.atomic():
            for ligne in lignes:
                # `remboursement_ticket=False` : une facture de remboursement
                # ne se règle pas au fournisseur (il a été payé au comptoir par
                # l'assuré), mais à l'assuré, page « Remboursement Frais
                # Médicaux ». Dans LAMPS, aucune des 6 643 n'a de règlement.
                facture = Facture.objects.filter(
                    id=ligne.get('id'), etat=ETAT_COMPTABILISEE,
                    remboursement_ticket=False,
                ).first()
                if facture is None:
                    continue
                montant = max(0, int(ligne.get('montant') or 0))
                facture.type_reglement = type_r
                facture.numero_reglement = numero_r
                facture.date_reglement = date_r
                facture.montant_reglement = min(
                    facture.montant_net, facture.montant_reglement + montant
                )
                facture.a_payer = False
                if facture.montant_reglement >= facture.montant_net:
                    facture.acompte = False
                    facture.etat = ETAT_PAYEE
                    facture.payee_le = date_r
                else:
                    facture.acompte = True
                facture.save()
                reglees.append(facture.id)
        return Response({'reglees': reglees})

    @action(detail=False, methods=['post'], url_path='a-payer')
    def marquer_a_payer(self, request):
        """Marque des factures comptabilisées « à payer » (drapeau). Corps : { ids }."""
        ids = request.data.get('ids') or []
        n = Facture.objects.filter(
            id__in=ids, etat=ETAT_COMPTABILISEE, remboursement_ticket=False
        ).update(a_payer=True)
        return Response({'marquees': n})

    @action(detail=False, methods=['post'], url_path='annuler-a-payer')
    def annuler_a_payer(self, request):
        """Retire le drapeau « à payer ». Corps : { ids }."""
        ids = request.data.get('ids') or []
        n = Facture.objects.filter(id__in=ids).update(a_payer=False)
        return Response({'annulees': n})

    def _lot_a_comptabiliser(self, request):
        """Les factures réglées non encore comptabilisées, et la banque choisie."""
        ids = request.data.get('ids') or []
        code_banque = str(request.data.get('banque', '')).strip()
        banque = Banque.objects.filter(code=code_banque).first() if code_banque else None
        # `montant_reglement__gt=0` plutôt que « Payée » : un acompte est un
        # règlement, il sort de l'argent et doit se comptabiliser, même si la
        # facture reste partiellement due.
        factures = Facture.objects.filter(
            id__in=ids, actif=True, montant_reglement__gt=0,
            reglement_comptabilise=False, remboursement_ticket=False,
        ).select_related('adherent', 'specialite', 'fournisseur_soins', 'fournisseur_divers')
        return list(factures), banque

    @action(detail=False, methods=['post'], url_path='apercu-reglement')
    def apercu_reglement(self, request):
        """
        « Aperçu écritures au journal » (capture 60) : les écritures telles
        qu'elles seront posées, sans rien enregistrer. L'utilisateur les lit,
        vérifie le solde, puis valide - ou renonce.
        """
        factures, banque = self._lot_a_comptabiliser(request)
        if banque is None:
            return Response(
                {'detail': 'Choisissez la banque qui a payé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lignes, total = generer_ecritures_reglement(factures, banque, _date.today())
        return Response({
            'ecritures': EcritureComptaSerializer(lignes, many=True).data,
            'total': total,
            'factures': [f.id for f in factures],
        })

    @action(detail=False, methods=['post'], url_path='comptabiliser-reglement')
    def comptabiliser_reglement(self, request):
        """
        Second geste du règlement (capture 59, bouton « Comptabiliser ») :
        écrit au journal de la banque et fait passer les factures à
        « Comptabilisée ». Régler pose le chèque sur la facture ; c'est ici que
        la comptabilité l'enregistre, parfois des semaines plus tard.
        """
        factures, banque = self._lot_a_comptabiliser(request)
        if banque is None:
            return Response(
                {'detail': 'Choisissez la banque qui a payé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not factures:
            return Response(
                {'detail': 'Aucune facture réglée à comptabiliser.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            lignes, _total = generer_ecritures_reglement(factures, banque, _date.today())
            EcritureCompta.objects.bulk_create(lignes)
            for facture in factures:
                facture.banque_reglement = banque.code
                facture.reglement_comptabilise = True
                facture.save(
                    update_fields=['banque_reglement', 'reglement_comptabilise', 'modifie_le']
                )
        return Response({'comptabilisees': [f.id for f in factures]})

    @action(detail=False, methods=['post'], url_path='annuler-reglement')
    def annuler_reglement(self, request):
        """
        Annule le règlement : la facture redevient « Comptabilisée », non payée.

        Si le règlement avait été comptabilisé, ses écritures ne sont pas
        effacées : elles sont contre-passées en négatif, comme le fait
        l'application d'origine.
        """
        ids = request.data.get('ids') or []
        annulees = []
        with transaction.atomic():
            for facture in Facture.objects.filter(id__in=ids):
                if facture.reglement_comptabilise:
                    EcritureCompta.objects.bulk_create(
                        generer_ecritures_annulation_reglement(facture)
                    )
                    facture.reglement_comptabilise = False
                    facture.banque_reglement = ''
                facture.type_reglement = ''
                facture.numero_reglement = ''
                facture.date_reglement = None
                facture.montant_reglement = 0
                facture.acompte = False
                facture.payee_le = None
                if facture.etat == ETAT_PAYEE:
                    facture.etat = ETAT_COMPTABILISEE
                facture.save()
                annulees.append(facture.id)
        return Response({'annulees': annulees})

    # --- Éditions : états imprimés des règlements (§17) ---------------------
    @action(detail=False, methods=['get'])
    def edition(self, request):
        """
        Un état imprimé (PDF) parmi : « Factures à Payer » (drapeau A Payer) et
        « Factures non Payées » (comptabilisées, non réglées). Paramètres :
        ?etat=a-payer|non-payees & type=soins|divers & exercice=AAAA (facultatif).
        """
        etat = str(request.query_params.get('etat', 'a-payer')).strip()
        type_fournisseur = (
            TYPE_DIVERS if request.query_params.get('type') == 'divers' else TYPE_SOINS
        )
        exercice = str(request.query_params.get('exercice', '')).strip()

        # Les remboursements sont hors de ces états : ils ne se paient pas au
        # fournisseur. Les laisser ferait figurer sur « Factures non Payées »
        # des factures qui ne le seront jamais - 6 628 dans LAMPS.
        factures = Facture.objects.filter(
            actif=True, type_fournisseur=type_fournisseur, remboursement_ticket=False
        ).select_related('adherent', 'specialite', 'fournisseur_soins', 'fournisseur_divers')

        if etat == 'a-payer':
            factures = factures.filter(etat=ETAT_COMPTABILISEE, a_payer=True)
            titre = 'Factures à Payer'
        else:
            factures = factures.filter(etat=ETAT_COMPTABILISEE)
            titre = 'Factures non Payées'
            etat = 'non-payees'

        factures = sorted(factures, key=lambda f: (f.recu_le or f.date_facture or date.min))
        # L'exercice (année de réception) se filtre sur la propriété calculée.
        if exercice:
            factures = [f for f in factures if f.exercice == exercice]

        libelle_type = (
            'Fournisseurs de Soins' if type_fournisseur == TYPE_SOINS else 'Fournisseurs Divers'
        )
        sous_titre = libelle_type + (f' - Exercice {exercice}' if exercice else '')
        pdf = editer_liste_factures(titre, sous_titre, factures)

        reponse = HttpResponse(pdf, content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="{etat}-{type_fournisseur}.pdf"'
        return reponse


class BanqueViewSet(ReferentielViewSet):
    """Référentiel des banques (B1..B10) - journaux et comptes 521xxx (§18)."""

    queryset = Banque.objects.all()
    serializer_class = BanqueSerializer
    importer = None


class OrdrePaiementViewSet(ReferentielViewSet):
    """
    Ordres de paiement (chèques / virements libres), §18. N° d'enregistrement et
    N° de pièce (chèque) posés par le serveur ; le reste vient du modal Etablir.
    """

    queryset = OrdrePaiement.objects.select_related('banque')
    serializer_class = OrdrePaiementSerializer
    importer = None

    # Pagination serveur (cf. ReferentielViewSet) : ils s'accumulent au fil des
    # paiements. Tri par N° d'enregistrement (le plus récent), recherche sur le
    # bénéficiaire, le chèque, le motif et la banque.
    champs_recherche = ('numero_piece', 'a_ordre_de', 'motif', 'banque__libelle')
    tris = {
        'numero': ['-numero_enreg'],
        'beneficiaire': ['a_ordre_de', '-numero_enreg'],
        'banque': ['banque__libelle', '-numero_enreg'],
    }
    tri_defaut = ['-numero_enreg']

    def perform_create(self, serializer):
        # Les ordres n'ont pas de « code » : on pose le N° d'enregistrement et le
        # N° de chèque (séquence du chéquier de la banque) nous-mêmes.
        banque = serializer.validated_data.get('banque')
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(
            numero_enreg=OrdrePaiement.prochain_enreg(),
            numero_piece=OrdrePaiement.prochain_numero_piece(banque),
            saisi_par=user,
        )


# ===========================================================================
# Suspensions (§19, captures 63-64) : vues calculées (lecture seule).
#
# Optique : la périodicité biennale, dérivée des bons optique (dernier bon par
# bénéficiaire ; date prochaine = date + 2 ans ; encore suspendu si à venir).
# Consommation totale : cumul des frais liquidés par participant et par exercice
# (le filtrage par plafond annuel reste à faire - seuil non encore capturé).
# ===========================================================================
from rest_framework import viewsets  # noqa: E402

from documents.models import BonOptique  # noqa: E402
from participants.models import Participant  # noqa: E402


def _plus_deux_ans(jour):
    """Même jour, deux ans plus tard (29 février → 28)."""
    try:
        return jour.replace(year=jour.year + 2)
    except ValueError:
        return jour.replace(year=jour.year + 2, day=28)


def _age(naissance, reference):
    if not naissance:
        return ''
    return reference.year - naissance.year - (
        (reference.month, reference.day) < (naissance.month, naissance.day)
    )


# Plafond annuel de consommation : au-delà, le participant est « suspendu » et
# apparaît dans l'onglet Consommation totale. Règle métier : SEULS LES RETRAITÉS
# (sociétés 03 CMM CR-SAR et 04 CMM NCR-SAR) ont un plafond, fixé à 700 000 CFA/an.
# Les actifs (01/02) n'ont pas de plafond et ne sont jamais suspendus à ce titre.
PLAFOND_CONSOMMATION_ANNUEL = 700000
SOCIETES_RETRAITES = ('03', '04')


class SuspensionsViewSet(viewsets.ViewSet):
    """Deux vues : Optique (périodicité) et Consommation totale (plafond)."""

    @action(detail=False)
    def optique(self, request):
        aujourdhui = date.today()
        bons = (
            BonOptique.objects.filter(actif=True)
            .select_related('adherent', 'participant', 'beneficiaire', 'fournisseur')
            .order_by('date')
        )
        # Dernier bon optique par bénéficiaire (ou par participant lui-même).
        dernier = {}
        for b in bons:
            cle = f'b{b.beneficiaire_id}' if b.beneficiaire_id else f'p{b.participant_id}'
            dernier[cle] = b
        lignes = []
        for b in dernier.values():
            prochaine = _plus_deux_ans(b.date)
            if prochaine <= aujourdhui:
                continue  # période écoulée : plus suspendu
            soc = b.adherent.code if b.adherent_id else ''
            if b.beneficiaire_id:
                personne = b.beneficiaire
                matricule = b.beneficiaire.matricule_benef
                beneficiaire = b.beneficiaire.nom_complet
            else:
                personne = b.participant
                matricule = f'{soc}-{b.participant.matricule}-1' if b.participant_id else ''
                beneficiaire = 'LUI-MÊME'
            lignes.append({
                'id': b.id,
                'matricule': matricule,
                'participant': b.participant.nom_complet if b.participant_id else '',
                'beneficiaire': beneficiaire,
                'sexe': getattr(personne, 'sexe', '') or '',
                'societe': soc,
                'age': _age(getattr(personne, 'date_naissance', None), aujourdhui),
                'numeroBon': b.code,
                'dateBon': b.date.isoformat() if b.date else '',
                'fraisReel': b.montant_total,
                'qpPart': 0,  # renseigné à la liquidation (pas disponible sur le bon seul)
                'dateProchaine': prochaine.isoformat(),
                'joursRestants': (aujourdhui - prochaine).days,
                'fournisseur': b.fournisseur.libelle if b.fournisseur_id else '',
            })
        # Du plus proche de la réouverture (-1) au plus lointain.
        lignes.sort(key=lambda ligne: ligne['joursRestants'], reverse=True)
        return Response(lignes)

    @action(detail=False)
    def consommation(self, request):
        aujourdhui = date.today()
        exercice = str(request.query_params.get('exercice') or aujourdhui.year)
        cumul = {}
        # Seuls les retraités (03/04) ont un plafond : on n'agrège qu'eux.
        for lb in LiquidationBon.objects.filter(
            date_bon__year=exercice, code_soc__in=SOCIETES_RETRAITES
        ):
            mp = lb.matricule_part or ''
            entree = cumul.setdefault(
                mp, {'participant': lb.participant, 'societe': lb.code_soc, 'consommation': 0}
            )
            entree['consommation'] += lb.freel
            if not entree['participant'] and lb.participant:
                entree['participant'] = lb.participant
        lignes = []
        for mp, entree in cumul.items():
            mat = mp.split('-')[-1] if mp else ''
            p = Participant.objects.filter(matricule=mat).first()
            lignes.append({
                'id': mp,
                'matricule': mp,
                'participant': entree['participant'] or (p.nom_complet if p else ''),
                'sexe': (p.sexe if p else '') or '',
                'societe': entree['societe'],
                'age': _age(p.date_naissance, aujourdhui) if p else '',
                'telephone': (p.mobile if p else '') or '',
                'consommation': entree['consommation'],
            })
        # On ne retient que les retraités qui DÉPASSENT le plafond annuel (700 000) :
        # c'est ça « être suspendu » pour consommation excessive.
        lignes = [l for l in lignes if l['consommation'] > PLAFOND_CONSOMMATION_ANNUEL]
        lignes.sort(key=lambda ligne: ligne['consommation'], reverse=True)
        return Response({'plafond': PLAFOND_CONSOMMATION_ANNUEL, 'lignes': lignes})


def _representer_remboursement(bon):
    """Une ligne de la page « Remboursement Frais Médicaux » (capture 66)."""
    f = bon.facture
    par_banque = (f.type_remb or '') == 'banque'
    return {
        'id': bon.id,
        'codeJournal': 'RIB' if par_banque else 'RIC',
        'datePiece': bon.date_bon,
        'moisTraitement': f.mois_traitement,
        'dateSaisie': bon.cree_le.date() if bon.cree_le else None,
        'numTicket': str(f.id),
        'numFactIpm': str(f.id),
        'participant': bon.participant,
        'matriculePart': bon.matricule_part,
        'codeSoc': bon.code_soc,
        'libelle': bon.beneficiaire or bon.participant,
        'rembourse': bon.rembourse,
        'typeRemb': f.type_remb or '',
        'fraisReel': bon.freel,
        'montantDu': bon.qpipm,
        'exercice': str(bon.date_bon.year) if bon.date_bon else '',
        'moisNum': str(bon.date_bon.month) if bon.date_bon else '',
        'etatRemboursement': 'Réglé' if bon.rembourse else 'Non réglé',
        # Une ligne de remboursement ne se désactive pas : sans ce drapeau, le
        # tableau générique la barrerait et l'annoncerait « Inactif ».
        'actif': True,
        'reglementMethode': bon.reglement_methode,
        'reglementNumero': bon.reglement_numero,
        'reglementBanque': bon.reglement_banque,
    }


class RemboursementViewSet(viewsets.ViewSet):
    """
    Page « Remboursement Frais Médicaux » (Traitements → Remboursement) : les
    bons de remboursement (bons manuels des factures « Remboursement ticket »)
    à rembourser aux participants, et leur règlement (écritures RIB/RIC + Bx).
    """

    def _bons(self):
        return (
            LiquidationBon.objects.filter(
                type_document=TYPE_BON_MANUEL,
                facture__remboursement_ticket=True,
            )
            .select_related('facture', 'facture__adherent')
            .order_by('-date_bon', 'id')
        )

    def _liste_filtree(self, request):
        """Les bons de remboursement, filtrés comme la page les demande.

        Mêmes filtres que l'écran (exercice, société, mois, type, segment
        Réglé / Non réglé, recherche) mais appliqués à la base : en pagination
        serveur, la page n'a plus la liste entière pour filtrer elle-même.
        """
        queryset = self._bons()
        params = request.query_params

        exercice = (params.get('exercice') or '').strip()
        if exercice.isdigit():
            queryset = queryset.filter(date_bon__year=int(exercice))

        code_soc = (params.get('codeSoc') or '').strip()
        if code_soc and code_soc.lower() != 'tous':
            queryset = queryset.filter(code_soc=code_soc)

        mois = (params.get('moisNum') or '').strip()
        if mois.isdigit() and 1 <= int(mois) <= 12:
            queryset = queryset.filter(date_bon__month=int(mois))

        type_remb = (params.get('typeRemb') or '').strip()
        if type_remb and type_remb.lower() != 'tous':
            queryset = queryset.filter(facture__type_remb=type_remb)

        rembourse = (params.get('rembourse') or '').strip().lower()
        if rembourse in ('true', 'false'):
            queryset = queryset.filter(rembourse=(rembourse == 'true'))

        recherche = (params.get('recherche') or '').strip()
        if recherche:
            queryset = queryset.filter(
                Q(participant__icontains=recherche)
                | Q(matricule_part__icontains=recherche)
                | Q(beneficiaire__icontains=recherche)
            )
        return queryset

    def list(self, request):
        """Tout (mode client) ou une tranche (pagination serveur, si ``page``)."""
        queryset = self._liste_filtree(request)
        if request.query_params.get('page') is None:
            return Response([_representer_remboursement(b) for b in queryset])

        def entier(valeur, defaut, mini, maxi):
            try:
                return max(mini, min(int(valeur), maxi))
            except (TypeError, ValueError):
                return defaut

        total = queryset.count()
        taille = entier(request.query_params.get('taille'), 25, 1, 200)
        pages = max(1, math.ceil(total / taille))
        page = entier(request.query_params.get('page'), 1, 1, pages)
        debut = (page - 1) * taille
        lignes = list(queryset[debut:debut + taille])
        return Response({
            'resultats': [_representer_remboursement(b) for b in lignes],
            'count': total,
            'pages': pages,
            'page': page,
            'taille': taille,
        })

    @action(detail=False, methods=['get'], url_path='etat')
    def etat(self, request):
        """
        État compact de la liste (filtres compris), comme le socle des
        référentiels : l'écoute de fond du frontend l'interroge pour savoir s'il
        faut recharger. Sans cette action, chaque sondage répondait 404 et la
        page ne se rafraîchissait jamais toute seule.
        """
        return Response(
            self._liste_filtree(request).order_by().aggregate(
                nombre=Count('pk'), dernier_changement=Max('modifie_le')
            )
        )

    @action(detail=False, methods=['post'])
    def regler(self, request):
        """
        Règle (rembourse) une ou plusieurs lignes. Corps : { ids, methode (C/V/T),
        numero, banque (Bx), date }. Pose le PAIEMENT seul (journal Bx : un débit
        411 par prestation, puis UNE ligne 521 pour tout le chèque, comme LAMPS),
        la dette ayant été inscrite à la comptabilisation, et marque les bons
        « Remboursé ».
        """
        data = request.data
        ids = data.get('ids') or []
        methode = str(data.get('methode', '')).strip()
        numero = str(data.get('numero', '')).strip()
        code_banque = str(data.get('banque', '')).strip()
        try:
            date_r = date.fromisoformat(str(data.get('date', '')))
        except ValueError:
            date_r = date.today()
        if not methode:
            return Response(
                {'detail': 'Choisissez une méthode de paiement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not ids:
            return Response(
                {'detail': 'Aucun remboursement sélectionné.'}, status=status.HTTP_400_BAD_REQUEST
            )
        banque = Banque.objects.filter(code=code_banque).first() if code_banque else None
        reglees = []
        with transaction.atomic():
            bons = self._bons().filter(id__in=ids, rembourse=False)
            refuses = []
            # Le chèque est unique pour tout le lot : on cumule ce qu'il paie,
            # pour n'écrire qu'une seule sortie de banque à la fin.
            total_cheque = 0
            rang_cheque = 0
            for bon in bons:
                # Un remboursement « par banque » exige une banque.
                if (bon.facture.type_remb or '') == 'banque' and banque is None:
                    continue
                # Et la facture doit être comptabilisée : sans cela, l'IPM
                # paierait une dette qu'elle n'a jamais inscrite. C'est l'ordre
                # de LAMPS, où 99,8 % des factures de remboursement finissent
                # « Comptabilisée ».
                if bon.facture.etat != ETAT_COMPTABILISEE:
                    refuses.append(bon.facture.id)
                    continue
                # Seul le PAIEMENT est posé ici : la reconnaissance de la
                # dette (Dr 602 / Cr 411) a été écrite à la comptabilisation
                # de la facture. La poser une seconde fois doublerait la
                # charge et la dette.
                lignes, paye = generer_ecritures_reglement_remboursement(
                    bon, banque, numero, date_r, depart=rang_cheque
                )
                EcritureCompta.objects.bulk_create(lignes)
                rang_cheque += len(lignes)
                total_cheque += paye
                bon.rembourse = True
                bon.rembourse_le = date_r
                bon.reglement_methode = methode
                bon.reglement_numero = numero
                bon.reglement_banque = banque.code if banque else ''
                bon.save(
                    update_fields=[
                        'rembourse', 'rembourse_le', 'reglement_methode',
                        'reglement_numero', 'reglement_banque', 'modifie_le',
                    ]
                )
                reglees.append(bon.id)
            # La sortie d'argent, une fois pour le chèque entier : c'est la
            # dernière ligne du lot dans LAMPS, sans tiers et sans facture.
            sortie = ligne_banque_du_cheque(
                banque, numero, date_r, total_cheque, rang=rang_cheque + 1
            )
            if sortie is not None:
                sortie.save()
        if refuses and not reglees:
            return Response(
                {
                    'detail': 'Facture n° %s non comptabilisée : validez-la puis '
                    'comptabilisez-la avant de rembourser.'
                    % ', '.join(str(i) for i in sorted(set(refuses)))
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'reglees': reglees, 'refusees': sorted(set(refuses))})


# ===========================================================================
# Bons d'Achats (captures 79-80)
# ===========================================================================


class BonAchatViewSet(FiltreExerciceMixin, ReferentielViewSet):
    """
    Les bons de commande d'achats : lister, créer (numéro « BA000013 » posé par
    le serveur), modifier, annuler, et le bon imprimé en PDF.

    **Le filtre année/mois filtre vraiment.** L'écran d'origine affichait un
    sélecteur d'année et de mois qui ne restreignait rien : il annonçait
    « 2026 / Octobre » au-dessus d'une ligne de janvier 2025. Un filtre qui
    ment est pire qu'un filtre absent, donc l'exercice (socle commun) et le
    mois sont tous deux appliqués ici, par le serveur.

    Sans import Excel : on ne reprend pas une liste de commandes d'un tableur.
    """

    queryset = BonAchat.objects.select_related('fournisseur', 'saisi_par').prefetch_related(
        'lignes', 'lignes__article',
    )
    # L'exercice se lit sur la date d'enregistrement du bon.
    champ_exercice = 'date_bon'
    serializer_class = BonAchatSerializer
    importer = None

    # Pagination serveur (cf. ReferentielViewSet) : les commandes s'accumulent.
    # Recherche sur le numéro, le fournisseur et l'offre ; tri au plus récent.
    champs_recherche = ('code', 'fournisseur__libelle', 'num_offre')
    tris = {
        'code': ['-code'],
        'date': ['-date_bon', '-code'],
        'fournisseur': ['fournisseur__libelle', '-code'],
    }
    tri_defaut = ['-date_bon', '-code']

    def get_queryset(self):
        queryset = super().get_queryset()
        # Le mois et le statut, comme l'exercice, ne bornent que la liste et
        # l'écoute : un lien vers un vieux bon doit rester ouvrable.
        if getattr(self, 'action', None) in ('list', 'etat'):
            mois = (self.request.query_params.get('mois') or '').strip()
            if mois.isdigit() and 1 <= int(mois) <= 12:
                queryset = queryset.filter(date_bon__month=int(mois))
            statut = (self.request.query_params.get('statut') or '').strip()
            if statut:
                queryset = queryset.filter(statut=statut)
        return queryset

    def perform_create(self, serializer):
        # Numéro de la séquence des bons d'achats, et l'auteur de la saisie.
        code = serializer.validated_data.get('code') or BonAchat.prochain_code()
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(code=code, saisi_par=user)

    @action(detail=False, methods=['get'], url_path='prochain-numero')
    def prochain_numero(self, request):
        """Le numéro que portera le prochain bon, pour l'afficher au modal."""
        return Response({'code': BonAchat.prochain_code()})

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Le bon de commande imprimé."""
        bon = self.get_object()
        reponse = HttpResponse(bon_achat_pdf(bon), content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse
