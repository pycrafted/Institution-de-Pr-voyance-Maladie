"""Vue des factures (module Traitements)."""

from datetime import date

from django.db import transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from donnees_de_base.views.base import ReferentielViewSet

from datetime import date as _date

from . import bons as bons_service
from .comptabilisation import generer_ecritures
from .editions import editer_liste_factures
from .liquidation import liquider
from .models import (
    ETAT_COMPTABILISEE,
    ETAT_EN_COURS,
    ETAT_PAYEE,
    ETAT_RECUE,
    ETAT_TRAITEE,
    TYPE_BON_MANUEL,
    TYPE_DIVERS,
    TYPE_SOINS,
    Facture,
    LiquidationBon,
)
from .serializers import EcritureComptaSerializer, FactureSerializer, LiquidationBonSerializer

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
        Crée un bon directement au traitement, sans document préexistant à
        rattacher (« Créer bon manuel », capture 38 ; surtout pour les factures
        « divers »). Corps : { matriculePart, participant, typeBenef,
        beneficiaire, actes:[…] }. Le bon est aussitôt liquidé (ses actes) et
        compte dans l'écart de la facture, comme un bon rattaché.
        """
        facture = self.get_object()
        if facture.etat not in (ETAT_RECUE, ETAT_EN_COURS):
            return Response(
                {'detail': 'La facture est déjà validée : on ne peut plus y ajouter de bon.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        actes, totaux = _normaliser_actes(request.data.get('actes'))
        if not actes:
            return Response(
                {'detail': 'Saisissez au moins un acte pour le bon manuel.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code_soc = facture.adherent.code if facture.adherent_id else ''
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
                document_id=prochain,
                numero=f'BMI{prochain:06d}',
                date_bon=date.today(),
                code_soc=code_soc,
                matricule_part=str(request.data.get('matriculePart', '')).strip(),
                participant=str(request.data.get('participant', '')).strip(),
                type_benef=str(request.data.get('typeBenef', '')).strip(),
                beneficiaire=str(request.data.get('beneficiaire', '')).strip(),
                actes=actes,
                **totaux,
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
