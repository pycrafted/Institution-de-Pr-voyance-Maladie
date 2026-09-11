"""
Socle commun à tous les référentiels.

Côté frontend, un seul composant affiche tous les référentiels parce qu'ils
partagent la même mécanique : « une liste de codes que l'on consulte, complète
et désactive » (cf. src/views/donnees-de-base/config.js). On reflète ce choix
ici : un modèle abstrait porte le code, le libellé et l'activation ; chaque
référentiel concret n'ajoute que ce qui lui est propre.
"""

from django.db import models


class Referentiel(models.Model):
    """Base abstraite de tout référentiel de données de base."""

    code = models.CharField('Code', max_length=20)
    libelle = models.CharField('Libellé', max_length=255)

    # On ne supprime jamais une entrée : les dossiers déjà saisis continuent de
    # référencer ce code. On la désactive — même règle que le frontend.
    actif = models.BooleanField('Actif', default=True)

    cree_le = models.DateTimeField('Créé le', auto_now_add=True)
    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        abstract = True
        ordering = ['code']

    def __str__(self):
        return f'{self.code} — {self.libelle}'


class ReferentielAvecCompte(Referentiel):
    """
    Référentiel dont chaque entrée porte un compte comptable — le cas des
    prestations, spécialités et articles d'achat, qui ne diffèrent que par la
    longueur de leur code et le préfixe du compte.
    """

    compte = models.CharField('Compte', max_length=6)

    class Meta(Referentiel.Meta):
        abstract = True
