"""
Serializer de la facture.

Noms de champs de l'écran (cf. src/views/traitements/config.js), repris de
l'écran « Traitements → Factures » de l'application d'origine. Les tiers
circulent par leur code (société, spécialité, fournisseur) ; leurs noms
reviennent en lecture, lus sur leurs fiches.
"""

from rest_framework import serializers

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, FournisseurDivers, Specialite
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from documents.serializers.commun import lien

from .models import (
    MODES_PAIEMENT,
    TYPE_SOINS,
    Banque,
    EcritureCompta,
    Facture,
    LiquidationBon,
    OrdrePaiement,
)


class FactureSerializer(serializers.ModelSerializer):
    # Le « N° » interne de la liste est l'identifiant de la facture.
    numero = serializers.IntegerField(source='id', read_only=True)
    typeFournisseur = serializers.ChoiceField(
        source='type_fournisseur',
        choices=Facture._meta.get_field('type_fournisseur').choices,
        required=False,
    )
    numeroFournisseur = serializers.CharField(
        source='numero_fournisseur', required=False, allow_blank=True,
    )

    codeSoc = lien('adherent', Adherent, 'code', 'Société inconnue.')
    specialite = lien(None, Specialite, 'code', 'Spécialité inconnue.')
    # Résolu en validate selon le type de fournisseur (soins ou divers), rendu
    # dans to_representation.
    codeFournisseur = serializers.CharField(required=False, allow_blank=True, write_only=True)

    dateFacture = DateOuVide(source='date_facture')
    recuLe = DateOuVide(source='recu_le')
    saisieLe = DateOuVide(source='saisie_le', read_only=True)

    fraisReel = serializers.IntegerField(source='frais_reel', required=False, min_value=0)
    remise = serializers.IntegerField(required=False, min_value=0)
    ristourne = serializers.IntegerField(required=False, min_value=0)
    qpAgent = serializers.IntegerField(source='qp_agent', required=False, min_value=0)
    montantNet = serializers.IntegerField(source='montant_net', read_only=True)
    remboursementTicket = serializers.BooleanField(source='remboursement_ticket', required=False)
    typeRemb = serializers.CharField(source='type_remb', required=False, allow_blank=True)
    avoir = serializers.BooleanField(required=False)

    # Calculés / lecture seule tant que le traitement n'est pas fait.
    echeance = serializers.DateField(read_only=True)
    exercice = serializers.CharField(read_only=True)
    etat = serializers.CharField(read_only=True)
    moisTraitement = serializers.CharField(source='mois_traitement', read_only=True)
    traiteeLe = serializers.DateField(source='traitee_le', read_only=True)
    dateCompta = serializers.DateField(source='date_compta', read_only=True)
    payeeLe = serializers.DateField(source='payee_le', read_only=True)

    # --- Règlement (§17) : tout en lecture seule, posé par les actions dédiées. ---
    joursRetard = serializers.IntegerField(source='jours_retard', read_only=True)
    resteAPayer = serializers.IntegerField(source='reste_a_payer', read_only=True)
    etatReglement = serializers.CharField(source='etat_reglement', read_only=True)
    aPayer = serializers.BooleanField(source='a_payer', read_only=True)
    typeReglement = serializers.CharField(source='type_reglement', read_only=True)
    numeroReglement = serializers.CharField(source='numero_reglement', read_only=True)
    dateReglement = serializers.DateField(source='date_reglement', read_only=True)
    montantReglement = serializers.IntegerField(source='montant_reglement', read_only=True)
    acompte = serializers.BooleanField(read_only=True)

    # Noms lus sur les fiches des tiers.
    fournisseur = serializers.SerializerMethodField()
    saisiePar = serializers.SerializerMethodField()
    traiteePar = serializers.SerializerMethodField()
    comptabiliseePar = serializers.SerializerMethodField()

    class Meta:
        model = Facture
        fields = [
            'id',
            'numero',
            'typeFournisseur',
            'numeroFournisseur',
            'codeSoc',
            'specialite',
            'codeFournisseur',
            'fournisseur',
            'dateFacture',
            'recuLe',
            'saisieLe',
            'echeance',
            'exercice',
            'fraisReel',
            'remise',
            'ristourne',
            'qpAgent',
            'montantNet',
            'remboursementTicket',
            'typeRemb',
            'avoir',
            'etat',
            'moisTraitement',
            'traiteeLe',
            'dateCompta',
            'payeeLe',
            'joursRetard',
            'resteAPayer',
            'etatReglement',
            'aPayer',
            'typeReglement',
            'numeroReglement',
            'dateReglement',
            'montantReglement',
            'acompte',
            'saisiePar',
            'traiteePar',
            'comptabiliseePar',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def validate(self, attrs):
        # Le fournisseur se résout selon le type : fournisseur de soins (par
        # spécialité) ou fournisseur divers.
        code = attrs.pop('codeFournisseur', None)
        type_fournisseur = attrs.get('type_fournisseur') or (
            self.instance.type_fournisseur if self.instance else TYPE_SOINS
        )
        if code is not None:
            attrs['fournisseur_soins'] = None
            attrs['fournisseur_divers'] = None
            if code:
                if type_fournisseur == TYPE_SOINS:
                    fournisseur = FournisseurDeSoins.objects.filter(code=code).first()
                    if fournisseur is None:
                        raise serializers.ValidationError(
                            {'codeFournisseur': ['Fournisseur de soins inconnu.']}
                        )
                    attrs['fournisseur_soins'] = fournisseur
                else:
                    fournisseur = FournisseurDivers.objects.filter(code=code).first()
                    if fournisseur is None:
                        raise serializers.ValidationError(
                            {'codeFournisseur': ['Fournisseur divers inconnu.']}
                        )
                    attrs['fournisseur_divers'] = fournisseur
        return attrs

    def to_representation(self, facture):
        donnees = super().to_representation(facture)
        if facture.fournisseur_soins_id:
            donnees['codeFournisseur'] = facture.fournisseur_soins.code
        elif facture.fournisseur_divers_id:
            donnees['codeFournisseur'] = facture.fournisseur_divers.code
        else:
            donnees['codeFournisseur'] = ''
        return donnees

    def get_fournisseur(self, facture):
        if facture.fournisseur_soins_id:
            return facture.fournisseur_soins.libelle
        if facture.fournisseur_divers_id:
            return facture.fournisseur_divers.libelle
        return ''

    def get_saisiePar(self, facture):
        return facture.saisie_par.username if facture.saisie_par_id else ''

    def get_traiteePar(self, facture):
        return facture.traitee_par.username if facture.traitee_par_id else ''

    def get_comptabiliseePar(self, facture):
        return facture.comptabilisee_par.username if facture.comptabilisee_par_id else ''


class LiquidationBonSerializer(serializers.ModelSerializer):
    """Une ligne « Bons traités » (capture 38) : le bon rattaché et sa liquidation."""

    typeDocument = serializers.CharField(source='type_document', read_only=True)
    typeManuel = serializers.CharField(source='type_manuel', read_only=True)
    remboursementIntegral = serializers.BooleanField(
        source='remboursement_integral', read_only=True
    )
    documentId = serializers.IntegerField(source='document_id', read_only=True)
    date = serializers.DateField(source='date_bon', read_only=True)
    codeSoc = serializers.CharField(source='code_soc', read_only=True)
    matriculePart = serializers.CharField(source='matricule_part', read_only=True)
    typeBenef = serializers.CharField(source='type_benef', read_only=True)

    class Meta:
        model = LiquidationBon
        fields = [
            'id',
            'typeDocument',
            'typeManuel',
            'remboursementIntegral',
            'documentId',
            'numero',
            'date',
            'codeSoc',
            'matriculePart',
            'participant',
            'typeBenef',
            'beneficiaire',
            'freel',
            'qpipm',
            'qppart',
            'qpassur',
            'fexclus',
            'ajustement',
            'remise',
            'actes',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = fields


class EcritureComptaSerializer(serializers.ModelSerializer):
    """Une ligne d'écriture comptable (journal du traitement)."""

    datePiece = serializers.DateField(source='date_piece', read_only=True)
    dateCompta = serializers.DateField(source='date_compta', read_only=True)

    class Meta:
        model = EcritureCompta
        fields = [
            'id',
            'rang',
            'codej',
            'datePiece',
            'dateCompta',
            'numpiece',
            'comptegen',
            'comptetiers',
            'libelle',
            'debit',
            'credit',
            'numdoc',
            'numfactfrs',
            'numfactipm',
            'codesoc',
            'matri',
            'numfourn',
        ]
        read_only_fields = fields


class BanqueSerializer(serializers.ModelSerializer):
    """Référentiel des banques (B1..B10) : code, libellé, réseau, compte 521xxx."""

    class Meta:
        model = Banque
        fields = ['id', 'code', 'libelle', 'reseau', 'compte', 'actif', 'cree_le', 'modifie_le']
        read_only_fields = ['id', 'cree_le', 'modifie_le']


class OrdrePaiementSerializer(serializers.ModelSerializer):
    """
    Un ordre de paiement (chèque / virement libre). N° Enreg. et N° pièce sont
    posés par le serveur ; le modal « Etablir » saisit mode, date, montant,
    motif, bénéficiaire et banque.
    """

    numeroEnreg = serializers.IntegerField(source='numero_enreg', read_only=True)
    dateSaisie = serializers.DateField(source='date_saisie', read_only=True)
    modePaiement = serializers.ChoiceField(source='mode_paiement', choices=MODES_PAIEMENT, required=False)
    modePaiementLibelle = serializers.CharField(source='get_mode_paiement_display', read_only=True)
    datePiece = DateOuVide(source='date_piece', required=False)
    numeroPiece = serializers.CharField(source='numero_piece', read_only=True)
    montant = serializers.IntegerField(required=False, min_value=0)
    aOrdreDe = serializers.CharField(source='a_ordre_de', required=False, allow_blank=True)
    motif = serializers.CharField(required=False, allow_blank=True)
    banque = serializers.SlugRelatedField(
        slug_field='code', queryset=Banque.objects.all(), required=False, allow_null=True,
    )
    banqueLibelle = serializers.SerializerMethodField()
    exercice = serializers.CharField(read_only=True)
    aImprimer = serializers.BooleanField(source='a_imprimer', required=False)

    class Meta:
        model = OrdrePaiement
        fields = [
            'id',
            'numeroEnreg',
            'dateSaisie',
            'modePaiement',
            'modePaiementLibelle',
            'datePiece',
            'numeroPiece',
            'montant',
            'aOrdreDe',
            'motif',
            'banque',
            'banqueLibelle',
            'aImprimer',
            'exercice',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def get_banqueLibelle(self, ordre):
        return ordre.banque.libelle if ordre.banque_id else ''
