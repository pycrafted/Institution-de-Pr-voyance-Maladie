"""
La photo du titulaire du bon, imprimée sous « Le PARTICIPANT » (bon de
pharmacie, bon d'optique, lettre de garantie) : le pharmacien, l'opticien ou
le prestataire voit qui doit se présenter.

Le titulaire est la personne soignée : le participant lui-même, ou l'ayant
droit pour qui le bon est émis. Sa photo d'identité (celle de la carte
d'adhérent, posée depuis l'application mobile) est recadrée au format photo
d'identité.

**La photo, et rien d'autre** (2026-11-25, à la demande de l'utilisateur).
Trois choses ont été retirées ce jour-là :

  - le cadre noir de 2,2 points, qui pesait plus que la photo sur un document
    qui n'encadre rien d'autre ;
  - la légende « PHOTO DU BÉNÉFICIAIRE » en capitales dessous ;
  - la mention « Photo non enregistrée » affichée à sa place quand il n'y en
    a pas.

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


def _poser_recadree(page, cadre, octets):
    """
    Pose la photo dans le cadre, recadrée au centre au format du cadre (comme
    « object-fit: cover »). La photo est d'abord posée entière sur une page
    intermédiaire à sa taille, puis seule la zone centrale est reportée dans le
    cadre : sûr pour toutes les proportions (le recadrage par Pixmap rendait
    une image vide pour une photo très large, prise en paysage sur iPhone).
    Rend False si l'image ne se lit pas.

    Au passage, ce chemin-là préserve la définition : ce sont les octets
    d'origine qui sont posés sur la page intermédiaire, sans décodage ni
    réencodage.
    """
    image = pymupdf.Pixmap(octets)
    l, h = image.width, image.height
    if not l or not h:
        return False
    if l / h > RATIO:
        nl = h * RATIO
        zone = pymupdf.Rect((l - nl) / 2, 0, (l + nl) / 2, h)
    else:
        nh = l / RATIO
        zone = pymupdf.Rect(0, (h - nh) / 2, l, (h + nh) / 2)
    intermediaire = pymupdf.open()
    feuille = intermediaire.new_page(width=l, height=h)
    feuille.insert_image(feuille.rect, stream=octets, keep_proportion=False)
    page.show_pdf_page(cadre, intermediaire, 0, clip=zone, keep_proportion=False, overlay=True)
    intermediaire.close()
    return True


def poser_photo(page, photo, x, haut, largeur):
    """
    Dessine sur la page la photo du titulaire (coin haut gauche en x, haut ;
    largeur en points). Sans photo lisible, ne dessine rien.
    """
    octets = _octets(photo)
    if not octets:
        return
    cadre = pymupdf.Rect(x, haut, x + largeur, haut + largeur / RATIO)
    try:
        _poser_recadree(page, cadre, octets)
    except Exception:  # noqa: BLE001 - une photo illisible ne doit pas empêcher le bon
        pass
