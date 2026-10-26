"""
Emplacement des modèles PDF officiels (bon de pharmacie, bon d'optique, lettre
de garantie).

Ces fichiers portent l'en-tête SAR et le cachet du gérant : ils restent hors
du dépôt (cf. .gitignore). Par défaut ils vivent ici, dans ``modeles/``, posés
à la main sur le serveur. Quand l'hébergeur ne permet pas d'écrire dans le
code (Render : les « Secret Files » sont déposés sous /etc/secrets), la
variable ``IPM_MODELES_DIR`` désigne le dossier qui les contient.
"""

import os
from pathlib import Path

import pymupdf
from rest_framework import status
from rest_framework.exceptions import APIException

DOSSIER_MODELES = Path(os.getenv('IPM_MODELES_DIR') or Path(__file__).resolve().parent / 'modeles')


def modele(nom):
    """Chemin du modèle ``nom`` (« bon_pharmacie.pdf »…)."""
    return DOSSIER_MODELES / nom


class ModeleAbsent(APIException):
    """
    Le modèle officiel n'est pas sur le serveur : l'impression est impossible,
    mais ce n'est ni une erreur du client ni un bogue - c'est une pièce à
    déposer (cf. deploy/CLOUD.md, « Secret Files »). 503 plutôt que 500, avec
    le nom du fichier attendu, pour qu'on sache quoi faire en lisant la réponse.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'modele_absent'


def ouvrir_modele(chemin):
    """Ouvre le PDF modèle ``chemin`` avec PyMuPDF, ou lève ``ModeleAbsent``."""
    chemin = Path(chemin)
    if not chemin.is_file():
        raise ModeleAbsent(
            f'Modèle PDF « {chemin.name} » absent du serveur (attendu dans {chemin.parent}).'
        )
    return pymupdf.open(chemin)
