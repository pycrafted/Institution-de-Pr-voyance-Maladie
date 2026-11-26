# -*- coding: utf-8 -*-
"""
Les exercices OUVERTS : les années pour lesquelles la base a quelque chose.

Les écrans qui filtrent par exercice - documents, factures, règlements,
remboursements, suspensions, et le tableau de bord - proposaient jusqu'ici une
liste calculée dans le navigateur : « l'année en cours », ou « les huit
dernières ». Les deux mentaient. Après la purge d'octobre il n'y avait plus
qu'une année à montrer ; depuis la reprise du 2026-11-26, la base porte
l'historique réel de LAMPS et remonte à 2018.

Une liste écrite en dur ne peut pas suivre : elle propose des années vides ou
cache des années pleines. Le serveur la calcule donc à partir des DONNÉES, et
l'écran n'a plus qu'à l'afficher.

    GET /api/exercices/  ->  {"exercices": ["2026", "2025", …, "2018"]}

Trois sources, réunies : les documents, les factures et le grand livre.

**Ce qui fait un exercice, et pas seulement une année.** LAMPS porte des
dates saisies à la main qui n'existent pas : l'an 1, l'an 119, l'an 551, et
une poignée de pièces éparpillées de 2000 à 2015 (entre 1 et 99 par an). Les
proposer ferait un sélecteur de vingt-six boutons pour quatre documents. On
ne retient donc que les années qui portent au moins ``VOLUME_MINIMAL``
pièces, puis TOUTES les années depuis la plus ancienne d'entre elles - un
exercice creux au milieu de l'historique reste un exercice.

Le seuil ne tranche rien d'ambigu : l'activité réelle commence en 2016 avec
1 594 pièces, quand 2015 en compte 5. N'importe quelle valeur entre 100 et
1 500 donne la même réponse.
"""

from datetime import date

from django.db.models import Count
from django.db.models.functions import ExtractYear
from rest_framework.response import Response
from rest_framework.views import APIView

# En deçà, c'est une faute de saisie, pas une année d'activité (cf. en-tête).
VOLUME_MINIMAL = 100


class ExercicesView(APIView):
    """Les années que la base porte réellement, la plus récente d'abord."""

    def get(self, request):
        from documents.models import BonOptique, BonPharmacie, LettreGarantie
        from documents.models.lettre_hospitalisation import LettreHospitalisation
        from traitements.models import EcritureCompta, Facture

        from collections import Counter

        volumes = Counter()
        for modele, champ in (
            (BonPharmacie, 'date'),
            (LettreGarantie, 'date'),
            (LettreHospitalisation, 'date'),
            (BonOptique, 'date'),
            (Facture, 'date_facture'),
            (EcritureCompta, 'date_compta'),
        ):
            volumes.update(
                dict(
                    modele.objects.annotate(an=ExtractYear(champ))
                    .values('an')
                    .annotate(n=Count('pk'))
                    .values_list('an', 'n')
                )
            )

        courant = date.today().year
        pleines = [
            an
            for an, n in volumes.items()
            if an and 2000 <= an <= courant + 1 and n >= VOLUME_MINIMAL
        ]
        # De la plus ancienne année pleine jusqu'à aujourd'hui, sans trou :
        # une année creuse au milieu de l'historique reste un exercice, et la
        # voir manquer dans la liste ferait croire à une perte de données.
        premiere = min(pleines) if pleines else courant
        return Response({'exercices': [str(a) for a in range(courant, premiere - 1, -1)]})
