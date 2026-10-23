# -*- coding: utf-8 -*-
"""
Quelles natures de prestation une spécialité de prestataire couvre vraiment.

Un cardiologue ne fait pas d'échographie, un biologiste ne fait que des
analyses : proposer les 63 natures du référentiel pour chaque prestataire
oblige l'employé à chercher la sienne dans une liste qui, pour lui, est
fausse aux neuf dixièmes.

Le classement ne sort PAS d'une idée de ce qui va ensemble : il sort des
**41 487 lettres de garantie réelles de LAMPS** (`documents_ipm`, typedoc
LGI et LHI, de 2000 à 2026, base d'analyse ``lamps_analyse``), croisées avec
la spécialité du prestataire de chaque lettre (``fournisseurs.codespe``).
Pour chaque spécialité on garde les natures qui couvrent **99 %** de ses
lettres, de la plus fréquente à la moins fréquente. Exemple : spécialité 11
CARDIOLOGUES, 616 lettres, natures 11 CONSULTATION CARDIOLOGIE (98,1 %),
35 SOINS CARDIOLOGIE, 00 VISITE.

Ce n'est pas une règle de gestion : rien n'est interdit. Les natures restantes
suivent, sous « Autres natures », et une spécialité sans historique (OPTIQUE
MEDICALE, PSYCHIATRES…) garde la liste entière. On range la liste, on ne
retire rien.

Le fichier ``data/natures_par_specialite.json`` est la trace de ce relevé ;
il se régénère par ``python manage.py relever_natures_par_specialite``
quand la base d'analyse est là.
"""

import json
from functools import lru_cache
from pathlib import Path

FICHIER = Path(__file__).resolve().parent / 'data' / 'natures_par_specialite.json'


@lru_cache(maxsize=1)
def releve():
    """
    {code spécialité: [codes de nature, du plus fréquent au moins fréquent]}.

    Lu une fois par processus : c'est un relevé figé, pas une donnée vivante.
    Absent ou illisible, on rend un relevé vide - l'écran retombe alors sur
    la liste entière, qui est le comportement d'avant.
    """
    try:
        with open(FICHIER, encoding='utf-8-sig') as flux:
            lignes = json.load(flux)
    except (OSError, ValueError):
        return {}
    return {ligne['specialite']: list(ligne['natures']) for ligne in lignes}


def ordonner(natures, code_specialite):
    """
    Les natures rangées pour cette spécialité : les courantes d'abord, dans
    l'ordre du relevé, puis les autres dans leur ordre d'origine.

    Rend la liste de couples ``(nature, courante)`` - l'écran s'en sert pour
    séparer les deux groupes. Sans spécialité, ou sans relevé pour elle,
    tout est « courant » : il n'y a rien à mettre en avant.
    """
    courantes = releve().get((code_specialite or '').strip(), [])
    if not courantes:
        return [(nature, True) for nature in natures]
    rang = {code: position for position, code in enumerate(courantes)}
    devant = sorted((n for n in natures if n.code in rang), key=lambda n: rang[n.code])
    derriere = [n for n in natures if n.code not in rang]
    return [(n, True) for n in devant] + [(n, False) for n in derriere]
