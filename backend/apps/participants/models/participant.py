"""
Participants et bénéficiaires.

Un participant est un salarié couvert par l'IPM. Il se rattache à un adhérent,
la collectivité qui cotise pour lui. Ses bénéficiaires - conjoints, enfants,
ascendants - forment sa famille : l'onglet « Familles » de la page.

Les champs reprennent ceux de la fiche à l'écran (cf.
src/views/participants/config.js), en snake_case. La base n'en impose aucun :
les champs obligatoires de la fiche le sont par le serializer, avec le même
message qu'à l'écran.

Identifiants, comme l'application d'origine (qui fait foi) :
  - participant : un matricule de quatre chiffres (« 0949 »), montré après le
    code de sa société dans les documents (« 02-0949 ») ;
  - bénéficiaire : société, matricule du participant, puis code du type et
    rang dans ce type - « 02-0949-21 » est la première épouse (type 2) du
    participant 0949 de la société 02.
"""

from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire

# États administratifs d'un dossier, du dépôt à la radiation. Mêmes valeurs
# que le filtre et le champ de l'écran (ETATS_PARTICIPANT).
ETATS = [(etat, etat) for etat in ('En Attente', 'Actif', 'Suspendu', 'Résilié', 'Radié')]

# Régime de l'adhérent qui couvre les anciens salariés : la mutuelle CMM,
# enregistrée « MSS » dans l'application d'origine (cf. Adherent.TYPES_ADHERENT).
REGIME_MUTUELLE = 'MSS'

# Sortie d'un dossier : l'état du participant et celui de son contrat ne
# peuvent pas se contredire, et chacun porte sa date. Le serializer applique
# la correspondance (cf. ParticipantSerializer.validate).
SORTIES = {
    'Résilié': ('Fermeture', 'date_resiliation'),
    'Radié': ('Radiation', 'date_radiation'),
}

SEXES = [('M', 'Homme'), ('F', 'Femme')]


class Participant(models.Model):
    # --- Identité ------------------------------------------------------------
    matricule = models.CharField('Matricule', max_length=20, unique=True)
    nom = models.CharField('Nom', max_length=100, blank=True)
    prenoms = models.CharField('Prénom(s)', max_length=150, blank=True)
    sexe = models.CharField('Sexe', max_length=1, choices=SEXES, blank=True)
    # Photo d'identité, réduite à 320 px sur le poste avant l'envoi et gardée
    # telle quelle (image encodée) avec la fiche.
    photo = models.TextField('Photo d’identité', blank=True)
    nationalite = models.CharField('Nationalité', max_length=3, blank=True, default='SEN')
    type_piece = models.CharField('Type de pièce', max_length=20, blank=True)
    numero_piece = models.CharField('N° de pièce', max_length=30, blank=True)
    situation_familiale = models.CharField('Situation familiale', max_length=12, blank=True)
    date_naissance = models.DateField('Date de naissance', null=True, blank=True)
    lieu_naissance = models.CharField('Lieu de naissance', max_length=100, blank=True)

    # --- Coordonnées ---------------------------------------------------------
    adresse = models.CharField('Adresse', max_length=255, blank=True)
    mobile = models.CharField('Téléphone portable', max_length=30, blank=True)
    region = models.CharField('Région', max_length=50, blank=True)
    email = models.EmailField('Email', blank=True)

    # --- Situation professionnelle -------------------------------------------
    date_embauche = models.DateField('Date d’embauche', null=True, blank=True)
    type_contrat = models.CharField('Type de contrat', max_length=3, blank=True)
    categorie = models.CharField('Catégorie professionnelle', max_length=20, blank=True)
    # Codes du référentiel « Structure » (DIR001, DEP004, SRV007) : comme le
    # rattachement d'une entité à sa parente, c'est le code que l'écran manie.
    direction = models.CharField('Direction', max_length=6, blank=True)
    departement = models.CharField('Département', max_length=6, blank=True)
    service = models.CharField('Service', max_length=6, blank=True)

    # --- Contrat IPM ---------------------------------------------------------
    # PROTECT : un adhérent qui porte encore des participants ne se supprime
    # pas. Nullable pour que l'obligation se dise sous le champ, par le
    # serializer, et non par une erreur de base.
    adherent = models.ForeignKey(
        Adherent,
        on_delete=models.PROTECT,
        related_name='participants',
        null=True,
        blank=True,
        verbose_name='Société',
    )
    numero_fiche = models.CharField('N° fiche', max_length=20, blank=True)
    numero_contrat = models.CharField('N° contrat', max_length=30, blank=True)
    date_souscription = models.DateField('Date de souscription', null=True, blank=True)
    etat_contrat = models.CharField('État du contrat', max_length=12, blank=True, default='Ouverture')
    date_resiliation = models.DateField('Date de résiliation', null=True, blank=True)
    date_radiation = models.DateField('Date de radiation', null=True, blank=True)

    # --- Application mobile --------------------------------------------------
    # Mot de passe de l'application mobile (pwa/), gardé chiffré comme celui
    # d'un utilisateur IPM : jamais en clair, jamais rendu par l'API. Vide :
    # le participant ne peut pas se connecter au mobile.
    mot_de_passe = models.CharField('Mot de passe mobile', max_length=128, blank=True)

    # --- Dossier -------------------------------------------------------------
    # Un dossier qui vient d'être saisi attend son instruction.
    etat = models.CharField('État', max_length=12, choices=ETATS, default='En Attente')
    actif = models.BooleanField('Actif', default=True)

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        ordering = ['matricule']
        verbose_name = 'Participant'
        verbose_name_plural = 'Participants'

    def __str__(self):
        return f'{self.matricule} - {self.prenoms} {self.nom}'.strip()

    @property
    def nom_complet(self):
        return f'{self.prenoms} {self.nom}'.strip()

    @property
    def retraite(self):
        """
        Retraité : couvert par la mutuelle et non plus par l'IPM.

        L'IPM couvre les salariés en activité ; à leur départ, les anciens
        salariés de la SAR passent aux deux mutuelles - « CMM CR-SAR » et
        « CMM NCR-SAR », régime MSS. Le régime de l'adhérent dit donc à lui
        seul de quelle liste relève un participant, et c'est ce qui sépare les
        onglets « Participants IPM » et « Participants Retraités ».

        Déduit, et non saisi : une case à cocher séparée aurait fini par
        contredire la société - un « retraité » rattaché à PERSONNEL CADRES.
        """
        return bool(self.adherent_id) and self.adherent.type == REGIME_MUTUELLE

    def definir_mot_de_passe(self, mot_de_passe):
        self.mot_de_passe = make_password(mot_de_passe)

    def verifier_mot_de_passe(self, mot_de_passe):
        return bool(self.mot_de_passe) and check_password(mot_de_passe, self.mot_de_passe)


