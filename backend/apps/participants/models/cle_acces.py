"""
Clés d'accès (« passkeys ») de l'application mobile : la connexion par
empreinte digitale ou Face ID.

Le téléphone garde une clé privée qui ne le quitte jamais ; le serveur n'en
garde que la clé PUBLIQUE, qui sert à vérifier les signatures. Rien ici ne
permet donc de se connecter à la place de l'employé, même en lisant la base.
Une clé par appareil : l'employé peut en avoir plusieurs, et les retirer.
"""

from django.db import models

from .participant import Participant


class CleAcces(models.Model):
    participant = models.ForeignKey(
        Participant, on_delete=models.CASCADE, related_name='cles_acces', verbose_name='Participant'
    )
    # Identifiant de la clé donné par le téléphone (base64url).
    identifiant = models.CharField('Identifiant', max_length=512, unique=True)
    cle_publique = models.BinaryField('Clé publique')
    # Compteur de signatures : un compteur qui recule trahit une clé copiée.
    compteur = models.PositiveBigIntegerField('Compteur', default=0)
    # Comment le téléphone joint la clé (« internal », « hybrid »…).
    transports = models.JSONField('Transports', default=list, blank=True)
    # Ce que l'employé voit dans son profil (« iPhone », « Android »…).
    nom = models.CharField('Appareil', max_length=80, blank=True)
    cree_le = models.DateTimeField('Créée le', auto_now_add=True)
    utilisee_le = models.DateTimeField('Dernière utilisation', null=True, blank=True)

    class Meta:
        ordering = ['-cree_le']
        verbose_name = 'Clé d’accès'
        verbose_name_plural = 'Clés d’accès'

    def __str__(self):
        return f'{self.participant} - {self.nom or self.identifiant[:12]}'
