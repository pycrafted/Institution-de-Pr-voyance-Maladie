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

DOSSIER_MODELES = Path(os.getenv('IPM_MODELES_DIR') or Path(__file__).resolve().parent / 'modeles')


def modele(nom):
    """Chemin du modèle ``nom`` (« bon_pharmacie.pdf »…)."""
    return DOSSIER_MODELES / nom
