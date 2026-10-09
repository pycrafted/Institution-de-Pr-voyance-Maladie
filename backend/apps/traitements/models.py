"""
Factures des prestataires - module « Traitements ».

Une facture est émise par un prestataire (fournisseur de soins ou fournisseur
divers), réceptionnée par l'IPM, puis traitée (on y rattache les bons/lettres
émis pour ce prestataire et on liquide chaque bon acte par acte), validée et
comptabilisée. Repris de l'écran « Traitements → Factures » de l'application
d'origine (table `factures` ; captures 36 à 39).

Tranche 1 : la **réception** et la **liste**. Les champs du traitement, de la
comptabilisation et du paiement existent déjà sur le modèle mais ne se
remplissent qu'aux tranches suivantes (ils restent vides à la réception).
"""

from datetime import date, timedelta

from django.conf import settings
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, FournisseurDivers, Specialite

# Les deux sous-onglets de la liste d'origine.
TYPE_SOINS = 'soins'
TYPE_DIVERS = 'divers'
TYPES_FOURNISSEUR = [
    (TYPE_SOINS, 'Fournisseurs de Soins'),
    (TYPE_DIVERS, 'Fournisseurs Divers'),
]

# États du cycle de vie, dans l'ordre (cf. filtre « État » de la liste).
ETAT_RECUE = 'Reçue'
ETAT_EN_COURS = 'En cours de traitement'
ETAT_TRAITEE = 'Traitée'
ETAT_COMPTABILISEE = 'Comptabilisée'
ETAT_PAYEE = 'Payée'
ETATS = [ETAT_RECUE, ETAT_EN_COURS, ETAT_TRAITEE, ETAT_COMPTABILISEE, ETAT_PAYEE]

# Délai de règlement par défaut, en jours : l'échéance observée (~60 j) dépasse
# les 30 j d'usage sur les factures de soins (cf. §15).
DELAI_DEFAUT = 60

# Modes de règlement (cf. §17, capture 53) : chèque, virement, espèce, transfert.
TYPE_ESPECE = 'E'
TYPE_CHEQUE = 'C'
TYPE_VIREMENT = 'V'
TYPE_TRANSFERT = 'T'
TYPES_REGLEMENT = [
    (TYPE_ESPECE, 'Espèce'),
    (TYPE_CHEQUE, 'Chèque'),
    (TYPE_VIREMENT, 'Virement'),
    (TYPE_TRANSFERT, 'Transfert'),
]

# États « règlement » dérivés (filtres de la liste Règlements, §17).
ETAT_R_NON_ECHUE = 'Non Echue'
ETAT_R_ECHUE = 'Echue'
ETAT_R_REGLEE = 'Reglée'
ETAT_R_COMPTABILISEE = 'Comptabilisée'
ETAT_R_ANNULEE = 'Annulée'


