"""
Plan comptable général - la table `plancompta` de LAMPS.

Trois choses apprises de l'original, et qui expliquent la forme de ce modèle.

**1. La table porte sa propre hiérarchie.** Sur les 462 lignes de LAMPS, 385
seulement sont de vrais comptes à six chiffres : les autres sont les étages du
plan SYSCOHADA - une classe (« 7 »), 23 niveaux (« 27 », « 60 »…) et 47
sous-comptes (« 400 », « 521 », « 602 »…). D'où le champ ``code`` de longueur
variable, et la propriété :attr:`est_un_compte` : l'écran Plan Comptable ne
liste que ce qui dépasse trois caractères, exactement comme les vues internes
de LAMPS (``length(compte) > 3``).

**2. Chez LAMPS, le plan comptable EST le référentiel.** Six « tables » de
l'application - spécialités, prestations, adhérents, participants-adhérents,
banques, cotisations - ne sont que des **vues filtrées** de `plancompta`
(``souscpte LIKE '400%'``, ``'602%'``, ``'463%'``…). Créer une spécialité,
c'est y créer un compte ; en supprimer un, c'est supprimer la spécialité.
Notre application les tient dans des tables distinctes, chacune portant son
``compte`` : c'est un meilleur modèle, mais il faut savoir qu'un compte 400xxx
ou 463xxx est **cité ailleurs**, et ne pas le laisser retirer en silence.

**3. Le solde ne se range pas ici.** `plancompta` n'a pas de colonne de solde :
celui qu'affiche l'écran se calcule sur les écritures. On fait de même (cf.
la vue du plan comptable), sur nos 396 873 écritures reprises.
"""

from django.db import models

from .base import Referentiel

# Les six segments de l'écran. « Autres » est la valeur par défaut de LAMPS,
# ce qui explique qu'elle rassemble 196 comptes sur 462 - dont les 400xxx des
# prestataires et les 463xxx des adhérents, créés par d'autres écrans qui n'y
# touchent pas. Ce n'est pas un classement comptable, c'est un reste.
TYPE_AUTRES = 'Autres'
TYPES_COMPTE = [
    ('Actifs', 'Actifs'),
    (TYPE_AUTRES, 'Autres'),
    ('Charges', 'Charges'),
    ('Passifs', 'Passifs'),
    ('Produits', 'Produits'),
]


class CompteComptable(Referentiel):
    """Une ligne du plan comptable : un numéro, un intitulé, un type."""

    # Jusqu'à dix caractères comme dans l'original, mais un vrai compte en
    # fait six - ce que le formulaire rappelle (« minimum 6 caractères »).
    code = models.CharField('Compte général', max_length=10, unique=True)
    type_compte = models.CharField(
        'Type de compte', max_length=10, choices=TYPES_COMPTE, default=TYPE_AUTRES,
    )
    # Les deux étages du plan au-dessus du compte. Ils se déduisent presque
    # toujours du numéro (« 271000 » → 27, 271), mais pas toujours : six
    # comptes de LAMPS y dérogent. On les reprend donc tels quels plutôt que
    # de les recalculer.
    niveau = models.CharField('Niveau', max_length=2, blank=True)
    sous_compte = models.CharField('Sous compte', max_length=3, blank=True)
    classe = models.CharField('Classe', max_length=1, blank=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Compte comptable'
        verbose_name_plural = 'Plan comptable'

    def __str__(self):
        return f'{self.code} - {self.libelle}'

    @property
    def est_un_compte(self):
        """
        Vrai pour un compte où l'on écrit, faux pour un étage du plan.

        La règle est celle de LAMPS : au-delà de trois caractères. Les classes
        (« 7 »), les niveaux (« 27 ») et les sous-comptes (« 400 ») servent à
        ranger, pas à mouvementer.
        """
        return len(self.code or '') > 3

    def save(self, *args, **kwargs):
        # Un compte saisi sans ses étages les déduit de son numéro : c'est le
        # cas général, et personne ne devrait avoir à les retaper.
        if self.code:
            self.classe = self.classe or self.code[:1]
            self.niveau = self.niveau or self.code[:2]
            self.sous_compte = self.sous_compte or self.code[:3]
        super().save(*args, **kwargs)
