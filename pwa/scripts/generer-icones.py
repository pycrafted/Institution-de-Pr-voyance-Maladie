"""
Génère les icônes d'application et les écrans de lancement iOS d'IPM Mobile
À PARTIR DU LOGO SAR (public/logo-sar.png), conformément à SPEC_DESIGN.

Rien n'est dessiné à la main : le logo officiel est détouré, recoloré en
blanc, puis posé sur les deux surfaces de marque de la charte —
    icônes           dégradé rouge   #E52621 → #B3160F (150°)
    écrans de lancement  dégradé de marque #1D1D1B → #33302C (160°)
Ce sont exactement les valeurs de --deg-rouge et --deg-marque
(src/theme/variables.css) ; l'écran de lancement d'iOS et le composant
Splash.tsx se ressemblent donc au pixel près, sans saut de couleur.

À relancer seulement si le logo ou la charte changent : les PNG produits sont
versionnés.

    python -m pip install pillow
    python scripts/generer-icones.py
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / 'public'
LOGO = PUBLIC / 'logo-sar.png'
ICONES = PUBLIC / 'icons'
LANCEMENT = PUBLIC / 'splash'

# Les deux dégradés de la charte (SPEC_DESIGN §2), en (angle CSS, haut, bas).
DEG_ROUGE = (150, (0xE5, 0x26, 0x21), (0xB3, 0x16, 0x0F))
DEG_MARQUE = (160, (0x1D, 0x1D, 0x1B), (0x33, 0x30, 0x2C))
BLANC = (255, 255, 255)
# Fond des écrans de lancement : le rose pâle de l'application, logo rouge
# dessus (cf. FOND_LANCEMENT dans src/components/Splash.tsx).
FOND_LANCEMENT = (0xEC, 0xE4, 0xE3)

# Rayon de l'icône « any », en proportion du côté : celui d'iOS/Android.
RAYON_ICONE = 112 / 512

# Le logo est allongé : on le dimensionne par sa LARGEUR, en proportion du
# côté de l'icône ou de la largeur de l'écran de lancement. 0.42 reprend le
# 42cqw de src/components/Splash.css.
PART_ICONE = 0.62
PART_LANCEMENT = 0.42

# Le dégradé est calculé à basse définition puis agrandi : un dégradé n'a pas
# de détail, l'interpolation ne se voit pas, et le calcul reste instantané en
# Python pur (pas de numpy à installer derrière le pare-feu).
DEFINITION_DEGRADE = 128

# Écrans de lancement iOS (portrait) : largeur, hauteur en pixels, et la
# taille CSS + densité de l'appareil, qui servent à la media query de
# index.html. Les iPhone courants, du SE au 16 Pro Max.
ECRANS_IOS = [
    (1320, 2868, 440, 956, 3),  # 16 Pro Max
    (1206, 2622, 402, 874, 3),  # 16 Pro
    (1290, 2796, 430, 932, 3),  # 14 Pro Max, 15 Plus/Pro Max, 16 Plus
    (1179, 2556, 393, 852, 3),  # 14 Pro, 15, 15 Pro, 16
    (1284, 2778, 428, 926, 3),  # 12/13 Pro Max, 14 Plus
    (1170, 2532, 390, 844, 3),  # 12, 13, 14
    (1080, 2340, 360, 780, 3),  # 12 mini, 13 mini
    (1125, 2436, 375, 812, 3),  # X, XS, 11 Pro
    (1242, 2688, 414, 896, 3),  # XS Max, 11 Pro Max
    (828, 1792, 414, 896, 2),  # XR, 11
    (1242, 2208, 414, 736, 3),  # 6/7/8 Plus
    (750, 1334, 375, 667, 2),  # SE 2e/3e génération, 6/7/8
]


def degrade(largeur, hauteur, reglage):
    """Dégradé linéaire aux conventions CSS (0° vers le haut, sens horaire)."""
    import math

    angle, depart, arrivee = reglage
    radians = math.radians(angle)
    # Vecteur de la ligne de dégradé, repère écran (y vers le bas).
    dx, dy = math.sin(radians), -math.cos(radians)
    # Petite image calculée point par point, puis agrandie.
    echelle = DEFINITION_DEGRADE / max(largeur, hauteur)
    petite_l = max(2, round(largeur * echelle))
    petite_h = max(2, round(hauteur * echelle))
    longueur = abs(petite_l * dx) + abs(petite_h * dy)
    image = Image.new('RGB', (petite_l, petite_h))
    points = image.load()
    for y in range(petite_h):
        for x in range(petite_l):
            projection = ((x - petite_l / 2) * dx + (y - petite_h / 2) * dy) / longueur + 0.5
            t = min(1.0, max(0.0, projection))
            points[x, y] = tuple(round(d + (a - d) * t) for d, a in zip(depart, arrivee))
    return image.resize((largeur, hauteur), Image.BICUBIC)


def logo_blanc():
    """Le logo SAR détouré et recoloré en blanc, transparence conservée."""
    image = Image.open(LOGO).convert('RGBA')
    boite = image.getbbox()
    if boite:
        image = image.crop(boite)
    alpha = image.getchannel('A')
    blanc = Image.new('RGBA', image.size, BLANC + (255,))
    blanc.putalpha(alpha)
    return blanc


def logo_rouge():
    """Le logo SAR tel quel, rouge, détouré : la marque ne s'inverse pas."""
    image = Image.open(LOGO).convert('RGBA')
    boite = image.getbbox()
    return image.crop(boite) if boite else image


