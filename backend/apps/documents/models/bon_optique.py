"""
Bon de commande optique.

La caisse y commande à un opticien, au vu d'une ordonnance, les articles d'un
bénéficiaire - « Montures & Verres ». Comme le bon de pharmacie, il désigne
des tiers tenus ailleurs - société, participant et ayant droit, type de
bénéficiaire, fournisseur et prescripteur - dont les noms ne sont jamais
recopiés ici.

Champs repris de l'écran « Edition bon de commande optique » de l'application
d'origine (capture 27) : Participant (Société, Matricule), Bénéficiaire (Type,
Bénéficiaire), Prescripteur (Spécialité, Prescripteur), Fournisseur
(= l'opticien, spécialité 04, + Date prescription + « Saisir les actes »), et
l'option Remboursement intégral - exactement le patron des autres documents.

Les actes de l'optique sont les articles optiques choisis dans la nomenclature
(Montures, Verres, Montures & Verres, Traitement - spécialité 04), avec leur
quantité et leur tarif saisi. Le bon imprimé (« BON DE COMMANDE OPTIQUE ») en
tire sa ligne commandée et ses montants (total, remise, net).

Les montants sont en francs CFA, sans décimales.
"""

from datetime import date

from django.conf import settings
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire
from participants.models import Beneficiaire, Participant

PREFIXE = 'BCI'


class BonOptique(models.Model):
    # « BCI000297 » : numéro attribué par le serveur (cf. prochain_code).
    code = models.CharField('Numéro', max_length=12, unique=True)
    # Date d'établissement ; l'exercice s'en déduit.
    date = models.DateField('Date', default=date.today)

    # --- Pour qui ------------------------------------------------------------
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='bons_optique',
        null=True, blank=True, verbose_name='Société',
    )
    participant = models.ForeignKey(
        Participant, on_delete=models.PROTECT, related_name='bons_optique',
        null=True, blank=True, verbose_name='Participant',
    )
    type_benef = models.ForeignKey(
        TypeBeneficiaire, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Type de bénéficiaire',
    )
    # Vide quand le bénéficiaire est le participant lui-même (type PARTICIPANT).
    beneficiaire = models.ForeignKey(
        Beneficiaire, on_delete=models.PROTECT, related_name='bons_optique',
        null=True, blank=True, verbose_name='Bénéficiaire',
    )

    # --- Fournisseur ---------------------------------------------------------
    fournisseur = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Fournisseur',
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
    date_ordonnance = models.DateField('Date prescription', null=True, blank=True)

    # --- Articles optiques ---------------------------------------------------
    # Les articles commandés, choisis dans la nomenclature (données de base →
    # Actes, spécialité 04) : on les *sélectionne*, on ne les tape pas - comme
    # l'application d'origine (« Saisir les actes »). Chaque entrée :
    # { code, libelle, specialite, quantite, tarif }. Le bon imprimé en tire sa
    # ligne commandée (désignation = libellé, PU = tarif) et ses montants.
    actes = models.JSONField('Articles', default=list, blank=True)
    # Remise éventuelle sur le bon imprimé (l'écran d'édition ne la saisit pas :
    # elle vaut 0 à l'émission, comme dans les données d'origine).
    montant_remise = models.PositiveIntegerField('Montant remise', default=0)
    remboursement_integral = models.BooleanField('Remboursement intégral', default=False)

    # --- Traitement ----------------------------------------------------------
    numero_facture = models.CharField('N° facture', max_length=20, blank=True)
    traite = models.BooleanField('Traité', default=False)
    # Un bon ne se supprime pas une fois établi : il s'annule.
    actif = models.BooleanField('Valide', default=True)
    # Qui a établi le bon : son identifiant figure sur le bon imprimé.
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='+',
        null=True, blank=True, verbose_name='Créé par',
    )

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        # Le plus récent en haut : c'est le document qu'on vient d'émettre
        # que l'on cherche à l'écran, pas le plus ancien. Les numéros étant
        # attribués dans l'ordre et complétés de zéros (« BPI000079 »), le
        # décroissant sur le numéro donne l'ordre d'émission inversé.
        ordering = ['-code']
        verbose_name = 'Bon optique'
        verbose_name_plural = 'Bons optique'

    def __str__(self):
        return self.code

    @property
    def exercice(self):
        return str(self.date.year) if self.date else ''

    @property
    def montant_total(self):
        """Somme des articles : quantité × tarif de chaque acte."""
        total = 0
        for acte in self.actes or []:
            try:
                total += int(acte.get('quantite') or 0) * int(acte.get('tarif') or 0)
            except (TypeError, ValueError, AttributeError):
                continue
        return total

    @property
    def montant_net(self):
        return self.montant_total - self.montant_remise

    @classmethod
    def prochain_code(cls):
        """« BCI000001 », puis le suivant du plus grand numéro existant."""
        rangs = [
            int(code[len(PREFIXE):])
            for code in cls.objects.values_list('code', flat=True)
            if code.startswith(PREFIXE) and code[len(PREFIXE):].isdigit()
        ]
        return f'{PREFIXE}{max(rangs, default=0) + 1:06d}'
