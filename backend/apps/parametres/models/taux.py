"""
Taux de prise en charge.

Repris de l'onglet « Taux de Prise en Charge » de l'écran Paramètres de
l'application d'origine : pour une société, chaque nature de prestation et
chaque type de bénéficiaire porte un taux (en %), un plafond et un forfait
(en francs CFA).

Le plafond est le montant maximum couvert : des lunettes prises en charge à
100 % avec un plafond de 250 000 laissent 50 000 à la charge du participant
sur une facture de 300 000.

Le compte comptable ne se saisit pas - l'écran d'origine le montre grisé :
c'est celui de la nature de prestation (602004 pour « 04 - OPTIQUE »).

Un taux exceptionnel vise une personne : un participant et une nature de
prestation, avec ses propres taux, plafond et forfait.
"""

from django.core.validators import MaxValueValidator
from django.db import models

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire, TypePrestation
from participants.models import Participant


class Taux(models.Model):
    """Ce que le taux d'une société et celui d'une personne ont en commun."""

    taux = models.PositiveIntegerField('Taux (%)', default=0, validators=[MaxValueValidator(100)])
    plafond = models.PositiveIntegerField('Plafond', default=0)
    forfait = models.PositiveIntegerField('Forfait', default=0)

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        abstract = True

    @property
    def compte(self):
        """Le compte de la nature de prestation : il n'est jamais saisi ici."""
        return self.prestation.compte if self.prestation_id else ''


class TauxPriseEnCharge(Taux):
    adherent = models.ForeignKey(
        Adherent, on_delete=models.PROTECT, related_name='taux', verbose_name='Société',
    )
    prestation = models.ForeignKey(
        TypePrestation, on_delete=models.PROTECT, related_name='+', verbose_name='Nature prestation',
    )
    type_benef = models.ForeignKey(
        TypeBeneficiaire, on_delete=models.PROTECT, related_name='+',
        verbose_name='Type de bénéficiaire',
    )

    class Meta:
        ordering = ['adherent__code', 'prestation__code', 'type_benef__code']
        verbose_name = 'Taux de prise en charge'
        verbose_name_plural = 'Taux de prise en charge'
        constraints = [
            # Un seul taux par société, prestation et type de bénéficiaire.
            models.UniqueConstraint(
                fields=['adherent', 'prestation', 'type_benef'],
                name='taux_unique_societe_prestation_type',
            )
        ]

    def __str__(self):
        return f'{self.adherent} · {self.prestation} · {self.type_benef}'


class TauxExceptionnel(Taux):
    """Taux ciblé sur une personne, qui l'emporte sur celui de sa société."""

    participant = models.ForeignKey(
        Participant, on_delete=models.PROTECT, related_name='taux_exceptionnels',
        verbose_name='Participant',
    )
    prestation = models.ForeignKey(
        TypePrestation, on_delete=models.PROTECT, related_name='+', verbose_name='Nature prestation',
    )

    class Meta:
        ordering = ['participant__matricule', 'prestation__code']
        verbose_name = 'Taux exceptionnel'
        verbose_name_plural = 'Taux exceptionnels'
        constraints = [
            models.UniqueConstraint(
                fields=['participant', 'prestation'],
                name='taux_exceptionnel_unique_participant_prestation',
            )
        ]

    def __str__(self):
        return f'{self.participant} · {self.prestation}'
