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
from donnees_de_base.models import (
    ArticleAchat,
    FournisseurDeSoins,
    FournisseurDivers,
    Specialite,
)

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

    # Indexée : la liste filtre par exercice (sur l'année de la date facture).
    date_facture = models.DateField('Date facture', null=True, blank=True, db_index=True)
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
    # Mode du remboursement quand « Remboursement ticket » est coché (capture 65) :
    # par la banque (majoritaire) ou par compensation. Vide sinon.
    type_remb = models.CharField(
        'Mode de remboursement',
        max_length=10,
        blank=True,
        choices=[('compense', 'Compense'), ('banque', 'Banque')],
    )
    avoir = models.BooleanField('Facture d’avoir', default=False)

    # --- Traitement / comptabilisation / paiement (tranches suivantes) -------
    etat = models.CharField('État', max_length=30, default=ETAT_RECUE)
    mois_traitement = models.CharField('Mois de traitement', max_length=20, blank=True)
    # Le même mois, en date (le 1er du mois) : c'est `factures.datetrait` de
    # l'application d'origine, et **l'axe du Journal Central**. Toutes les
    # écritures de la facture le recopient, celles du règlement comprises -
    # vérifié sur la facture 106640, reçue le 1er juillet, comptabilisée le 3,
    # réglée le 13, et dont les cinq écritures portent toutes juin.
    # `mois_traitement` n'en est que l'étiquette affichée (« oct.-2026 »).
    date_trait = models.DateField('Mois comptable', null=True, blank=True)
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
    # Régler et comptabiliser le règlement sont DEUX gestes dans l'application
    # d'origine (capture 59 : bouton « Comptabiliser », segment
    # « Comptabilisée » à côté de « Réglée »), parfois séparés de semaines - la
    # facture 106685 est réglée le 13 juillet et son écriture datée du
    # 21 septembre. La banque (`codebque`) se choisit au second geste : c'est
    # elle qui donne le journal (B8) et le compte de trésorerie (521800).
    banque_reglement = models.CharField('Banque du règlement (Bx)', max_length=5, blank=True)
    reglement_comptabilise = models.BooleanField('Règlement comptabilisé', default=False)
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
        if self.reglement_comptabilise:
            return ETAT_R_COMPTABILISEE
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

# Types de document sélectionnables à la CRÉATION d'un bon manuel (capture 69) :
# les 4 types de bon + bon d'avoir + ticket remboursement. (Le bon créé reste un
# « manuel » en interne - type_document = TYPE_BON_MANUEL, séquence BMI propre -,
# et porte ce choix dans `type_manuel`.)
TYPE_BON_AVOIR = 'bon-avoir'
TYPE_TICKET_REMBOURSEMENT = 'ticket-remboursement'
TYPES_BON_MANUEL = [
    (TYPE_BON_PHARMACIE, 'Bon de pharmacie'),
    (TYPE_BON_OPTIQUE, 'Bon optique'),
    (TYPE_LETTRE_GARANTIE, 'Lettre de garantie'),
    (TYPE_LG_HOSPITALISATION, 'LG hospitalisation'),
    (TYPE_BON_AVOIR, "Bon d'avoir"),
    (TYPE_TICKET_REMBOURSEMENT, 'Ticket remboursement'),
]
CODES_BON_MANUEL = {code for code, _ in TYPES_BON_MANUEL}


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

    # Bon manuel (capture 69) : le type choisi parmi les 6 (TYPES_BON_MANUEL), et
    # le drapeau « remboursement intégral » (l'IPM prend 100 % au lieu du taux).
    # Vides / False pour un bon rattaché normal.
    type_manuel = models.CharField(
        'Type (bon manuel)', max_length=25, blank=True, choices=TYPES_BON_MANUEL
    )
    remboursement_integral = models.BooleanField('Remboursement intégral', default=False)

    # Règlement du remboursement à l'assuré (page « Remboursement Frais Médicaux ») :
    # quand et comment le participant a été remboursé. `rembourse` reste False tant
    # que non réglé. Ne concerne que les bons des factures « Remboursement ticket ».
    rembourse = models.BooleanField('Remboursé', default=False)
    rembourse_le = models.DateField('Remboursé le', null=True, blank=True)
    reglement_methode = models.CharField('Méthode (C/V/T)', max_length=1, blank=True)
    reglement_numero = models.CharField('N° règlement', max_length=30, blank=True)
    reglement_banque = models.CharField('Banque (Bx)', max_length=5, blank=True)

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
# Journaux du remboursement à l'assuré (cf. comptabilite-factures.md Phase 3,
# décodé sur la table `compta`) : RIB = payé par la banque, RIC = par compensation.
JOURNAL_REMB_BANQUE = 'RIB'
JOURNAL_REMB_COMPENSE = 'RIC'


