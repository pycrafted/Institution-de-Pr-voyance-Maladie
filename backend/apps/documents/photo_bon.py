"""
La photo du titulaire du bon, imprimée sous « Le PARTICIPANT » (bon de
pharmacie et bon d'optique) : le pharmacien ou l'opticien voit qui doit se
présenter.

Le titulaire est la personne soignée : le participant lui-même, ou l'ayant
droit pour qui le bon est émis. Sa photo d'identité (celle de la carte
d'adhérent, posée depuis l'application mobile) est recadrée pour remplir un
cadre noir au format photo d'identité, avec sa légende dessous. Sans photo,
le cadre reste, avec la mention « Photo non enregistrée ».
"""

import base64
import binascii

import pymupdf

# Format d'une photo d'identité (largeur / hauteur).
RATIO = 3 / 4
EPAISSEUR_CADRE = 2.2


def _octets(photo):
    """Les octets de l'image d'une URL de données (« data:image/jpeg;base64,… »)."""
    if not photo:
        return None
    _, _, donnees = photo.partition('base64,')
    try:
        return base64.b64decode(donnees or photo, validate=False)
    except (binascii.Error, ValueError):
        return None


def legende(beneficiaire=None):
    """
    La légende sous la photo : la même pour tous les bons, qu'ils soient émis
    pour l'employé ou pour un ayant droit - le bénéficiaire, c'est la
    personne couverte par le bon (le terme de l'IPM).
    """
    return 'PHOTO DU BÉNÉFICIAIRE'


def poser_photo(page, photo, texte_legende, x, haut, largeur):
    """
    Dessine sur la page le cadre de la photo (coin haut gauche en x, haut ;
    largeur en points), la photo recadrée dedans, et la légende dessous.
    """
    hauteur = largeur / RATIO
    cadre = pymupdf.Rect(x, haut, x + largeur, haut + hauteur)
    interieur = cadre + (
        EPAISSEUR_CADRE / 2,
        EPAISSEUR_CADRE / 2,
        -EPAISSEUR_CADRE / 2,
        -EPAISSEUR_CADRE / 2,
    )

    image = None
    octets = _octets(photo)
    if octets:
        try:
            image = pymupdf.Pixmap(octets)
        except (RuntimeError, ValueError):
            image = None
    if image is not None:
        # Recadrage au centre au format du cadre (comme « object-fit: cover »).
        l, h = image.width, image.height
        if l / h > RATIO:
            nl = round(h * RATIO)
            zone = pymupdf.IRect((l - nl) // 2, 0, (l - nl) // 2 + nl, h)
        else:
            nh = round(l / RATIO)
            zone = pymupdf.IRect(0, (h - nh) // 2, l, (h - nh) // 2 + nh)
        recadree = pymupdf.Pixmap(image, zone.width, zone.height, zone)
        page.insert_image(interieur, pixmap=recadree, keep_proportion=False, overlay=True)
    else:
        milieu = (interieur.y0 + interieur.y1) / 2
        page.insert_textbox(
            pymupdf.Rect(interieur.x0, milieu - 6, interieur.x1, milieu + 10),
            'Photo non enregistrée',
            fontname='helv',
            fontsize=8,
            color=(0.45, 0.45, 0.45),
            align=pymupdf.TEXT_ALIGN_CENTER,
        )

    page.draw_rect(cadre, color=(0, 0, 0), width=EPAISSEUR_CADRE, overlay=True)
    page.insert_text(
        (x, cadre.y1 + 11),
        texte_legende,
        fontname='hebo',
        fontsize=7,
        color=(0, 0, 0),
    )