class Facture(models.Model):
    # Fournisseurs de Soins ou Fournisseurs Divers : les deux sous-onglets.
    type_fournisseur = models.CharField(
        'Type de fournisseur', max_length=10, choices=TYPES_FOURNISSEUR, default=TYPE_SOINS,
    )

    # --- Entête facture ------------------------------------------------------
    # Le numéro que porte la facture du prestataire (« F098316/26 »). Le « N° »
    # interne de la liste, lui, est l'identifiant (cf. serializer).
    numero_fournisseur = models.CharField('N° facture fournisseur', max_length=40, blank=True)
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='factures',
        null=True, blank=True, verbose_name='Société',
    )
    # Fournisseur de soins (spécialité) ou fournisseur divers, selon le type.
    specialite = models.ForeignKey(
        Specialite, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Spécialité',
    )
    fournisseur_soins = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Fournisseur de soins',
    )
    fournisseur_divers = models.ForeignKey(
        FournisseurDivers, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Fournisseur divers',
    )

    date_facture = models.DateField('Date facture', null=True, blank=True)
    recu_le = models.DateField('Reçu le', null=True, blank=True)
    # Jour de saisie : posé à la réception (cf. FactureViewSet.perform_create).
    saisie_le = models.DateField('Saisie le', null=True, blank=True)
    # Délai de règlement (jours) ; l'échéance s'en déduit.
    delai = models.PositiveIntegerField('Délai (jours)', default=DELAI_DEFAUT)

    # --- Montants (réception) ------------------------------------------------
    frais_reel = models.PositiveIntegerField('Frais réel', default=0)
    remise = models.PositiveIntegerField('Remise', default=0)
    ristourne = models.PositiveIntegerField('Ristourne', default=0)
    qp_agent = models.PositiveIntegerField('QP. Agent', default=0)
    # Cases de la réception.
    remboursement_ticket = models.BooleanField('Remboursement ticket', default=False)
    avoir = models.BooleanField('Facture d’avoir', default=False)

    # --- Traitement / comptabilisation / paiement (tranches suivantes) -------
    etat = models.CharField('État', max_length=30, default=ETAT_RECUE)
    mois_traitement = models.CharField('Mois de traitement', max_length=20, blank=True)
    traitee_le = models.DateField('Traitée le', null=True, blank=True)
    date_compta = models.DateField('Date comptabilisation', null=True, blank=True)
    payee_le = models.DateField('Payée le', null=True, blank=True)

    # --- Règlement (paiement du fournisseur, §17) ---
    a_payer = models.BooleanField('Marquée à payer', default=False)
    type_reglement = models.CharField(
        'Type de règlement', max_length=1, choices=TYPES_REGLEMENT, blank=True
    )
    numero_reglement = models.CharField('N° de règlement', max_length=30, blank=True)
    date_reglement = models.DateField('Date de règlement', null=True, blank=True)
    montant_reglement = models.PositiveIntegerField('Montant réglé', default=0)
    acompte = models.BooleanField('Acompte (paiement partiel)', default=False)

    saisie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='+',
        null=True, blank=True, verbose_name='Saisie par',
    )
    traitee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='+',
        null=True, blank=True, verbose_name='Traitée par',
    )
    comptabilisee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='+',
        null=True, blank=True, verbose_name='Comptabilisée par',
    )

    # Une facture ne se supprime pas : elle s'annule, et peut être rétablie.
    actif = models.BooleanField('Valide', default=True)
    cree_le = models.DateTimeField('Créée le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifiée le', auto_now=True)

    class Meta:
        # La plus récente en haut.
        ordering = ['-id']
        verbose_name = 'Facture'
        verbose_name_plural = 'Factures'

    def __str__(self):
        return f'Facture {self.pk}'

    # --- Valeurs calculées ---------------------------------------------------
    @property
    def montant_net(self):
        """Montant net : F.réel − Remise − Ristourne − QP.Agent (jamais négatif)."""
        return max(0, self.frais_reel - self.remise - self.ristourne - self.qp_agent)

    @property
    def echeance(self):
        """Échéance : reçu le + délai de règlement."""
        return self.recu_le + timedelta(days=self.delai) if self.recu_le else None

    @property
    def exercice(self):
        """Exercice comptable : l'année de réception, à défaut de la facture."""
        jour = self.recu_le or self.date_facture
        return str(jour.year) if jour else str(date.today().year)

    @property
    def fournisseur_code(self):
        """Code du fournisseur (soins ou divers), pour retrouver ses bons."""
        if self.fournisseur_soins_id:
            return self.fournisseur_soins.code
        if self.fournisseur_divers_id:
            return self.fournisseur_divers.code
        return ''

    @property
    def jours_retard(self):
        """Jours de retard : aujourd'hui − échéance, si due et non encore réglée."""
        if self.etat == ETAT_PAYEE or not self.echeance:
            return 0
        n = (date.today() - self.echeance).days
        return n if n > 0 else 0

    @property
    def reste_a_payer(self):
        """Ce qu'il reste à régler : montant net − déjà réglé (jamais négatif)."""
        return max(0, self.montant_net - self.montant_reglement)

    @property
    def etat_reglement(self):
        """État côté Règlements (dérivé de l'état, du paiement et de l'échéance)."""
        if not self.actif:
            return ETAT_R_ANNULEE
        if self.etat == ETAT_PAYEE:
            return ETAT_R_REGLEE
        if self.echeance and self.echeance < date.today():
            return ETAT_R_ECHUE
        return ETAT_R_NON_ECHUE


# Les quatre documents dont un bon peut être rattaché à une facture.
TYPE_BON_PHARMACIE = 'bon-pharmacie'
TYPE_LETTRE_GARANTIE = 'lettre-garantie'
TYPE_LG_HOSPITALISATION = 'lg-hospitalisation'
TYPE_BON_OPTIQUE = 'bon-optique'
# Bon créé directement au traitement, sans document préexistant à rattacher
# (« Créer bon manuel », capture 38 ; surtout pour les factures « divers »).
TYPE_BON_MANUEL = 'manuel'
TYPES_DOCUMENT = [
    (TYPE_BON_PHARMACIE, 'Bon de pharmacie'),
    (TYPE_LETTRE_GARANTIE, 'Lettre de garantie'),
    (TYPE_LG_HOSPITALISATION, 'LG hospitalisation'),
    (TYPE_BON_OPTIQUE, 'Bon optique'),
    (TYPE_BON_MANUEL, 'Bon manuel'),
]