class EcritureCompta(models.Model):
    """
    Une ligne du **grand livre** - la table `compta` de LAMPS.

    Ce modèle a d'abord été écrit comme un sous-produit de la facture : la
    comptabilisation (capture 36, bouton « Comptabiliser ») posait ses lignes
    au journal IF, et rien d'autre n'écrivait ici. La reprise de LAMPS a montré
    que c'était trop étroit : **47,3 % des 396 873 écritures réelles ne
    viennent d'aucune facture** - report à nouveau (24,5 %), appels de
    cotisation (14,7 %), opérations diverses, encaissements. D'où les trois
    changements du 2026-10-28 :

    - **`facture` devient facultative.** Une écriture existe par elle-même ;
      le lien vers la facture n'est qu'une origine parmi d'autres.
    - **`debit` et `credit` acceptent le négatif.** LAMPS n'inverse pas une
      écriture pour l'annuler : il **repose la même, en montant négatif du
      même côté** (1 024 écritures, cf. `docs/lamps/comptabilite-lamps.md`
      §9.1). Un `PositiveIntegerField` les rejetait toutes.
    - **`date_trait` apparaît** : c'est le **mois comptable**, l'axe sur lequel
      LAMPS calcule l'exercice et le mois. Vérifié au franc près : le total
      216 041 517 de la capture 70 ne se reproduit que sur cette date, ni sur
      `date_piece` ni sur `date_compta`.
    """

    # Facultative : seuls les journaux IF et Bx naissent d'une facture.
    facture = models.ForeignKey(
        Facture, on_delete=models.CASCADE, related_name='ecritures',
        null=True, blank=True, verbose_name='Facture',
    )
    rang = models.PositiveIntegerField('Rang', default=0)
    codej = models.CharField('Journal', max_length=5, default=JOURNAL_IMPUTATION)
    date_piece = models.DateField('Date pièce', null=True, blank=True)
    date_compta = models.DateField('Date comptabilisation', null=True, blank=True)
    # Le mois comptable (colonne « Mois trait. »), toujours au 1er du mois dans
    # 97 % des écritures de LAMPS : c'est un marqueur de période, pas une date.
    date_trait = models.DateField('Mois de traitement', null=True, blank=True)
    numpiece = models.CharField('N° pièce', max_length=25, blank=True)
    numcheque = models.CharField('N° chèque', max_length=20, blank=True)
    comptegen = models.CharField('Compte général', max_length=12, blank=True)
    comptetiers = models.CharField('Compte tiers', max_length=25, blank=True)
    libelle = models.CharField('Libellé', max_length=120, blank=True)
    # Signés : un montant négatif annule une écriture précédente (cf. ci-dessus).
    # Et en GRAND entier : 23 écritures de LAMPS dépassent les 2,1 milliards
    # que porte un entier ordinaire - jusqu'à 3 512 117 265 F sur un report à
    # nouveau du compte de liaison 460100.
    debit = models.BigIntegerField('Débit', default=0)
    credit = models.BigIntegerField('Crédit', default=0)
    # --- La liquidation, portée par l'écriture elle-même ------------------
    # L'onglet « Charges Techniques » de l'Interrogation Compte (capture 77)
    # affiche ces deux colonnes à côté du débit, et c'est la seule famille de
    # comptes où elles apparaissent. Elles voyagent pourtant avec toutes les
    # lignes d'une même pièce : on peut donc réauditer une charge sans jamais
    # rouvrir `lignesprest`. Vérifié sur la pièce 105120 de janvier 2026 -
    # F. réel 30 867 × 85 % = 26 236,95 → débit 26 237, au franc près.
    frais_reel = models.BigIntegerField('Frais réel', default=0)
    frais_exclus = models.BigIntegerField('Frais exclus', default=0)

    numdoc = models.CharField('N° bon', max_length=25, blank=True)
    numfactfrs = models.CharField('N° facture fournisseur', max_length=50, blank=True)
    numfactipm = models.CharField('N° facture IPM', max_length=20, blank=True)
    codesoc = models.CharField('Code société', max_length=4, blank=True)
    matri = models.CharField('Matricule', max_length=20, blank=True)
    numfourn = models.CharField('N° fournisseur', max_length=20, blank=True)
    # Le lot de comptabilisation : toutes les lignes d'un même traitement.
    numtrans = models.CharField('N° transaction', max_length=20, blank=True)
    # Pointage des comptes de tiers. LAMPS ne garde que le drapeau : sa colonne
    # `lettre` (la lettre A, B, C… du lettrage) est vide partout.
    lettrage = models.BooleanField('Lettrée', default=False)

    cree_le = models.DateTimeField('Créée le', auto_now_add=True)

    class Meta:
        # L'ordre d'insertion, comme LAMPS : il garde groupées les lignes d'un
        # même traitement, ce qu'un comptable veut lire. Trier par date ou par
        # compte disperserait les lots.
        ordering = ['id']
        verbose_name = 'Écriture comptable'
        verbose_name_plural = 'Écritures comptables'
        indexes = [
            # Les trois filtres du Journal Central. Sans cet index, chaque
            # affichage balaierait les 400 000 lignes.
            models.Index(
                fields=['date_trait', 'codej', 'codesoc'],
                name='ecriture_journal_central',
            ),
            # L'Interrogation Compte interroge par compte, puis par tiers.
            # Sans cet index, chaque onglet balaierait les 400 000 lignes pour
            # n'en retenir que celles d'un seul prestataire.
            models.Index(
                fields=['comptegen', 'comptetiers'],
                name='ecriture_interrogation',
            ),
        ]

    def __str__(self):
        return f'{self.codej} {self.comptegen} D{self.debit}/C{self.credit}'


