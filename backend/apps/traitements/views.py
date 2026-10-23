"""Vue des factures (module Traitements)."""

from datetime import date

from django.db import transaction
from django.db.models import Count, Max
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.views.base import ReferentielViewSet

from datetime import date as _date

from . import bons as bons_service
from .comptabilisation import generer_ecritures
from .editions import editer_liste_factures
from .liquidation import liquider, taux_societe
from .remboursement import generer_ecritures_remboursement
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
    EcritureCompta,
    Facture,
    LiquidationBon,
    OrdrePaiement,
)
from .serializers import (
    BanqueSerializer,
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


class FactureViewSet(ReferentielViewSet):
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
    serializer_class = FactureSerializer
    importer = None

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
        montants = liquider(infos['montant'], code_soc, infos['typeBenef'])

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
                if not facture.mois_traitement:
                    facture.mois_traitement = _mois_traitement(date.today())
                facture.traitee_par = request.user
                facture.save(update_fields=['etat', 'mois_traitement', 'traitee_par', 'modifie_le'])

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
                if not facture.mois_traitement:
                    facture.mois_traitement = _mois_traitement(date.today())
                facture.traitee_par = request.user
                facture.save(
                    update_fields=['etat', 'mois_traitement', 'traitee_par', 'modifie_le']
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
        taux = taux_societe(code_soc)
        # Remboursement intégral : l'IPM prend 100 %. Sinon, le taux de la société.
        qpipm = montant if integral else round(taux * montant / 100)
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
                if not facture.mois_traitement:
                    facture.mois_traitement = _mois_traitement(date.today())
                facture.traitee_par = request.user
                facture.save(
                    update_fields=['etat', 'mois_traitement', 'traitee_par', 'modifie_le']
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
            facture.ecritures.all().delete()
            lignes, _total = generer_ecritures(facture)
            EcritureCompta = facture.ecritures.model
            EcritureCompta.objects.bulk_create(lignes)
            facture.etat = ETAT_COMPTABILISEE
            facture.date_compta = _date.today()
            facture.comptabilisee_par = request.user
            facture.save(
                update_fields=['etat', 'date_compta', 'comptabilisee_par', 'modifie_le']
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
                facture = Facture.objects.filter(
                    id=ligne.get('id'), etat=ETAT_COMPTABILISEE
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
        n = Facture.objects.filter(id__in=ids, etat=ETAT_COMPTABILISEE).update(a_payer=True)
        return Response({'marquees': n})

    @action(detail=False, methods=['post'], url_path='annuler-a-payer')
    def annuler_a_payer(self, request):
        """Retire le drapeau « à payer ». Corps : { ids }."""
        ids = request.data.get('ids') or []
        n = Facture.objects.filter(id__in=ids).update(a_payer=False)
        return Response({'annulees': n})

    @action(detail=False, methods=['post'], url_path='annuler-reglement')
    def annuler_reglement(self, request):
        """Annule le règlement : la facture redevient « Comptabilisée », non payée."""
        ids = request.data.get('ids') or []
        annulees = []
        with transaction.atomic():
            for facture in Facture.objects.filter(id__in=ids):
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

        factures = Facture.objects.filter(
            actif=True, type_fournisseur=type_fournisseur
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

    def list(self, request):
        return Response([_representer_remboursement(b) for b in self._bons()])

    @action(detail=False, methods=['get'], url_path='etat')
    def etat(self, request):
        """
        État compact de la liste, comme le socle des référentiels : l'écoute de
        fond du frontend l'interroge pour savoir s'il faut recharger. Sans cette
        action, chaque sondage répondait 404 et la page ne se rafraîchissait
        jamais toute seule.
        """
        return Response(
            self._bons().order_by().aggregate(
                nombre=Count('pk'), dernier_changement=Max('modifie_le')
            )
        )

    @action(detail=False, methods=['post'])
    def regler(self, request):
        """
        Règle (rembourse) une ou plusieurs lignes. Corps : { ids, methode (C/V/T),
        numero, banque (Bx), date }. Pose les écritures (comptabilisation RIB/RIC
        Dr 602 / Cr 411, puis, si banque, règlement Bx Dr 411 / Cr 521) et marque
        les bons « Remboursé ».
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
            for bon in bons:
                # Un remboursement « par banque » exige une banque.
                if (bon.facture.type_remb or '') == 'banque' and banque is None:
                    continue
                lignes, _m = generer_ecritures_remboursement(bon, banque, numero, date_r)
                EcritureCompta.objects.bulk_create(lignes)
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
        return Response({'reglees': reglees})
