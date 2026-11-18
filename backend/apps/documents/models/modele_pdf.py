"""
Modèle PDF officiel déposé en base.

Les gabarits (bon de pharmacie, bon d'optique, lettre de garantie) portent
l'en-tête SAR et le cachet du gérant. Ils ne sont donc jamais dans le dépôt
(cf. .gitignore) : on les pose à la main sur le serveur, dans
``apps/documents/modeles/``.

Cela marche tant que le serveur a un disque qui lui survit. Ce n'est pas le
cas d'un hébergeur qui reconstruit le conteneur depuis le dépôt à chaque
déploiement : le dossier y est vide, et l'impression répond 503. Monter un
disque persistant règle le symptôme mais ajoute une pièce d'infrastructure à
provisionner, à sauvegarder et à refaire sur chaque environnement.

La base, elle, est déjà là, déjà persistante et déjà sauvegardée. Le gabarit
y est donc déposé une fois, puis relu par ``modeles.ouvrir_modele`` quand le
fichier manque sur le disque. L'ordre reste : le fichier posé à la main
d'abord (le serveur de l'IPM, où il est au plus près), puis la variante
base64, puis la base.
"""

import hashlib

from django.conf import settings
from django.db import models


class ModelePdf(models.Model):
    """Un gabarit PDF officiel, rangé par son nom de fichier."""

    # Le nom de fichier attendu par le code d'impression : « bon_pharmacie.pdf »,
    # « bon_optique.pdf », « lettre_garantie.pdf ». C'est la clé : un seul
    # gabarit courant par document.
    nom = models.CharField('Nom du fichier', max_length=64, primary_key=True)
    contenu = models.BinaryField('Contenu du PDF')
    # sha256 du contenu. Sert de nom au fichier déplié dans le dossier
    # temporaire : un gabarit remplacé change d'empreinte, donc de chemin, et
    # se redéplie de lui-même sans qu'on ait à invalider quoi que ce soit.
    empreinte = models.CharField('Empreinte (sha256)', max_length=64)
    taille = models.PositiveIntegerField('Taille (octets)')

    depose_le = models.DateTimeField('Déposé le', auto_now=True)
    depose_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+', verbose_name='Déposé par',
    )

    class Meta:
        verbose_name = 'Modèle PDF'
        verbose_name_plural = 'Modèles PDF'
        ordering = ('nom',)

    def __str__(self):
        return f'{self.nom} ({self.taille} octets)'

    @classmethod
    def deposer(cls, nom, octets, par=None):
        """Dépose (ou remplace) le gabarit ``nom``. Renvoie l'enregistrement."""
        enregistrement, _ = cls.objects.update_or_create(
            nom=nom,
            defaults={
                'contenu': octets,
                'empreinte': hashlib.sha256(octets).hexdigest(),
                'taille': len(octets),
                'depose_par': par,
            },
        )
        return enregistrement