# ===========================================================================
# Ordre de Paiement (§18, captures 61-62)
#
# Émettre un chèque / ordre de virement « à l'ordre de » quelqu'un, avec un
# motif, sans facture derrière. Alimente le chéquier (équivalent `table_cheques`)
# et se retrouve sur l'écran « Edition Lettres Chèques/Ordre de Virement ».
# ===========================================================================


class Banque(models.Model):
    """
    Une banque émettrice = un journal de banque (B1..B10) et un compte 521xxx.
    Référentiel (cf. capture 62). Les écritures de paiement passent par son
    journal et créditent son compte.
    """

    code = models.CharField('Code', max_length=5, unique=True)  # B1..B10
    libelle = models.CharField('Banque', max_length=100)
    reseau = models.CharField('Réseau', max_length=50, blank=True)  # CREDIT DU SENEGAL / ECOBANK
    compte = models.CharField('Compte (521xxx)', max_length=12, blank=True)
    actif = models.BooleanField('Active', default=True)
    cree_le = models.DateTimeField('Créée le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifiée le', auto_now=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Banque'
        verbose_name_plural = 'Banques'

    def __str__(self):
        return f'{self.code} - {self.libelle}'

    @classmethod
    def prochain_code(cls):
        """Prochain code « B{n} » (numérotation du référentiel)."""
        nums = [
            int(c[1:])
            for c in cls.objects.values_list('code', flat=True)
            if c and c[0] in ('B', 'b') and c[1:].isdigit()
        ]
        return f'B{(max(nums) + 1) if nums else 1}'


# Modes de paiement d'un ordre (le titre de l'écran : chèque / virement).
MODE_CHEQUE = 'C'
MODE_VIREMENT = 'V'
MODES_PAIEMENT = [
    (MODE_CHEQUE, 'Chèque'),
    (MODE_VIREMENT, 'Virement'),
]


class OrdrePaiement(models.Model):
    """
    Un ordre de paiement libre (chèque / virement). Le N° d'enregistrement et le
    N° de pièce (chèque) sont posés par le serveur ; le reste est saisi au modal
    « Etablir » (mode, date, montant, motif, à l'ordre de, banque).
    """

    numero_enreg = models.PositiveIntegerField('N° Enreg.', unique=True)
    date_saisie = models.DateField('Date saisie', auto_now_add=True)
    mode_paiement = models.CharField(
        'Mode de paiement', max_length=1, choices=MODES_PAIEMENT, default=MODE_CHEQUE,
    )
    date_piece = models.DateField('Date pièce (chèque)', null=True, blank=True)
    numero_piece = models.CharField('N° pièce (chèque)', max_length=20, blank=True)
    montant = models.PositiveIntegerField('Montant', default=0)
    a_ordre_de = models.CharField("À l'ordre de", max_length=150, blank=True)
    motif = models.CharField('Motif', max_length=200, blank=True)
    banque = models.ForeignKey(
        Banque, on_delete=models.PROTECT, related_name='ordres', verbose_name='Banque',
        null=True, blank=True,
    )
    # Drapeau « à imprimer » (lettre chèque / ordre de virement), cf. to_print.
    a_imprimer = models.BooleanField('À imprimer', default=True)
    actif = models.BooleanField('Valide', default=True)

    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Saisi par',
    )
    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        ordering = ['-numero_enreg']
        verbose_name = 'Ordre de paiement'
        verbose_name_plural = 'Ordres de paiement'

    def __str__(self):
        return f'Ordre {self.numero_enreg} - {self.a_ordre_de} ({self.montant})'

    @property
    def exercice(self):
        """Exercice = année de la pièce (à défaut, de la saisie)."""
        jour = self.date_piece or self.date_saisie
        return str(jour.year) if jour else str(date.today().year)

    @classmethod
    def prochain_enreg(cls):
        """Prochain N° d'enregistrement (séquence globale)."""
        dernier = cls.objects.aggregate(m=models.Max('numero_enreg'))['m'] or 0
        return dernier + 1

    @classmethod
    def prochain_numero_piece(cls, banque):
        """Prochain N° de chèque d'une banque, sur 7 chiffres (chéquier)."""
        if banque is None:
            return ''
        nums = [
            int(n)
            for n in cls.objects.filter(banque=banque)
            .values_list('numero_piece', flat=True)
            if n and n.isdigit()
        ]
        return f'{(max(nums) + 1) if nums else 1:07d}'


# ===========================================================================
# Bons d'Achats (« Bon de Commande Achats », captures 79-80)
#
# Les achats de l'IPM pour son propre fonctionnement : papier, cartouches,
# imprimés. Rien à voir avec les bons de pharmacie ou optique, qui engagent
# l'IPM envers un prestataire de santé pour un bénéficiaire.
#
# Le bon ne déclenche rien : il s'enregistre, souvent après la livraison, et
# quelqu'un le passe « Traité ». La facture divers qui suit n'est pas produite
# d'ici. L'application d'origine ne reliait les deux que de tête ; on garde au
# moins une référence libre (`reference_facture`), sans quoi « Traité » reste
# une affirmation que rien ne vérifie.
# ===========================================================================

# Les deux seuls statuts de l'origine, posés à la main dès la création.
STATUT_BA_EN_COURS = 'En Cours'
STATUT_BA_TRAITE = 'Traité'
STATUTS_BON_ACHAT = [
    (STATUT_BA_EN_COURS, STATUT_BA_EN_COURS),
    (STATUT_BA_TRAITE, STATUT_BA_TRAITE),
]

