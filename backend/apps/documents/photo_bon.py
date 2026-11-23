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


def _poser_recadree(page, cadre, octets):
    """
    Pose la photo dans le cadre, recadrée au centre au format du cadre (comme
    « object-fit: cover »). La photo est d'abord posée entière sur une page
    intermédiaire à sa taille, puis seule la zone centrale est reportée dans le
    cadre : sûr pour toutes les proportions (le recadrage par Pixmap rendait
    une image vide pour une photo très large, prise en paysage sur iPhone).
    Rend False si l'image ne se lit pas.
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

    posee = False
    octets = _octets(photo)
    if octets:
        try:
            posee = _poser_recadree(page, interieur, octets)
        except Exception:  # noqa: BLE001 - une photo illisible ne doit pas empêcher le bon
            posee = False
    if not posee:
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