class Beneficiaire(models.Model):
    # Attribué par le serveur à la création (cf. prochain_matricule).
    matricule_benef = models.CharField('Matricule bénéficiaire', max_length=25, unique=True)
    # Lien avec le participant, pris dans le référentiel « Types de
    # bénéficiaire » des données de base - c'est son code qui entre dans le
    # matricule et que les documents affichent.
    type_benef = models.ForeignKey(
        TypeBeneficiaire,
        on_delete=models.PROTECT,
        related_name='beneficiaires',
        null=True,
        blank=True,
        verbose_name='Type',
    )
    # PROTECT : un participant qui a encore des bénéficiaires ne se supprime
    # pas - sa famille disparaîtrait avec lui.
    participant = models.ForeignKey(
        Participant,
        on_delete=models.PROTECT,
        related_name='beneficiaires',
        verbose_name='Participant',
    )
    prenoms = models.CharField('Prénom(s)', max_length=150, blank=True)
    nom = models.CharField('Nom', max_length=100, blank=True)
    adresse = models.CharField('Adresse', max_length=255, blank=True)
    date_naissance = models.DateField('Date de naissance', null=True, blank=True)
    lieu_naissance = models.CharField('Lieu de naissance', max_length=100, blank=True)
    sexe = models.CharField('Sexe', max_length=1, choices=SEXES, blank=True)
    etat = models.CharField('État', max_length=12, choices=ETATS, default='Actif')
    actif = models.BooleanField('Actif', default=True)

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        ordering = ['matricule_benef']
        verbose_name = 'Bénéficiaire'
        verbose_name_plural = 'Bénéficiaires'

    def __str__(self):
        return f'{self.matricule_benef} - {self.prenoms} {self.nom}'.strip()

    @property
    def nom_complet(self):
        return f'{self.prenoms} {self.nom}'.strip()

    @staticmethod
    def composer_matricule(participant, type_benef, rang):
        """« 02-0949-21 » : société, matricule, code du type et rang."""
        societe = participant.adherent.code if participant.adherent_id else '00'
        return f'{societe}-{participant.matricule}-{type_benef.code}{rang}'

    @classmethod
    def recomposer(cls, participant):
        """
        Réécrit les matricules d'une famille après un changement de fiche.

        Le matricule d'un bénéficiaire recopie la société et le matricule de
        son participant (« 01-0949-21 ») : le jour où l'un des deux change -
        une mutation d'une société à l'autre, un matricule corrigé -, la
        famille désigne encore l'ancienne fiche. Le lien de parenté et le rang
        dans la fratrie, eux, ne bougent pas : ils sont relus tels quels.
        """
        for membre in participant.beneficiaires.select_related('type_benef'):
            if not membre.type_benef_id:
                continue
            code = membre.type_benef.code
            suffixe = membre.matricule_benef.rpartition('-')[2]
            rang = suffixe[len(code):] if suffixe.startswith(code) else suffixe
            nouveau = cls.composer_matricule(participant, membre.type_benef, rang)
            if nouveau != membre.matricule_benef:
                membre.matricule_benef = nouveau
                membre.save(update_fields=['matricule_benef'])

    @classmethod
    def prochain_matricule(cls, participant, type_benef):
        """Matricule du prochain bénéficiaire de ce type pour ce participant."""
        rang = cls.objects.filter(participant=participant, type_benef=type_benef).count() + 1
        # Un rang libéré par une suppression ne resert pas : on avance tant
        # que le matricule est déjà pris.
        while cls.objects.filter(
            matricule_benef=cls.composer_matricule(participant, type_benef, rang)
        ).exists():
            rang += 1
        return cls.composer_matricule(participant, type_benef, rang)