# Taux de TVA des lignes de bon : 18 % sur toutes les lignes de l'origine.
TAUX_TVA_DEFAUT = 18


def _pourcentage(montant, taux):
    """
    `montant` × `taux` %, arrondi au franc le plus proche.

    Même convention que la liquidation (cf. liquidation.py) : le franc CFA n'a
    pas de subdivision, et l'arrondi au plus proche est celui de l'origine. En
    entiers, pour que le total imprimé soit exactement celui-là.
    """
    return (int(montant) * int(taux) + 50) // 100


class BonAchat(models.Model):
    """Un bon de commande d'achat passé à un fournisseur divers."""

    # « BA000013 » : numérotation propre, posée par le serveur.
    code = models.CharField('N° Bon', max_length=10, unique=True)

    fournisseur = models.ForeignKey(
        FournisseurDivers, on_delete=models.PROTECT, related_name='bons_achats',
        verbose_name='Fournisseur',
    )
    # Date d'enregistrement : le jour de la saisie, qui peut suivre la
    # livraison (l'origine l'accepte, et c'est l'usage constaté).
    # Indexée : la liste filtre par exercice (sur l'année) avant de paginer.
    date_bon = models.DateField("Date d'enregistrement", default=date.today, db_index=True)
    date_livraison = models.DateField('Date de livraison souhaitée', null=True, blank=True)
    num_offre = models.CharField('N° Offre', max_length=20, blank=True)
    statut = models.CharField(
        'Statut', max_length=10, choices=STATUTS_BON_ACHAT, default=STATUT_BA_EN_COURS,
    )

    # Contact chez le fournisseur. L'origine l'exigeait, l'affichait grisé et
    # ne le stockait nulle part : son bon imprimé sortait donc toujours avec un
    # « Contact : » vide. Ici le champ a sa colonne, il est prérempli de la
    # fiche du fournisseur et reste modifiable - une commande passe par une
    # personne, pas par une raison sociale.
    contact = models.CharField('Contact', max_length=120, blank=True)
    contact_email = models.EmailField('Email', blank=True)

    # Condition de paiement annoncée au fournisseur, reprise de sa fiche.
    condition_paiement = models.CharField('Condition de paiement', max_length=60, blank=True)

    adresse_livraison = models.CharField('Adresse de livraison', max_length=255, blank=True)
    remarque = models.TextField('Remarque', blank=True)
    # Référence libre de la facture reçue ensuite : le seul lien entre le bon
    # et la dépense qu'il a engagée.
    reference_facture = models.CharField('Facture', max_length=40, blank=True)

    # Un bon ne se supprime pas, il s'annule : l'origine en avait effacé six
    # sur treize, d'où les trous de sa numérotation.
    actif = models.BooleanField('Valide', default=True)

    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Saisi par',
    )
    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        ordering = ['-date_bon', '-code']
        verbose_name = "Bon d'achat"
        verbose_name_plural = "Bons d'achats"

    def __str__(self):
        return f'{self.code} - {self.fournisseur.libelle if self.fournisseur_id else ""}'

    @classmethod
    def prochain_code(cls):
        """Prochain numéro « BA000013 » (séquence propre aux bons d'achats)."""
        nums = [
            int(c[2:])
            for c in cls.objects.values_list('code', flat=True)
            if c and c[:2].upper() == 'BA' and c[2:].isdigit()
        ]
        return f'BA{(max(nums) + 1) if nums else 1:06d}'

    @property
    def exercice(self):
        """Exercice = année d'enregistrement du bon."""
        return str(self.date_bon.year) if self.date_bon else str(date.today().year)

    # --- Totaux : la somme des lignes, jamais stockée ------------------------
    def _somme(self, attribut):
        return sum(getattr(ligne, attribut) for ligne in self.lignes.all())

    @property
    def total_ht(self):
        return self._somme('montant_ht')

    @property
    def total_remise(self):
        return self._somme('montant_remise')

    @property
    def total_tva(self):
        return self._somme('montant_tva')

    @property
    def total_ttc(self):
        return self._somme('montant_ttc')


