# -*- coding: utf-8 -*-
"""
« Cloture Mensuelle » - la première entrée du menu « Gestion » du Journal
Central de LAMPS (capture 72).

CE QUE C'EST
------------
Le Journal Central de LAMPS affiche, sous son titre, la ligne

    Mois Comptable: OCTOBRE 2019 (ouvert)

Cet état vient de la table **`params`**, qui ne tient pas un historique mais
**une seule ligne par périmètre** (IPM / MSS) : la période en cours.

    | numparam | période                  | structure | perim | ouvert |
    | param3   | 2026-09-01 → 2026-09-30  | IPM SAR   | IPM   | oui    |
    | param4   | 2019-01-01 → 2019-01-31  | MSS       | MSS   | oui    |

« Cloture Mensuelle » **avance `datedeb`/`datefin` d'un mois** sur la ligne du
périmètre. Il n'y a ni pile de périodes closes, ni écriture produite : la
clôture mensuelle de LAMPS est un simple curseur qui avance.

Le drapeau `close_def` (clôture définitive) existe dans `params` mais vaut
`false` partout dans la base réelle : il n'a jamais servi. On le porte quand
même, pour que la table dise la même chose que l'originale.

À NE PAS CONFONDRE AVEC L'AUTRE ENTRÉE
--------------------------------------
« Nouvel exercice » (cf. report_a_nouveau.py) est tout autre chose : il produit
le journal RAN, les à-nouveaux de l'exercice suivant. Le mois avance souvent,
l'exercice une fois l'an.
"""

from datetime import date

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import PERIMETRES, MoisComptable, fin_de_mois, mois_suivant


def periode_courante(perimetre='IPM'):
    """
    La période du périmètre, créée au mois en cours si elle n'existe pas encore
    - LAMPS a toujours une ligne, jamais zéro.
    """
    aujourdhui = date.today()
    periode, _ = MoisComptable.objects.get_or_create(
        perimetre=perimetre,
        defaults={
            'structure': 'IPM SAR' if perimetre == 'IPM' else 'MSS',
            'date_debut': aujourdhui.replace(day=1),
            'date_fin': fin_de_mois(aujourdhui),
        },
    )
    return periode


def _representer(periode):
    return {
        'perimetre': periode.perimetre,
        'structure': periode.structure,
        'dateDebut': periode.date_debut,
        'dateFin': periode.date_fin,
        'ouvert': periode.ouvert,
        'closeDef': periode.close_def,
        'libelle': periode.libelle,
        'annee': periode.date_debut.year,
        'mois': periode.date_debut.month,
    }


class MoisComptableViewSet(viewsets.ViewSet):
    """
    Le mois comptable ouvert, et son avancement d'un mois.

    Ce n'est pas un `ModelViewSet` : on ne crée ni ne supprime de période, il
    n'en existe qu'une par périmètre et elle avance. C'est le comportement de
    `params`, pas celui d'un référentiel.
    """

    def _perimetre(self, request):
        demande = (
            request.query_params.get('perimetre') or request.data.get('perimetre') or 'IPM'
        ).upper()
        return demande if demande in dict(PERIMETRES) else 'IPM'

    def list(self, request):
        """La période en cours : ce qu'affiche l'en-tête du Journal Central."""
        return Response(_representer(periode_courante(self._perimetre(request))))

    @action(detail=False, methods=['post'])
    def cloturer(self, request):
        """
        Clôture le mois : la période avance d'un mois. Comme LAMPS, rien n'est
        écrit en comptabilité et aucune pièce n'est produite.
        """
        with transaction.atomic():
            periode = MoisComptable.objects.select_for_update().filter(
                perimetre=self._perimetre(request),
            ).first() or periode_courante(self._perimetre(request))

            if periode.close_def:
                return Response(
                    {'detail': 'Période close définitivement : elle ne peut plus avancer.'},
                    status=status.HTTP_409_CONFLICT,
                )

            precedent = periode.libelle
            periode.date_debut = mois_suivant(periode.date_debut)
            periode.date_fin = fin_de_mois(periode.date_debut)
            periode.ouvert = True
            periode.save(update_fields=['date_debut', 'date_fin', 'ouvert'])

        return Response({
            **_representer(periode),
            'precedent': precedent,
            'message': f'{precedent} clôturé. Mois comptable ouvert : {periode.libelle}.',
        })