class LiquidationBon(models.Model):
    """
    Un bon/lettre rattaché à une facture et liquidé : c'est une ligne des
    « Bons traités » (capture 38). Le détail acte par acte (lignesprest) est
    porté par ``actes`` (rempli à la liquidation, tranche 3). Les montants
    agrégés (F.réels, QP.IPM, QP.PART…) sont proposés par le moteur
    (cf. liquidation.py) et ajustables.
    """

    facture = models.ForeignKey(
        Facture, on_delete=models.CASCADE, related_name='bons', verbose_name='Facture',
    )
    # Le bon rattaché, désigné par son type et son identifiant (les bons vivent
    # dans l'app documents, en quatre modèles distincts).
    type_document = models.CharField('Type de document', max_length=20, choices=TYPES_DOCUMENT)
    document_id = models.PositiveIntegerField('Identifiant du bon')

    # Instantané du bon, pour l'afficher sans recharger sa fiche.
    numero = models.CharField('N° bon/lettre', max_length=20, blank=True)
    date_bon = models.DateField('Date du bon', null=True, blank=True)
    code_soc = models.CharField('Code société', max_length=4, blank=True)
    matricule_part = models.CharField('Matricule participant', max_length=20, blank=True)
    participant = models.CharField('Participant', max_length=160, blank=True)
    type_benef = models.CharField('Type bénéficiaire', max_length=4, blank=True)
    beneficiaire = models.CharField('Bénéficiaire', max_length=160, blank=True)

    # Liquidation agrégée (proposée par le moteur, ajustable).
    freel = models.PositiveIntegerField('F. réels', default=0)
    qpipm = models.PositiveIntegerField('QP. IPM', default=0)
    qppart = models.PositiveIntegerField('QP. PART', default=0)
    qpassur = models.PositiveIntegerField('QP. Assur', default=0)
    fexclus = models.PositiveIntegerField('Frais exclus', default=0)
    ajustement = models.IntegerField('Ajustement', default=0)
    remise = models.PositiveIntegerField('Remise', default=0)
    # Détail acte par acte (lignesprest) ; rempli à la liquidation (tranche 3).
    actes = models.JSONField('Actes liquidés', default=list, blank=True)

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        ordering = ['id']
        verbose_name = 'Bon liquidé'
        verbose_name_plural = 'Bons liquidés'
        # Un bon ne se rattache qu'à une facture à la fois.
        constraints = [
            models.UniqueConstraint(
                fields=['type_document', 'document_id'], name='bon_liquide_unique',
            )
        ]

    def __str__(self):
        return f'{self.numero} → facture {self.facture_id}'


# Journal d'imputation des factures de soins, comme l'application d'origine.
JOURNAL_IMPUTATION = 'IF'
# Compte des participants : « 4110 » + code société (411001 = société 01…).
PREFIXE_COMPTE_PARTICIPANT = '4110'


class EcritureCompta(models.Model):
    """
    Une ligne d'écriture comptable engendrée par la comptabilisation d'une
    facture (capture 36, bouton « Comptabiliser » ; table `compta` de LAMPS,
    journal IF). Double partie : le fournisseur est crédité du total, chaque bon
    débite le compte de prestation (part IPM) et le compte participant (ticket).
    """

    facture = models.ForeignKey(
        Facture, on_delete=models.CASCADE, related_name='ecritures', verbose_name='Facture',
    )
    rang = models.PositiveIntegerField('Rang', default=0)
    codej = models.CharField('Journal', max_length=5, default=JOURNAL_IMPUTATION)
    date_piece = models.DateField('Date pièce', null=True, blank=True)
    date_compta = models.DateField('Date comptabilisation', null=True, blank=True)
    numpiece = models.CharField('N° pièce', max_length=20, blank=True)
    comptegen = models.CharField('Compte général', max_length=12, blank=True)
    comptetiers = models.CharField('Compte tiers', max_length=20, blank=True)
    libelle = models.CharField('Libellé', max_length=120, blank=True)
    debit = models.PositiveIntegerField('Débit', default=0)
    credit = models.PositiveIntegerField('Crédit', default=0)
    numdoc = models.CharField('N° bon', max_length=20, blank=True)
    numfactfrs = models.CharField('N° facture fournisseur', max_length=40, blank=True)
    numfactipm = models.CharField('N° facture IPM', max_length=20, blank=True)
    codesoc = models.CharField('Code société', max_length=4, blank=True)
    matri = models.CharField('Matricule', max_length=20, blank=True)
    numfourn = models.CharField('N° fournisseur', max_length=20, blank=True)

    cree_le = models.DateTimeField('Créée le', auto_now_add=True)

    class Meta:
        ordering = ['facture_id', 'rang', 'id']
        verbose_name = 'Écriture comptable'
        verbose_name_plural = 'Écritures comptables'

    def __str__(self):
        return f'{self.codej} {self.comptegen} D{self.debit}/C{self.credit}'