class LigneBonAchat(models.Model):
    """
    Une ligne commandée : un article du catalogue, une quantité, un prix.

    Le prix est **repris du catalogue et modifiable** : l'origine ne le
    verrouille pas, et une commande peut légitimement se négocier. Le prix de
    référence reste affiché à côté du champ pour que l'écart se remarque.

    Les montants ne sont pas stockés : ils se déduisent des quatre valeurs
    saisies, et une colonne de plus serait une occasion de divergence.
    """

    bon = models.ForeignKey(
        BonAchat, on_delete=models.CASCADE, related_name='lignes', verbose_name="Bon d'achat",
    )
    article = models.ForeignKey(
        ArticleAchat, on_delete=models.PROTECT, related_name='+', verbose_name='Article',
    )
    quantite = models.PositiveIntegerField('Quantité', default=1)
    prix_unitaire = models.PositiveIntegerField('Prix unitaire', default=0)
    taux_tva = models.PositiveSmallIntegerField('TVA (%)', default=TAUX_TVA_DEFAUT)
    taux_remise = models.PositiveSmallIntegerField('Remise (%)', default=0)
    # Ordre de saisie : les lignes s'impriment comme elles ont été validées.
    rang = models.PositiveSmallIntegerField('Rang', default=0)

    class Meta:
        ordering = ['rang', 'id']
        verbose_name = "Ligne de bon d'achat"
        verbose_name_plural = "Lignes de bon d'achat"

    def __str__(self):
        return f'{self.article.code if self.article_id else ""} x {self.quantite}'

    @property
    def montant_ht(self):
        return int(self.quantite or 0) * int(self.prix_unitaire or 0)

    @property
    def montant_remise(self):
        return _pourcentage(self.montant_ht, self.taux_remise or 0)

    @property
    def base_imposable(self):
        """Ce sur quoi la TVA s'applique : le HT moins la remise."""
        return self.montant_ht - self.montant_remise

    @property
    def montant_tva(self):
        return _pourcentage(self.base_imposable, self.taux_tva or 0)

    @property
    def montant_ttc(self):
        """
        Le TTC : c'est lui que la colonne « Total » du bon imprimé porte.

        Inhabituel - on attendrait le HT - mais c'est ce que fait l'origine, et
        la charge prend bien le TTC : l'IPM ne récupère pas la TVA, aucune
        écriture ne touche un compte 445 (cf. docs/lamps/bons-achats.md §5).
        """
        return self.base_imposable + self.montant_tva


# ===========================================================================
# Cotisations - la recette de l'IPM (captures 81 à 83)
#
# Tout le reste de ce module dépense ; cet écran est le seul qui crée du
# produit. Il appelle chaque mois, auprès des sociétés adhérentes et de leurs
# salariés, les cotisations qui financent les remboursements - la contrepartie
# exacte des charges techniques du 602.
#
# Le décodage complet est dans docs/lamps/cotisations.md. Quatre décisions en
# sortent, et elles expliquent la forme de ces deux modèles :
#
# 1. **Le type de cotisation est un JOURNAL**, pas un référentiel de plus :
#    `JournalComptable` où `type = 'COTISATION'`, et son `compte` porte le 701
#    à créditer. Rien à paramétrer en plus.
# 2. **La comptabilisation agrège.** Les 219 lignes nominatives d'un appel
#    réel donnent **deux** écritures, pas 219. Le détail nominatif vit ici et
#    ne descend jamais au grand livre : l'adhérent est un compte collectif.
# 3. **La clé d'un appel est société x mois x type.** C'est la clé primaire de
#    `table_cotisations` dans l'original, reprise telle quelle en numéro de
#    pièce. Elle est posée ici en contrainte, pas seulement à l'écran.
# 4. **Le montant n'a pas de valeur par défaut.** L'original en proposait une,
#    5 000, codée en dur par son auteur et sans aucune règle derrière : les
#    18 appels morts de LAMPS sont **tous** à 5 000 F par tête, validés sans
#    qu'on y touche. Consigne du métier du 2026-11-03 : champ vide.
# ===========================================================================

# Le `type` que porte un journal de cotisation dans le référentiel.
TYPE_JOURNAL_COTISATION = 'COTISATION'

# États d'un appel, repris de l'original (`table_cotisations.statut`).
# L'original doublait ce statut d'une colonne `compta` Oui/Non qui disait
# exactement la même chose - 564 OK/Oui et 18 KO/Non, sans une exception.
# Une seule suffit donc, et c'est celle que l'écran montre.
STATUT_APPEL_OUVERT = 'Ouvert'
STATUT_APPEL_COMPTABILISE = 'Comptabilisé'
STATUTS_APPEL = [
    (STATUT_APPEL_OUVERT, STATUT_APPEL_OUVERT),
    (STATUT_APPEL_COMPTABILISE, STATUT_APPEL_COMPTABILISE),
]

# Les douze mois abrégés, pour le libellé de la pièce et le champ grisé du
# modal. L'original écrit « oct.-2020 » : mois abrégé, point, tiret, année.
MOIS_ABREGES = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]


def mois_abrege(annee, mois):
    """« nov.-2026 » - la forme exacte du champ « Date Traitement » grisé."""
    return f'{MOIS_ABREGES[int(mois) - 1]}-{annee}'


