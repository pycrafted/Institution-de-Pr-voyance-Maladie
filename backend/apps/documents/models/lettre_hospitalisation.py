"""
Lettre de garantie hospitalisation.

La caisse s'y engage envers une structure de santé - hôpital, clinique,
centre de santé - à prendre en charge l'hospitalisation d'un bénéficiaire.
Comme la lettre de garantie, elle désigne des tiers tenus ailleurs, dont les
noms ne sont jamais recopiés ici.

Champs repris de l'écran « Edition Lettre de garantie hospitalisation » de
l'application d'origine :
  - Société, Matricule Participant ;
  - Bénéficiaire : Type, Bénéficiaire ;
  - Structure de Santé : Type (HOPITAL, CLINIQUE, CENTRE DE SANTE),
    Catégorie (1ère à 4ème Catégorie), Prestataire, Nature prestation ;
  - Prescripteur : Spécialité, Prescripteur, Date prescription ;
  - Motif d'hospitalisation : Remise, et les actes (acte, quantité, tarif) ;
  - Remboursement intégral.
Le numéro de facture et l'état « traité » suivent les autres documents (la
liste d'origine montre une colonne « N° Facture »).

Le numéro est préfixé **LHI** (vérifié sur le dump LAMPS : `documents_ipm`,
`typedoc = 'LHI'`, numéros « LHI000003 »… - et non « LGH »).
"""

from datetime import date

from django.conf import settings
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from participants.models import Beneficiaire, Participant

PREFIXE = 'LHI'

TYPES_STRUCTURE = [
    ('HOPITAL', 'HOPITAL'),
    ('CLINIQUE', 'CLINIQUE'),
    ('CENTRE DE SANTE', 'CENTRE DE SANTE'),
]

# Type de structure → libellé de la spécialité de ses prestataires : un hôpital
# se choisit parmi les HOPITAUX (« 0301 - HOPITAL LE DANTEC » à l'origine).
SPECIALITE_DU_TYPE = {
    'HOPITAL': 'HOPITAUX',
    'CLINIQUE': 'CLINIQUES',
    'CENTRE DE SANTE': 'CENTRES DE SANTE',
}

CATEGORIES = [
    ('1', '1ère Catégorie'),
    ('2', '2ème Catégorie'),
    ('3', '3ème Catégorie'),
    ('4', '4ème Catégorie'),
]


class LettreHospitalisation(models.Model):
    # « LGH000001 » : numéro attribué par le serveur (cf. prochain_code).
    code = models.CharField('Numéro', max_length=12, unique=True)
    # Date d'établissement ; l'exercice s'en déduit.
    date = models.DateField('Date', default=date.today)

    # --- Pour qui ------------------------------------------------------------
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='lettres_hospitalisation',
        null=True, blank=True, verbose_name='Société',
    )
    participant = models.ForeignKey(
        Participant, on_delete=models.PROTECT, related_name='lettres_hospitalisation',
        null=True, blank=True, verbose_name='Participant',
    )
    type_benef = models.ForeignKey(
        TypeBeneficiaire, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Type de bénéficiaire',
    )
    # Vide quand le bénéficiaire est le participant lui-même (type PARTICIPANT).
    beneficiaire = models.ForeignKey(
        Beneficiaire, on_delete=models.PROTECT, related_name='lettres_hospitalisation',
        null=True, blank=True, verbose_name='Bénéficiaire',
    )

    # --- Structure de santé --------------------------------------------------
    type_structure = models.CharField(
        'Type de structure', max_length=20, choices=TYPES_STRUCTURE, blank=True,
    )
    categorie = models.CharField('Catégorie', max_length=1, choices=CATEGORIES, blank=True)
    prestataire = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Prestataire',
    )
    nature_prestation = models.ForeignKey(
        TypePrestation, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Nature prestation',
    )

    # --- Prescripteur --------------------------------------------------------
    specialite = models.ForeignKey(
        Specialite, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Spécialité du prescripteur',
    )
    prescripteur = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Prescripteur',
    )
    date_prescription = models.DateField('Date prescription', null=True, blank=True)

    # --- Motif d'hospitalisation ---------------------------------------------
    remise = models.PositiveIntegerField('Remise', default=0)
    # Les actes du motif, choisis dans la nomenclature (données de base →
    # Actes), filtrée sur la spécialité de la structure : on les *sélectionne*,
    # on ne les tape pas - comme l'application d'origine (« - Rechercher acte - »).
    # Conservés en l'état - code, intitulé, spécialité, quantité et tarif (saisi,
    # le tarif de référence valant souvent 0). Chaque entrée :
    # { code, libelle, specialite, quantite, tarif }.
    actes = models.JSONField('Actes', default=list, blank=True)
    remboursement_integral = models.BooleanField('Remboursement intégral', default=False)

    # --- Traitement ----------------------------------------------------------
    numero_facture = models.CharField('N° facture', max_length=20, blank=True)
    traite = models.BooleanField('Traitée', default=False)
    # Une lettre ne se supprime pas une fois établie : elle s'annule.
    actif = models.BooleanField('Valide', default=True)
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='+',
        null=True, blank=True, verbose_name='Créée par',
    )

    cree_le = models.DateTimeField('Créée le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifiée le', auto_now=True)

    class Meta:
        # Le plus récent en haut : c'est le document qu'on vient d'émettre
        # que l'on cherche à l'écran, pas le plus ancien. Les numéros étant
        # attribués dans l'ordre et complétés de zéros (« BPI000079 »), le
        # décroissant sur le numéro donne l'ordre d'émission inversé.
        ordering = ['-code']
        verbose_name = 'Lettre de garantie hospitalisation'
        verbose_name_plural = 'Lettres de garantie hospitalisation'

    def __str__(self):
        return self.code

    @property
    def exercice(self):
        return str(self.date.year) if self.date else ''

    @classmethod
    def prochain_code(cls):
        """« LGH000001 », puis le suivant du plus grand numéro existant."""
        rangs = [
            int(code[len(PREFIXE):])
            for code in cls.objects.values_list('code', flat=True)
            if code.startswith(PREFIXE) and code[len(PREFIXE):].isdigit()
        ]
        return f'{PREFIXE}{max(rangs, default=0) + 1:06d}'
