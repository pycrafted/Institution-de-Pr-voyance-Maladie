"""
Emplacement des modèles PDF officiels (bon de pharmacie, bon d'optique, lettre
de garantie).

Ces fichiers portent l'en-tête SAR et le cachet du gérant : ils restent hors
du dépôt (cf. .gitignore). Par défaut ils vivent ici, dans ``modeles/``, posés
à la main sur le serveur. Quand l'hébergeur ne permet pas d'écrire dans le
code (Render : les « Secret Files » sont déposés sous /etc/secrets), la
variable ``IPM_MODELES_DIR`` désigne le dossier qui les contient.
"""

import base64
import os
import tempfile
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


def _depuis_base64(chemin):
    """
    Variante texte du modèle : ``<nom>.b64`` à côté de l'emplacement attendu.

    Les « Secret Files » de Render ne prennent que du texte ; un PDF y est donc
    déposé encodé en base64. Décodé une fois dans le dossier temporaire, puis
    réutilisé : le fichier décodé survit tant que le processus tourne.
    """
    source = chemin.with_name(chemin.name + '.b64')
    if not source.is_file():
        return None
    cible = Path(tempfile.gettempdir()) / 'ipm-modeles' / chemin.name
    if not cible.is_file() or cible.stat().st_mtime < source.stat().st_mtime:
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_bytes(base64.b64decode(source.read_text()))
    return cible


def ouvrir_modele(chemin):
    """Ouvre le PDF modèle ``chemin`` avec PyMuPDF, ou lève ``ModeleAbsent``."""
    chemin = Path(chemin)
    if not chemin.is_file():
        chemin = _depuis_base64(chemin) or chemin
    if not chemin.is_file():
        raise ModeleAbsent(
            f'Modèle PDF « {chemin.name} » absent du serveur (attendu dans {chemin.parent}).'
        )
    return pymupdf.open(chemin)