class AppelCotisation(models.Model):
    """
    Un appel de cotisation : une société, un mois, un type.

    C'est l'en-tête. Les montants dus, tête par tête, sont ses lignes.
    """

    # « 01-2024-8-C910 » : société, année, mois, journal. C'est le numéro de
    # pièce de l'écriture, et il se recompose entièrement depuis les quatre
    # champs qui suivent - on le stocke quand même, parce que c'est lui que
    # l'écran affiche en colonne « Code Cotis. » et qu'il doit pouvoir se
    # rechercher d'un seul tenant.
    code = models.CharField('Code Cotis.', max_length=25, unique=True)

    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='appels_cotisation',
        verbose_name='Societe',
    )
    # Le code du journal (« C910 »), et non une clé étrangère : le référentiel
    # des journaux est manié par son code partout ailleurs dans ce module, et
    # l'écriture elle-même ne porte qu'un `codej`.
    journal = models.CharField('Type de cotisation', max_length=4)

    annee = models.PositiveSmallIntegerField('Année')
    mois = models.PositiveSmallIntegerField('Mois')

    # Les trois dates de LAMPS, et elles ne se confondent pas : la pièce porte
    # la sienne, la comptabilisation la sienne, et `date_trait` dit le mois
    # auquel la cotisation se rapporte. L'appel d'août 2024 a été comptabilisé
    # le 8 janvier 2025 : cinq mois d'écart, et c'est le mois de traitement qui
    # fait foi pour les états.
    date_piece = models.DateField('Date', default=date.today)
    date_trait = models.DateField('Date Traitement')
    date_compta = models.DateField('Date saisie', null=True, blank=True)

    # Le montant appelé par tête quand l'appel est forfaitaire. Vide sur un
    # appel proportionnel, dont les montants viennent du fichier importé :
    # cinq journaux sur neuf sont au forfait, quatre au prorata du salaire.
    montant_unitaire = models.PositiveIntegerField(
        'Mtt. cotisation', null=True, blank=True,
    )

    statut = models.CharField(
        'Etat', max_length=15, choices=STATUTS_APPEL, default=STATUT_APPEL_OUVERT,
    )

    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    cree_le = models.DateTimeField('Créé le', auto_now_add=True)

    class Meta:
        # Le plus récent d'abord, comme toutes les listes de ce module.
        ordering = ['-annee', '-mois', 'adherent__code', 'journal']
        verbose_name = 'Appel de cotisation'
        verbose_name_plural = 'Appels de cotisation'
        constraints = [
            # La règle que l'original ne tenait qu'à l'écran. Un même mois ne
            # peut pas être appelé deux fois pour la même société et le même
            # type : ce serait la cotisation comptée double.
            models.UniqueConstraint(
                fields=['adherent', 'annee', 'mois', 'journal'],
                name='appel_cotisation_unique',
            ),
        ]
        indexes = [
            models.Index(fields=['annee', 'mois'], name='appel_cotisation_periode'),
        ]

    def __str__(self):
        return self.code

    # --- Identité ------------------------------------------------------------

    @staticmethod
    def composer_code(code_societe, annee, mois, journal):
        """« 01-2024-8-C910 ». Le mois n'est pas complété à deux chiffres."""
        return f'{code_societe}-{annee}-{int(mois)}-{journal}'

    def save(self, *args, **kwargs):
        if not self.date_trait:
            self.date_trait = date(int(self.annee), int(self.mois), 1)
        if not self.code and self.adherent_id:
            self.code = self.composer_code(
                self.adherent.code, self.annee, self.mois, self.journal,
            )
        super().save(*args, **kwargs)

    @property
    def periode(self):
        """« nov.-2026 », ce qu'affiche le champ grisé du modal."""
        return mois_abrege(self.annee, self.mois)

    # --- Totaux --------------------------------------------------------------

    @property
    def cotisants(self):
        return self.lignes.count()

    @property
    def total(self):
        return sum(int(ligne.montant or 0) for ligne in self.lignes.all())

    @property
    def comptabilise(self):
        return self.statut == STATUT_APPEL_COMPTABILISE


class LigneCotisation(models.Model):
    """
    Ce qu'un participant doit au titre d'un appel.

    Une ligne par cotisant. L'original stockait aussi `mont_cotis_soc` et
    `mont_cotis_pat` : **mortes**, à 0 sur les 96 607 lignes réelles. Un seul
    montant, donc.

    Le participant est une clé étrangère, et non un matricule recopié comme
    dans l'original : les colonnes Prénom, Nom, Adresse et Téléphone de l'écran
    sont jointes à l'affichage, elles n'ont pas à être dupliquées ici.
    """

    appel = models.ForeignKey(
        AppelCotisation, on_delete=models.CASCADE, related_name='lignes',
        verbose_name='Appel',
    )
    participant = models.ForeignKey(
        'participants.Participant', on_delete=models.PROTECT, related_name='+',
        verbose_name='Participant',
    )
    montant = models.PositiveIntegerField('Cotisation Dûe', default=0)

    class Meta:
        ordering = ['participant__matricule']
        verbose_name = 'Ligne de cotisation'
        verbose_name_plural = 'Lignes de cotisation'
        constraints = [
            models.UniqueConstraint(
                fields=['appel', 'participant'], name='ligne_cotisation_unique',
            ),
        ]

    def __str__(self):
        return f'{self.appel_id} / {self.participant_id} : {self.montant}'


