"""
Demande d'agrément d'un fournisseur de soins.

Un prestataire n'entre pas directement dans la liste des fournisseurs : il y
est admis. La demande porte sa fiche complète le temps de l'instruction ; sa
validation fait naître le fournisseur, qui prend alors le numéro suivant de la
liste. La demande n'est pas effacée pour autant — elle reste, validée, avec la
trace de qui l'a acceptée et quand.

Le numéro de demande (« DA0001 ») forme une série distincte de celle des
fournisseurs : une demande n'est pas encore un fournisseur, et « 070 »
désignant tantôt l'un tantôt l'autre prêterait à confusion.
"""

from datetime import date

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from .fiche_fournisseur import FicheFournisseur
from .fournisseur_de_soins import FournisseurDeSoins
from .specialite import Specialite


class DemandeDejaTraitee(Exception):
    """La demande a été validée entre sa lecture et sa validation."""


class DemandeAgrement(FicheFournisseur):
    EN_ATTENTE = 'en_attente'
    VALIDEE = 'validee'
    STATUTS = [(EN_ATTENTE, 'En attente'), (VALIDEE, 'Validée')]

    PREFIXE = 'DA'

    code = models.CharField('Numéro', max_length=10, unique=True)
    date_demande = models.DateField('Date de la demande', default=date.today)

    specialite = models.ForeignKey(
        Specialite,
        on_delete=models.PROTECT,
        related_name='demandes_agrement',
        verbose_name='Spécialité',
    )

    statut = models.CharField('Statut', max_length=12, choices=STATUTS, default=EN_ATTENTE)

    # --- Trace de la validation -------------------------------------------
    # SET_NULL et non PROTECT sur le fournisseur : la liste des fournisseurs
    # garde ses propres règles de suppression, qu'une demande archivée n'a pas
    # à contrarier. La demande reste alors validée, sans lien.
    fournisseur = models.OneToOneField(
        FournisseurDeSoins,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='demande_agrement',
        verbose_name='Fournisseur créé',
    )
    valide_le = models.DateTimeField('Validée le', null=True, blank=True)
    valide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='Validée par',
    )

    class Meta:
        ordering = ['code']
        verbose_name = 'Demande d’agrément'
        verbose_name_plural = 'Demandes d’agrément'

    @classmethod
    def prochain_code(cls):
        """
        Numéro de la prochaine demande, calculé sur toutes les demandes —
        validées comprises. L'écran ne voit que celles en attente : s'il
        calculait lui-même, il reprendrait le numéro d'une demande déjà
        validée.
        """
        rangs = (c[len(cls.PREFIXE) :] for c in cls.objects.values_list('code', flat=True))
        return f'{cls.PREFIXE}{max((int(r) for r in rangs if r.isdigit()), default=0) + 1:04d}'

    @transaction.atomic
    def valider(self, utilisateur):
        """
        Fait naître le fournisseur agréé et clôt la demande. Renvoie le
        fournisseur créé.

        Le passage au statut « validée » se fait d'abord, par une mise à jour
        conditionnelle : si deux personnes valident la même demande au même
        instant, une seule l'emporte, et l'autre reçoit ``DemandeDejaTraitee``
        au lieu de créer un second fournisseur. Tout se déroule dans une même
        transaction : un échec à la création du fournisseur rend la demande à
        l'attente.
        """
        prise = DemandeAgrement.objects.filter(pk=self.pk, statut=self.EN_ATTENTE).update(
            statut=self.VALIDEE
        )
        if not prise:
            raise DemandeDejaTraitee(self.code)

        fiche = {champ: getattr(self, champ) for champ in self.CHAMPS_FICHE}
        # Le formulaire de demande ne saisit les numéros qu'une fois, dans la
        # section Contact : ce sont eux qui deviennent le fixe et le portable
        # du fournisseur, ceux que sa liste affiche. Une demande qui porterait
        # déjà des numéros propres les garde.
        fiche['telephone'] = self.telephone or self.contact_telephone
        fiche['mobile'] = self.mobile or self.contact_mobile
        fournisseur = FournisseurDeSoins.objects.create(
            code=FournisseurDeSoins.prochain_code(),
            specialite=self.specialite,
            **fiche,
        )

        self.statut = self.VALIDEE
        self.fournisseur = fournisseur
        self.valide_le = timezone.now()
        self.valide_par = utilisateur
        self.save(update_fields=['statut', 'fournisseur', 'valide_le', 'valide_par', 'modifie_le'])
        return fournisseur
