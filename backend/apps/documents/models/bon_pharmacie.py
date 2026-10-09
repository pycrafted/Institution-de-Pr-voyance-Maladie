"""
Bon de pharmacie.

Il autorise un bénéficiaire à retirer des médicaments chez un pharmacien, à la
charge de l'IPM. Il ne porte presque aucune donnée propre : il désigne des
tiers tenus ailleurs - la société (adhérents), le participant et son ayant
droit (participants), le type de bénéficiaire (données de base), la pharmacie
et le prescripteur (fournisseurs de soins). Leurs noms ne sont jamais recopiés
ici : ils se lisent sur leurs fiches.

La société est néanmoins retenue sur le bon, et non déduite du participant :
c'est celle du jour de l'émission. Un participant qui change d'adhérent plus
tard ne doit pas faire changer, après coup, qui a payé ses bons passés.
"""

from datetime import date

from django.conf import settings
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire
from participants.models import Beneficiaire, Participant

PREFIXE = 'BPI'


class BonPharmacie(models.Model):
    # « BPI043933 » : numéro attribué par le serveur (cf. prochain_code).
    code = models.CharField('Numéro', max_length=12, unique=True)
    # Date d'émission ; l'exercice s'en déduit.
    date = models.DateField('Date', default=date.today)

    # --- Pour qui ------------------------------------------------------------
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='bons_pharmacie',
        null=True, blank=True, verbose_name='Société',
    )
    participant = models.ForeignKey(
        Participant, on_delete=models.PROTECT, related_name='bons_pharmacie',
        null=True, blank=True, verbose_name='Participant',
    )
    type_benef = models.ForeignKey(
        TypeBeneficiaire, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Type de bénéficiaire',
    )
    # Vide quand le bénéficiaire est le participant lui-même (type PARTICIPANT).
    beneficiaire = models.ForeignKey(
        Beneficiaire, on_delete=models.PROTECT, related_name='bons_pharmacie',
        null=True, blank=True, verbose_name='Bénéficiaire',
    )

    # --- Où, et sur prescription de qui --------------------------------------
    pharmacie = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Pharmacie',
    )
    specialite = models.ForeignKey(
        Specialite, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Spécialité du prescripteur',
    )
    prescripteur = models.ForeignKey(
        FournisseurDeSoins, on_delete=models.PROTECT, related_name='+',
        null=True, blank=True, verbose_name='Prescripteur',
    )

    # --- Ordonnance ----------------------------------------------------------
    # Les médicaments retirés, choisis dans le catalogue (données de base →
    # Médicaments). Comme l'application d'origine, on les *sélectionne*, on ne
    # les tape pas. Conservés en l'état sur le bon - code CIP, intitulé,
    # quantité, tarif de référence et flag « exclus » au moment du choix - pour
    # pouvoir rouvrir et réimprimer le bon. LAMPS n'en garde pas la liste (le
    # bon n'imprime que leur nombre) : on fait mieux sans rien changer d'autre.
    # Chaque entrée : { code, libelle, quantite, tarif, exclus }.
    medicaments = models.JSONField('Médicaments', default=list, blank=True)
    # Nombre d'articles de l'ordonnance : déduit du nombre de médicaments
    # choisis (cf. BonPharmacieSerializer.validate), comme à l'écran d'origine.
    nb_articles = models.PositiveIntegerField('Nb. articles', default=0)
    date_ordonnance = models.DateField('Date ordonnance', null=True, blank=True)
    remboursement_integral = models.BooleanField('Remboursement intégral', default=False)

    # --- Traitement ----------------------------------------------------------
    # Le numéro de facture arrive avec la facture de la pharmacie, au
    # traitement du bon.
    numero_facture = models.CharField('N° facture', max_length=20, blank=True)
    traite = models.BooleanField('Traité', default=False)
    # Un bon ne se supprime pas une fois émis : il s'annule.
    actif = models.BooleanField('Valide', default=True)
    # Qui a émis le bon : son identifiant figure sur le bon imprimé (« par : »).
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
        verbose_name = 'Bon de pharmacie'
        verbose_name_plural = 'Bons de pharmacie'

    def __str__(self):
        return self.code

    @property
    def exercice(self):
        return str(self.date.year) if self.date else ''

    @classmethod
    def prochain_code(cls):
        """« BPI000001 », puis le suivant du plus grand numéro existant."""
        rangs = [
            int(code[len(PREFIXE):])
            for code in cls.objects.values_list('code', flat=True)
            if code.startswith(PREFIXE) and code[len(PREFIXE):].isdigit()
        ]
        return f'{PREFIXE}{max(rangs, default=0) + 1:06d}'
