"""
Filtre par exercice, pour les listes qui portent un historique.

Les référentiels tiennent quelques dizaines de fiches : on les envoie en
entier, et le navigateur fait le reste. Les **documents** et les **factures**,
eux, s'accumulent - 66 429 bons de pharmacie et 24 668 factures repris de
LAMPS. Tout envoyer, c'était 36 Mo et près d'une minute par affichage, le
temps d'immobiliser un fil du serveur et de bloquer toutes les autres pages.

L'application d'origine ne fait pas autrement : **chacun de ses écrans de
liste commence par un sélecteur « Exercice »** (factures, règlements, ordres
de paiement, suspensions, journal central). On ne consulte jamais dix ans de
bons d'un coup ; on travaille sur l'année en cours, et on remonte au besoin.

Le filtre ne s'applique qu'à la **liste** et à l'**écoute de fond** : ouvrir,
modifier ou imprimer une fiche d'un autre exercice reste possible, sans quoi
un lien vers un vieux bon se solderait par un 404.
"""

from datetime import date

from django.db.models import Count
from django.db.models.functions import ExtractYear
from rest_framework.decorators import action
from rest_framework.response import Response

# Valeur à passer pour voir tout l'historique, au prix de l'attente.
TOUS = 'tous'


class FiltreExerciceMixin:
    """
    Ajoute ``?exercice=2026`` à la liste, et l'action ``exercices``.

    Le ViewSet déclare la colonne de date qui porte l'exercice :

        class BonPharmacieViewSet(FiltreExerciceMixin, ReferentielViewSet):
            champ_exercice = 'date'
    """

    champ_exercice = 'date'

    def exercice_demande(self):
        """L'exercice demandé, l'année en cours à défaut, None pour « tous »."""
        demande = ''
        if getattr(self, 'request', None) is not None:
            demande = (self.request.query_params.get('exercice') or '').strip()
        if demande.lower() == TOUS:
            return None
        if demande.isdigit():
            return int(demande)
        return date.today().year

    def filtrer_sur_exercice(self, queryset):
        exercice = self.exercice_demande()
        if exercice is None:
            return queryset
        return queryset.filter(**{'%s__year' % self.champ_exercice: exercice})

    def get_queryset(self):
        queryset = super().get_queryset()
        # Seulement la liste et l'écoute : une fiche se retrouve par son
        # identifiant quel que soit son exercice.
        if getattr(self, 'action', None) in ('list', 'etat'):
            return self.filtrer_sur_exercice(queryset)
        return queryset

    @action(detail=False, methods=['get'])
    def exercices(self, request):
        """
        Les exercices disponibles et leur volume, pour peupler le sélecteur :
        ``[{"exercice": 2026, "nombre": 5936}, …]``, du plus récent au plus
        ancien. L'année en cours y figure toujours, même sans aucune fiche -
        c'est celle qu'on ouvre par défaut, et une liste vide est une réponse
        valable.
        """
        # `super().get_queryset()` : le filtre de la liste n'a rien à faire ici.
        base = super().get_queryset().select_related(None).order_by()
        comptes = (
            base.annotate(an=ExtractYear(self.champ_exercice))
            .values('an')
            .annotate(nombre=Count('pk'))
            .order_by('-an')
        )
        resultat = [
            {'exercice': ligne['an'], 'nombre': ligne['nombre']}
            for ligne in comptes
            if ligne['an']
        ]
        if not any(ligne['exercice'] == date.today().year for ligne in resultat):
            resultat.insert(0, {'exercice': date.today().year, 'nombre': 0})
        return Response(resultat)
