"""
Lettre de garantie.

La caisse s'y engage envers un prestataire à prendre en charge les actes d'un
bénéficiaire. Comme le bon de pharmacie, elle désigne des tiers tenus
ailleurs - société, participant et ayant droit, type de bénéficiaire, nature
de la prestation, prestataire et prescripteur - dont les noms ne sont jamais
recopiés ici.

Champs repris de l'écran « Edition lettre de garantie » de l'application
d'origine : participant (société, matricule), bénéficiaire (type,
bénéficiaire), prestataire (spécialité, prestataire, nature prestation),
prescripteur (spécialité, prescripteur), actes (nb. articles, date
prescription), remboursement intégral. Le numéro de facture et l'état
« traité » suivent le bon de pharmacie : la lettre imprimée porte elle aussi
« Original à joindre à la facture ».

La société est retenue sur la lettre, celle du jour de l'établissement.
"""

from datetime import date

from django.conf import settings
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from participants.models import Beneficiaire, Participant

PREFIXE = 'LGI'


class LettreGarantie(models.Model):
    # « LGI032246 » : numéro attribué par le serveur (cf. prochain_code).
    code = models.CharField('Numéro', max_length=12, unique=True)
    # Date d'établissement ; l'exercice s'en déduit.
    date = models.DateField('Date', default=date.today)

    # --- Pour qui ------------------------------------------------------------
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='lettres_garantie',
        null=True, blank=True, verbose_name='Société',
    )
    participant = models.ForeignKey(
        Participant, on_delete=models.PROTECT, related_name='lettres_garantie',
        null=True, blank=True, verbose_name='Participant',
    )
    type_benef = models.ForeignKey(
        TypeBeneficiaire, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Type de bénéficiaire',
    )
    # Vide quand le bénéficiaire est le participant lui-même (type PARTICIPANT).
    beneficiaire = models.ForeignKey(
        Beneficiaire, on_delete=models.PROTECT, related_name='lettres_garantie',
        null=True, blank=True, verbose_name='Bénéficiaire',
    )

    # --- Prestataire ---------------------------------------------------------
    specialite_prestataire = models.ForeignKey(
        Specialite, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Spécialité du prestataire',
    )
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

    # --- Actes ---------------------------------------------------------------
    # Les actes de la prescription, choisis dans la nomenclature (données de
    # base → Actes), comme l'application d'origine : on les *sélectionne*, on ne
    # les tape pas. Conservés en l'état sur la lettre - code, intitulé,
    # spécialité, quantité et tarif (saisi sur le document, le tarif de
    # référence valant le plus souvent 0) - pour rouvrir et réimprimer la
    # lettre. Chaque entrée : { code, libelle, specialite, quantite, tarif }.
    actes = models.JSONField('Actes', default=list, blank=True)
    # Nombre d'articles : déduit du nombre d'actes choisis (cf.
    # LettreGarantieSerializer.validate), comme à l'écran d'origine.
    nb_articles = models.PositiveIntegerField('Nb. articles', default=0)
    date_prescription = models.DateField('Date prescription', null=True, blank=True)
    remboursement_integral = models.BooleanField('Remboursement intégral', default=False)

    # --- Traitement ----------------------------------------------------------
    numero_facture = models.CharField('N° facture', max_length=20, blank=True)
    traite = models.BooleanField('Traitée', default=False)
    # Une lettre ne se supprime pas une fois établie : elle s'annule.
    actif = models.BooleanField('Valide', default=True)
    # Qui a établi la lettre : son identifiant figure sur la lettre imprimée.
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
        verbose_name = 'Lettre de garantie'
        verbose_name_plural = 'Lettres de garantie'

    def __str__(self):
        return self.code

    @property
    def exercice(self):
        return str(self.date.year) if self.date else ''

    @classmethod
    def prochain_code(cls):
        """« LGI000001 », puis le suivant du plus grand numéro existant."""
        rangs = [
            int(code[len(PREFIXE):])
            for code in cls.objects.values_list('code', flat=True)
            if code.startswith(PREFIXE) and code[len(PREFIXE):].isdigit()
        ]
        return f'{PREFIXE}{max(rangs, default=0) + 1:06d}'
