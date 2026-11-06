"""
Serializer de la facture.

Noms de champs de l'écran (cf. src/views/traitements/config.js), repris de
l'écran « Traitements → Factures » de l'application d'origine. Les tiers
circulent par leur code (société, spécialité, fournisseur) ; leurs noms
reviennent en lecture, lus sur leurs fiches.
"""

from rest_framework import serializers

from adherents.models import Adherent
from donnees_de_base.models import (
    ArticleAchat,
    FournisseurDeSoins,
    FournisseurDivers,
    Specialite,
)
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from documents.serializers.commun import lien

from .models import (
    MODES_PAIEMENT,
    STATUTS_BON_ACHAT,
    TAUX_TVA_DEFAUT,
    TYPE_SOINS,
    Banque,
    BonAchat,
    EcritureCompta,
    Facture,
    LigneBonAchat,
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
    banqueReglement = serializers.CharField(source='banque_reglement', read_only=True)
    reglementComptabilise = serializers.BooleanField(
        source='reglement_comptabilise', read_only=True
    )
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
            'banqueReglement',
            'reglementComptabilise',
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
    # Le mois comptable : la colonne « Mois trait. » de l'aperçu (capture 60).
    dateTrait = serializers.DateField(source='date_trait', read_only=True)

    class Meta:
        model = EcritureCompta
        fields = [
            'id',
            'rang',
            'codej',
            'datePiece',
            'dateCompta',
            'dateTrait',
            'numpiece',
            'numcheque',
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


# ===========================================================================
# Bons d'Achats (captures 79-80)
# ===========================================================================


class LigneBonAchatSerializer(serializers.ModelSerializer):
    """
    Une ligne commandée. L'article circule par son code (« ART0003 ») ; sa
    désignation et son **prix de catalogue** reviennent en lecture - le second
    est affiché à côté du prix saisi, pour que l'écart se remarque.

    Les montants sont calculés par le modèle : on ne les reçoit jamais de
    l'écran, sans quoi deux additions pourraient se contredire.
    """

    article = serializers.SlugRelatedField(
        slug_field='code', queryset=ArticleAchat.objects.all(),
    )
    designation = serializers.SerializerMethodField()
    prixCatalogue = serializers.SerializerMethodField()
    compte = serializers.SerializerMethodField()
    prixUnitaire = serializers.IntegerField(source='prix_unitaire', min_value=0)
    tauxTva = serializers.IntegerField(
        source='taux_tva', required=False, min_value=0, max_value=100, default=TAUX_TVA_DEFAUT,
    )
    tauxRemise = serializers.IntegerField(
        source='taux_remise', required=False, min_value=0, max_value=100, default=0,
    )
    montantHt = serializers.IntegerField(source='montant_ht', read_only=True)
    montantRemise = serializers.IntegerField(source='montant_remise', read_only=True)
    montantTva = serializers.IntegerField(source='montant_tva', read_only=True)
    montantTtc = serializers.IntegerField(source='montant_ttc', read_only=True)

    class Meta:
        model = LigneBonAchat
        fields = [
            'id',
            'article',
            'designation',
            'compte',
            'prixCatalogue',
            'quantite',
            'prixUnitaire',
            'tauxTva',
            'tauxRemise',
            'montantHt',
            'montantRemise',
            'montantTva',
            'montantTtc',
            'rang',
        ]

    def get_designation(self, ligne):
        return ligne.article.libelle if ligne.article_id else ''

    def get_prixCatalogue(self, ligne):
        return ligne.article.prix_unitaire if ligne.article_id else 0

    def get_compte(self, ligne):
        """Compte d'achat de rattachement : la charge que la ligne alimentera."""
        return ligne.article.compte if ligne.article_id else ''


class BonAchatSerializer(serializers.ModelSerializer):
    """
    Un bon de commande d'achat, lignes comprises.

    Le fournisseur circule par son compte (« 401019 »), comme à l'écran
    d'origine, où le sous-compte 401 du plan comptable tient lieu de
    référentiel. Les lignes s'écrivent avec le bon : le modal les envoie en
    bloc, et l'enregistrement reprend la liste reçue.
    """

    # Posé par le serveur (« BA000013 ») : absent du formulaire.
    code = serializers.CharField(read_only=True)
    fournisseur = serializers.SlugRelatedField(
        slug_field='code', queryset=FournisseurDivers.objects.all(),
    )
    fournisseurLibelle = serializers.SerializerMethodField()
    dateBon = DateOuVide(source='date_bon', required=False)
    dateLivraison = DateOuVide(source='date_livraison', required=False)
    numOffre = serializers.CharField(source='num_offre', required=False, allow_blank=True)
    statut = serializers.ChoiceField(
        choices=STATUTS_BON_ACHAT, required=False,
    )
    contact = serializers.CharField(required=False, allow_blank=True)
    contactEmail = serializers.CharField(
        source='contact_email', required=False, allow_blank=True,
    )
    conditionPaiement = serializers.CharField(
        source='condition_paiement', required=False, allow_blank=True,
    )
    adresseLivraison = serializers.CharField(
        source='adresse_livraison', required=False, allow_blank=True,
    )
    remarque = serializers.CharField(required=False, allow_blank=True)
    referenceFacture = serializers.CharField(
        source='reference_facture', required=False, allow_blank=True,
    )

    lignes = LigneBonAchatSerializer(many=True, required=False)

    totalHt = serializers.IntegerField(source='total_ht', read_only=True)
    totalRemise = serializers.IntegerField(source='total_remise', read_only=True)
    totalTva = serializers.IntegerField(source='total_tva', read_only=True)
    # « Montant » de la liste : le TTC, comme la colonne de l'origine.
    montant = serializers.IntegerField(source='total_ttc', read_only=True)

    saisiPar = serializers.SerializerMethodField()
    exercice = serializers.CharField(read_only=True)

    class Meta:
        model = BonAchat
        fields = [
            'id',
            'code',
            'fournisseur',
            'fournisseurLibelle',
            'dateBon',
            'dateLivraison',
            'numOffre',
            'statut',
            'contact',
            'contactEmail',
            'conditionPaiement',
            'adresseLivraison',
            'remarque',
            'referenceFacture',
            'lignes',
            'totalHt',
            'totalRemise',
            'totalTva',
            'montant',
            'saisiPar',
            'exercice',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def get_fournisseurLibelle(self, bon):
        return bon.fournisseur.libelle if bon.fournisseur_id else ''

    def get_saisiPar(self, bon):
        return bon.saisi_par.username if bon.saisi_par_id else ''

    def validate(self, attrs):
        """
        Un bon porte au moins une ligne : sans elle, il ne commande rien.

        L'écran applique déjà la règle - « Enregistrer » reste pâli tant
        qu'aucune ligne n'est validée - mais un appel direct à l'API doit se
        heurter à la même.
        """
        lignes = attrs.get('lignes')
        if lignes is None and self.instance is not None:
            return attrs
        if not lignes:
            raise serializers.ValidationError(
                {'lignes': 'Saisissez au moins une ligne : un bon sans ligne ne commande rien.'}
            )
        return attrs

    def create(self, validated_data):
        lignes = validated_data.pop('lignes', [])
        bon = BonAchat.objects.create(**validated_data)
        self._ecrire_lignes(bon, lignes)
        return bon

    def update(self, instance, validated_data):
        # `lignes` absent = le modal n'y a pas touché (modification en lot, par
        # exemple) ; présent = il remplace la liste entière.
        lignes = validated_data.pop('lignes', None)
        for champ, valeur in validated_data.items():
            setattr(instance, champ, valeur)
        instance.save()
        if lignes is not None:
            instance.lignes.all().delete()
            self._ecrire_lignes(instance, lignes)
        return instance

    @staticmethod
    def _ecrire_lignes(bon, lignes):
        """
        Réécrit les lignes du bon dans l'ordre reçu.

        Les lignes n'ont pas de vie propre - rien ne les désigne de
        l'extérieur - donc les remplacer en bloc est plus simple, et plus sûr,
        que de rapprocher l'ancienne liste de la nouvelle.
        """
        LigneBonAchat.objects.bulk_create(
            [
                LigneBonAchat(
                    bon=bon,
                    article=ligne['article'],
                    quantite=ligne.get('quantite', 1),
                    prix_unitaire=ligne.get('prix_unitaire', 0),
                    taux_tva=ligne.get('taux_tva', TAUX_TVA_DEFAUT),
                    taux_remise=ligne.get('taux_remise', 0),
                    rang=rang,
                )
                for rang, ligne in enumerate(lignes)
            ]
        )