def poser_logo(fond, logo, part, decalage_y=0.0):
    """Colle le logo, centré, à `part` de la largeur du fond."""
    largeur = round(fond.width * part)
    hauteur = max(1, round(logo.height * largeur / logo.width))
    reduit = logo.resize((largeur, hauteur), Image.LANCZOS)
    x = (fond.width - largeur) // 2
    y = round((fond.height - hauteur) / 2 + decalage_y)
    fond.paste(reduit, (x, y), reduit)
    return fond


def icone(taille, arrondi=True, part=PART_ICONE):
    """
    Icône carrée sur le dégradé rouge de la marque.

    ``arrondi`` : coins de l'icône « any » ; sinon fond plein bord à bord
    (maskable et Apple, qui posent eux-mêmes leurs coins).
    ``part`` plus petite pour la zone sûre des icônes maskable.
    """
    fond = degrade(taille, taille, DEG_ROUGE).convert('RGBA')
    if arrondi:
        masque = Image.new('L', (taille, taille), 0)
        ImageDraw.Draw(masque).rounded_rectangle(
            [0, 0, taille - 1, taille - 1], radius=round(taille * RAYON_ICONE), fill=255
        )
        fond.putalpha(masque)
    return poser_logo(fond, logo_blanc(), part)


def lancement(largeur, hauteur):
    """
    Écran de lancement : fond #ECE4E3, logo rouge centré puis remonté d'un
    vingtième de la hauteur — mêmes cotes que src/components/Splash.css, pour
    que le relais entre l'image d'iOS et l'application ne saute pas.
    """
    fond = Image.new('RGBA', (largeur, hauteur), FOND_LANCEMENT + (255,))
    return poser_logo(fond, logo_rouge(), PART_LANCEMENT, -hauteur / 20).convert('RGB')


def main():
    # Les icônes sont désormais faites par scripts/engendrer-icones.mjs (logo
    # rouge sur fond clair) : « --lancement-seul » ne refait que les écrans de
    # lancement, sans écraser ces icônes.
    if '--lancement-seul' in sys.argv:
        ecrans_lancement()
        return
    ICONES.mkdir(parents=True, exist_ok=True)
    LANCEMENT.mkdir(parents=True, exist_ok=True)
    icone(192).save(ICONES / 'icone-192.png', optimize=True)
    icone(512).save(ICONES / 'icone-512.png', optimize=True)
    # Maskable : Android découpe jusqu'à 20 % du bord ; le logo tient dans 80 %.
    icone(512, arrondi=False, part=PART_ICONE * 0.8).save(
        ICONES / 'icone-maskable-512.png', optimize=True
    )
    # Apple : fond plein, iOS pose lui-même ses coins arrondis (pas de transparence).
    icone(180, arrondi=False).convert('RGB').save(ICONES / 'apple-touch-icon.png', optimize=True)
    icone(32).save(ICONES / 'favicon-32.png', optimize=True)
    icone(48).save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    ecrans_lancement()
    # Balises à recopier dans index.html si la liste des écrans change.
    for largeur, hauteur, css_l, css_h, densite in ECRANS_IOS:
        print(
            f'<link rel="apple-touch-startup-image" href="/splash/lancement-{largeur}x{hauteur}.png" '
            f'media="(device-width: {css_l}px) and (device-height: {css_h}px) and '
            f'(-webkit-device-pixel-ratio: {densite}) and (orientation: portrait)" />'
        )


def ecrans_lancement():
    LANCEMENT.mkdir(parents=True, exist_ok=True)
    for largeur, hauteur, *_ in ECRANS_IOS:
        lancement(largeur, hauteur).save(
            LANCEMENT / f'lancement-{largeur}x{hauteur}.png', optimize=True
        )


if __name__ == '__main__':
    main()