# ===========================================================================
# Retenues Frais Médicaux (captures 86 à 91, docs/lamps/retenues-frais-medicaux.md)
#
# Le pendant exact des cotisations, et pourtant l'inverse. La cotisation
# **appelle** ce que la société doit ; la retenue **récupère** ce que le
# participant doit, en le faisant prélever sur sa paie. L'IPM a avancé la part
# du participant (le ticket modérateur, porté au débit de son 411) ; chaque
# mois, la paie en retient une tranche sur le salaire, et ce prélèvement vient
# créditer le même compte.
#
# Cinq décisions, toutes tirées de la production (20 136 lignes, 144 campagnes,
# octobre 2020 à septembre 2026) :
#
# 1. **L'IPM ne calcule pas la retenue.** Sa colonne « Retenue IPM » vaut
#    `min(solde, 35 000)` sur 20 136 lignes sur 20 136, sans une exception, et
#    elle **ne part jamais en comptabilité** : sur les 142 pièces du journal
#    RP, le montant comptabilisé est 142 fois celui de la paie. Le 35 000 est
#    une valeur en dur, comme le « 5 000 » des cotisations - pas une règle.
#    On la reprend quand même (consigne du 2026-11-05, identité avec LAMPS),
#    mais elle reste une proposition, et la paie l'ignore neuf fois sur dix.
# 2. **Le solde se photographie à l'appel**, et il se stocke. Le recalculer à
#    l'affichage donnerait un autre chiffre dès qu'une facture est passée
#    entre-temps, et ferait diverger l'historique de ce qui a été envoyé.
# 3. **La clé d'une campagne est le couple société-mois**, et son code s'écrit
#    `01-2026-6` - mois **non complété**. C'est la première colonne du fichier
#    de la paie, et c'est aussi le numéro de pièce de l'écriture.
# 4. **La comptabilisation n'agrège pas le participant.** Contrairement aux
#    cotisations, chaque prélèvement descend nommément : la pièce `01-2026-6`
#    porte 102 crédits 411001 (un par participant servi, tiers `01-0699`) et
#    **une** ligne de débit 463001 pour la société. Le participant est un
#    compte de tiers, pas un compte collectif.
# 5. **Un prélèvement supérieur au solde est signalé, jamais bloqué**
#    (décision du 2026-11-05). LAMPS n'en disait rien, et la production porte
#    310 cas pour 8 563 422 F. Le montant est déjà retenu sur le bulletin :
#    refuser l'import ne rendrait l'argent à personne et ferait diverger notre
#    comptabilité de celle de Sage.
# ===========================================================================

# Journal des retenues sur salaire. 142 pièces dans la production, toutes au
# format `société-année-mois`.
JOURNAL_RETENUE = 'RP'

# Le libellé que portent les deux côtés de l'écriture, à la forme exacte de la
# production : « REMBT FRAIS MDCX : juin-2026 ».
LIBELLE_RETENUE = 'REMBT FRAIS MDCX'

# Le plafond de la colonne « Retenue IPM ». Valeur en dur de LAMPS, conservée
# pour l'identité (cf. décision 1 ci-dessus) : elle ne commande rien.
PLAFOND_RETENUE_IPM = 35000


def dernier_jour(annee, mois):
    """
    Le dernier jour du mois - la `date_trait` des écritures de retenue.

    Les cotisations datent leur mois comptable du **1er** ; les retenues le
    datent du **dernier** jour (2026-06-30 sur la pièce `01-2026-6`). Les deux
    conventions cohabitent dans la production, et on ne les uniformise pas :
    c'est cette date qui range la pièce dans son mois sur tous les états.
    """
    debut_suivant = (
        date(int(annee) + 1, 1, 1) if int(mois) == 12 else date(int(annee), int(mois) + 1, 1)
    )
    return debut_suivant - timedelta(days=1)


class CampagneRetenue(models.Model):
    """
    La retenue d'un mois pour une société : l'en-tête de l'appel.

    Une par société et par mois - 144 dans la production, soit 72 mois × 2
    sociétés, sans un mois manquant. Les lignes, elles, sont nominatives.
    """

    # « 01-2026-6 » : société, année, mois. Le mois n'est **pas** complété à
    # deux chiffres. C'est à la fois le numéro de pièce de l'écriture et la
    # première colonne du fichier que la paie renvoie : c'est par lui que le
    # fichier dit de quelle campagne il est.
    code = models.CharField('Code Retenue', max_length=20, unique=True)

    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='campagnes_retenue',
        verbose_name='Societe',
    )
    annee = models.PositiveSmallIntegerField('Année')
    mois = models.PositiveSmallIntegerField('Mois')

    # Les trois dates, et elles ne se confondent pas : la pièce porte la
    # sienne (le jour où l'on comptabilise), `date_trait` le mois auquel la
    # retenue se rapporte - au dernier jour de ce mois.
    date_piece = models.DateField('Date pièce', default=date.today)
    date_trait = models.DateField('Mois de traitement')
    date_compta = models.DateField('Date saisie', null=True, blank=True)

    statut = models.CharField(
        'Etat', max_length=15, choices=STATUTS_APPEL, default=STATUT_APPEL_OUVERT,
    )

    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    cree_le = models.DateTimeField('Créée le', auto_now_add=True)

    class Meta:
        ordering = ['-annee', '-mois', 'adherent__code']
        verbose_name = 'Campagne de retenue'
        verbose_name_plural = 'Campagnes de retenue'
        constraints = [
            # Un même mois ne peut pas être appelé deux fois pour la même
            # société : ce serait la dette prélevée en double.
            models.UniqueConstraint(
                fields=['adherent', 'annee', 'mois'], name='campagne_retenue_unique',
            ),
        ]
        indexes = [
            models.Index(fields=['annee', 'mois'], name='campagne_retenue_periode'),
        ]

    def __str__(self):
        return self.code

    # --- Identité ------------------------------------------------------------

    @staticmethod
    def composer_code(code_societe, annee, mois):
        """« 01-2026-6 ». Le mois n'est pas complété à deux chiffres."""
        return f'{code_societe}-{annee}-{int(mois)}'

    def save(self, *args, **kwargs):
        if not self.date_trait:
            self.date_trait = dernier_jour(self.annee, self.mois)
        if not self.code and self.adherent_id:
            self.code = self.composer_code(self.adherent.code, self.annee, self.mois)
        super().save(*args, **kwargs)

    @property
    def periode(self):
        """« juin-2026 », tel que le libellé de l'écriture le porte."""
        return mois_abrege(self.annee, self.mois)

    @property
    def libelle(self):
        """« REMBT FRAIS MDCX : juin-2026 » - les deux côtés de l'écriture."""
        return f'{LIBELLE_RETENUE} : {self.periode}'

    @property
    def compte_participant(self):
        """411001 pour la société 01 : « 4110 » + code société."""
        return f'{PREFIXE_COMPTE_PARTICIPANT}{self.adherent.code}' if self.adherent_id else ''

    # --- Totaux --------------------------------------------------------------
    #
    # Ils somment les lignes **déjà chargées**, comme les cotisations : la
    # liste les prefetche en un coup. Juste après les avoir modifiées, c'est
    # `totaux_relus` qu'il faut appeler.

    @property
    def participants(self):
        return self.lignes.count()

    @property
    def preleves(self):
        return sum(1 for ligne in self.lignes.all() if ligne.retenue_paie)

    @property
    def total_paie(self):
        return sum(int(ligne.retenue_paie or 0) for ligne in self.lignes.all())

    @property
    def total_ipm(self):
        return sum(int(ligne.retenue_ipm or 0) for ligne in self.lignes.all())

    @property
    def total_solde(self):
        return sum(int(ligne.solde or 0) for ligne in self.lignes.all())

    @property
    def anomalies(self):
        """Combien de lignes prélèvent au-delà de la dette."""
        return sum(1 for ligne in self.lignes.all() if ligne.excedent)

    @property
    def excedent(self):
        return sum(ligne.excedent for ligne in self.lignes.all())

    @property
    def comptabilise(self):
        return self.statut == STATUT_APPEL_COMPTABILISE


