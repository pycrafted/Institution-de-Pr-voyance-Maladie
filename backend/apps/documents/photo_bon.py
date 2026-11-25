"""
La photo du titulaire du bon, imprimée sous « Le PARTICIPANT » (bon de
pharmacie et bon d'optique) : le pharmacien ou l'opticien voit qui doit se
présenter.

Le titulaire est la personne soignée : le participant lui-même, ou l'ayant
droit pour qui le bon est émis. Sa photo d'identité (celle de la carte
d'adhérent, posée depuis l'application mobile) est recadrée au format photo
d'identité.

**La photo, et rien d'autre** (2026-11-25, à la demande de l'utilisateur).
Trois choses ont été retirées ce jour-là, dans cet ordre :

  - le cadre noir de 2,2 points, qui pesait plus que la photo sur un document
    qui n'encadre rien d'autre ;
  - la légende « PHOTO DU BÉNÉFICIAIRE » en capitales dessous ;
  - le trait de signature posé à sa droite, et la mention « Photo non
    enregistrée » affichée à sa place quand il n'y en a pas.

Sans photo, donc, l'emplacement reste VIDE : rien n'est dessiné.
"""

import base64
import binascii

import pymupdf

# Format d'une photo d'identité (largeur / hauteur).
RATIO = 3 / 4


def _octets(photo):
    """Les octets de l'image d'une URL de données (« data:image/jpeg;base64,… »)."""
    if not photo:
        return None
    _, _, donnees = photo.partition('base64,')
    try:
        return base64.b64decode(donnees or photo, validate=False)
    except (binascii.Error, ValueError):
        return None


def poser_photo(page, photo, x, haut, largeur):
    """
    Dessine sur la page la photo du titulaire (coin haut gauche en x, haut ;
    largeur en points). Sans photo lisible, ne dessine rien.
    """
    octets = _octets(photo)
    if not octets:
        return
    try:
        image = pymupdf.Pixmap(octets)
    except (RuntimeError, ValueError):
        return

    # Recadrage au centre au format photo d'identité (comme « object-fit:
    # cover »). Le découpage se fait à la définition de la source, sans
    # redimensionner : ce qui est inséré dans le PDF a tous les pixels de la
    # photo enregistrée, et PyMuPDF les y écrit sans perte.
    l, h = image.width, image.height
    if l / h > RATIO:
        nl = round(h * RATIO)
        zone = pymupdf.IRect((l - nl) // 2, 0, (l - nl) // 2 + nl, h)
    else:
        nh = round(l / RATIO)
        zone = pymupdf.IRect(0, (h - nh) // 2, l, (h - nh) // 2 + nh)
    recadree = pymupdf.Pixmap(image, zone.width, zone.height, zone)

    cadre = pymupdf.Rect(x, haut, x + largeur, haut + largeur / RATIO)
    page.insert_image(cadre, pixmap=recadree, keep_proportion=False, overlay=True)
