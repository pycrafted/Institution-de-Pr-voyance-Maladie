"""
Emplacement des modèles PDF officiels (bon de pharmacie, bon d'optique, lettre
de garantie).

Ces fichiers portent l'en-tête SAR et le cachet du gérant : ils restent hors
du dépôt (cf. .gitignore). Par défaut ils vivent ici, dans ``modeles/``, posés
à la main sur le serveur. Quand l'hébergeur ne permet pas d'écrire dans le
code (Render : les « Secret Files » sont déposés sous /etc/secrets), la
variable ``IPM_MODELES_DIR`` désigne le dossier qui les contient.

Trois sources, essayées dans cet ordre :
  1. le fichier posé sur le disque, à l'emplacement attendu ;
  2. ``<nom>.b64``, sa variante texte, pour les hébergeurs dont les fichiers
     de secret ne prennent que du texte ;
  3. la base de données (modèle ``ModelePdf``), pour les hébergeurs dont le
     conteneur est reconstruit depuis le dépôt à chaque déploiement : le
     disque y est vide, la base non.
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


def _depuis_la_base(nom):
    """
    Le gabarit déposé en base (``ModelePdf``), déplié dans le dossier
    temporaire pour que PyMuPDF l'ouvre comme un fichier ordinaire.

    Le nom du fichier déplié porte l'empreinte du contenu : remplacer le
    gabarit change l'empreinte, donc le chemin, et la nouvelle version est
    dépliée d'office - rien à purger.
    """
    # Import différé : ce module est chargé par les modules d'impression, eux
    # mêmes importés au chargement des vues, avant que les applications soient
    # prêtes. Importer les modèles ici éviterait toute circularité.
    from django.db import DatabaseError

    from .models import ModelePdf

    try:
        enregistrement = ModelePdf.objects.filter(pk=nom).only('empreinte').first()
    except DatabaseError:
        # Base injoignable, ou table pas encore migrée : ce n'est pas à la
        # fabrication du PDF de le signaler - ModeleAbsent dira ce qui manque.
        return None
    if enregistrement is None:
        return None

    cible = Path(tempfile.gettempdir()) / 'ipm-modeles' / f'{enregistrement.empreinte}-{nom}'
    if not cible.is_file():
        cible.parent.mkdir(parents=True, exist_ok=True)
        octets = bytes(ModelePdf.objects.values_list('contenu', flat=True).get(pk=nom))
        # Écriture atomique : deux requêtes simultanées peuvent déplier le même
        # gabarit, et PyMuPDF ne doit jamais ouvrir un fichier à moitié écrit.
        provisoire = cible.with_suffix(cible.suffix + f'.{os.getpid()}')
        provisoire.write_bytes(octets)
        os.replace(provisoire, cible)
    return cible


def ouvrir_modele(chemin):
    """Ouvre le PDF modèle ``chemin`` avec PyMuPDF, ou lève ``ModeleAbsent``."""
    chemin = Path(chemin)
    if not chemin.is_file():
        chemin = _depuis_base64(chemin) or _depuis_la_base(chemin.name) or chemin
    if not chemin.is_file():
        raise ModeleAbsent(
            f'Modèle PDF « {chemin.name} » absent du serveur (attendu dans {chemin.parent}, '
            'ou déposé en base dans « Modèles PDF »).'
        )
    return pymupdf.open(chemin)