class LigneRetenue(models.Model):
    """
    Ce qu'un participant doit, et ce que la paie lui a retenu.

    Deux colonnes de montant, et une seule compte. `retenue_ipm` est la
    proposition de l'IPM, `retenue_paie` le prélèvement réel que Sage renvoie
    par fichier. **Seule la seconde part en comptabilité** : vérifié sur les
    142 pièces de la production, sans une exception.
    """

    campagne = models.ForeignKey(
        CampagneRetenue, on_delete=models.CASCADE, related_name='lignes',
        verbose_name='Campagne',
    )
    participant = models.ForeignKey(
        'participants.Participant', on_delete=models.PROTECT, related_name='+',
        verbose_name='Participant',
    )

    # La dette, **photographiée au moment de l'appel** et figée là. C'est elle
    # qu'on exporte vers la paie, et c'est elle qui sert à repérer un
    # prélèvement qui dépasse. La recalculer à l'affichage la ferait bouger
    # sous les yeux de l'agent à chaque facture comptabilisée.
    solde = models.BigIntegerField('Solde', default=0)

    # La proposition : `min(solde, 35 000)`. Décorative - voir l'en-tête.
    retenue_ipm = models.BigIntegerField('Retenue IPM', default=0)

    # Ce que la paie a réellement prélevé. Vient du fichier, vaut 0 tant qu'il
    # n'est pas importé : 35,3 % des lignes de la production restent à zéro,
    # et le solde n'explique pas lesquelles - le critère est chez Sage.
    retenue_paie = models.BigIntegerField('Retenue Paie', default=0)

    class Meta:
        ordering = ['participant__matricule']
        verbose_name = 'Ligne de retenue'
        verbose_name_plural = 'Lignes de retenue'
        constraints = [
            models.UniqueConstraint(
                fields=['campagne', 'participant'], name='ligne_retenue_unique',
            ),
        ]

    def __str__(self):
        return f'{self.campagne_id} / {self.participant_id} : {self.retenue_paie}'

    @property
    def excedent(self):
        """
        Ce que la paie a prélevé **au-delà** de la dette.

        C'est l'anomalie du module, et la seule que la production porte
        vraiment : 310 lignes pour 8 563 422 F, dont 104 sur un solde nul.
        L'écran la signale ; il ne l'empêche pas (décision du 2026-11-05).
        """
        return max(0, int(self.retenue_paie or 0) - int(self.solde or 0))

    @property
    def solde_restant(self):
        """
        Ce que l'agent doit **encore**, une fois la retenue du mois passée.

        C'est ce chiffre, et non le solde photographié, qui repart dans le
        fichier vers la paie : l'export se fait après la comptabilisation, et
        renvoyer la dette d'avant ferait prélever deux fois la même somme le
        mois suivant. Il peut être **négatif** quand la paie a prélevé au-delà
        de la dette, et on l'envoie tel quel : c'est un trop-perçu réel, que
        LAMPS effaçait en bornant son affichage à zéro.
        """
        return int(self.solde or 0) - int(self.retenue_paie or 0)

    @property
    def retenue_suivante(self):
        """La proposition du mois prochain : `min(solde restant, 35 000)`."""
        return min(max(0, self.solde_restant), PLAFOND_RETENUE_IPM)

    @property
    def tiers(self):
        """« 01-0699 » : le compte tiers de l'écriture, société-matricule."""
        return f'{self.campagne.adherent.code}-{self.participant.matricule}'
