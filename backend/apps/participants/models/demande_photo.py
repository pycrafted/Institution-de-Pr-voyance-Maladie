"""
Demande de réinitialisation d'une photo d'identité.

La photo d'identité se pose une seule fois depuis l'application mobile, par
le titulaire, pour lui-même ou un de ses ayants droit. Ensuite, ni lui ni
l'IPM ne la remplacent : c'est une pièce présentée au prestataire pour prouver
que le porteur de la carte est bien le bénéficiaire.

Pour la changer, le titulaire DEMANDE sa réinitialisation depuis le mobile.
L'IPM instruit la demande dans l'application de gestion : elle réinitialise
la photo (qui redevient vide, et que le titulaire peut alors reposer), ou
refuse la demande. Elle ne pose jamais elle-même un portrait.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

EN_ATTENTE = 'En attente'
TRAITEE = 'Traitée'
REFUSEE = 'Refusée'
STATUTS = [(EN_ATTENTE, EN_ATTENTE), (TRAITEE, TRAITEE), (REFUSEE, REFUSEE)]


class DemandePhoto(models.Model):
    # Le titulaire qui demande ; la photo visée est la sienne si
    # ``beneficiaire`` est vide, sinon celle de cet ayant droit.
    participant = models.ForeignKey(
        'participants.Participant',
        on_delete=models.CASCADE,
        related_name='demandes_photo',
        verbose_name='Participant',
    )
    beneficiaire = models.ForeignKey(
        'participants.Beneficiaire',
        on_delete=models.CASCADE,
        related_name='demandes_photo',
        null=True,
        blank=True,
        verbose_name='Ayant droit',
    )
    motif = models.CharField('Motif', max_length=255, blank=True)
    statut = models.CharField('Statut', max_length=12, choices=STATUTS, default=EN_ATTENTE)

    cree_le = models.DateTimeField('Demandée le', auto_now_add=True)
    traite_le = models.DateTimeField('Traitée le', null=True, blank=True)
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='+',
        null=True,
        blank=True,
        verbose_name='Traitée par',
    )

    class Meta:
        # Les plus récentes d'abord : c'est la demande du jour qu'on instruit.
        ordering = ['-cree_le', '-id']
        verbose_name = 'Demande de réinitialisation de photo'
        verbose_name_plural = 'Demandes de réinitialisation de photo'

    def __str__(self):
        return f'{self.personne} - {self.statut}'

    @property
    def personne(self):
        """La fiche dont la photo est visée : l'ayant droit, ou le participant."""
        return self.beneficiaire or self.participant

    def _clore(self, statut, utilisateur):
        self.statut = statut
        self.traite_le = timezone.now()
        self.traite_par = utilisateur if getattr(utilisateur, 'is_authenticated', False) else None
        self.save(update_fields=['statut', 'traite_le', 'traite_par'])

    def reinitialiser(self, utilisateur=None):
        """Efface la photo visée et clôt la demande : le titulaire pourra la reposer."""
        personne = self.personne
        if personne.photo:
            personne.photo = ''
            personne.save(update_fields=['photo', 'modifie_le'])
        self._clore(TRAITEE, utilisateur)

    def refuser(self, utilisateur=None):
        """Clôt la demande sans toucher à la photo."""
        self._clore(REFUSEE, utilisateur)

    @classmethod
    def clore_pour(cls, personne, utilisateur=None):
        """
        La photo de ``personne`` vient d'être réinitialisée depuis sa fiche :
        les demandes en attente qui la visaient sont satisfaites.
        """
        from .participant import Beneficiaire

        filtre = (
            {'beneficiaire': personne}
            if isinstance(personne, Beneficiaire)
            else {'participant': personne, 'beneficiaire': None}
        )
        for demande in cls.objects.filter(statut=EN_ATTENTE, **filtre):
            demande._clore(TRAITEE, utilisateur)

    @classmethod
    def en_attente_pour(cls, personne):
        """Une demande attend-elle pour la photo de ``personne`` ?"""
        from .participant import Beneficiaire

        filtre = (
            {'beneficiaire': personne}
            if isinstance(personne, Beneficiaire)
            else {'participant': personne, 'beneficiaire': None}
        )
        return cls.objects.filter(statut=EN_ATTENTE, **filtre).exists()
