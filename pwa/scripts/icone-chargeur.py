"""
Icônes d'application d'IPM Mobile dessinées à partir du chargeur
(src/components/Chargeur.tsx) : quatre points à traîne, #5f5553, sur le fond
de l'application #f8f1f0.

Pourquoi : Android affiche l'icône du manifeste sur son écran de démarrage,
puis l'application montre son chargeur. Avec cette icône, on ne voit qu'un
seul chargeur du lancement à l'accueil.

Usage : python scripts/icone-chargeur.py   (Pillow requis)
"""
import math
import pathlib

from PIL import Image, ImageDraw

ICONES = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'icons'
FOND = (0xF8, 0xF1, 0xF0)
COULEUR = (0x5F, 0x55, 0x53)
TRAINE_OPACITE = 0.45
SUR = 4  # suréchantillonnage, pour des bords lisses

# Géométrie du chargeur, dans son viewBox 40 x 40 (cf. Chargeur.tsx).
CENTRE, RAYON, POINT, TRAINE = 20, 14, 2.4, 55


def melange(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def dessiner(cote, part):
    """Le chargeur occupe `part` du côté de l'icône, centré."""
    n = cote * SUR
    im = Image.new('RGB', (n, n), FOND)
    d = ImageDraw.Draw(im)
    echelle = n * part / 40
    cx = cy = n / 2
    r = RAYON * echelle
    trait = max(2, round(n * 0.012))
    couleur_traine = melange(FOND, COULEUR, TRAINE_OPACITE)
    for tete in (45, 135, 225, 315):
        # PIL : 0° à droite, sens horaire ; le chargeur : 0° en haut.
        debut, fin = tete - TRAINE - 90, tete - 90
        # PIL trace l'épaisseur vers l'intérieur : on élargit la boîte de
        # moitié, pour que le milieu du trait tombe sur le cercle.
        e = r + trait / 2
        boite = (cx - e, cy - e, cx + e, cy + e)
        d.arc(boite, debut, fin, fill=couleur_traine, width=trait)
        for angle in (debut,):  # bouts arrondis de la traîne
            a = math.radians(angle)
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            d.ellipse((x - trait / 2, y - trait / 2, x + trait / 2, y + trait / 2), fill=couleur_traine)
        a = math.radians(fin)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        p = POINT * echelle
        d.ellipse((x - p, y - p, x + p, y + p), fill=COULEUR)
    return im.resize((cote, cote), Image.LANCZOS)


def main():
    # « any » : le chargeur bien visible ; « maskable » : dans la zone sûre
    # (cercle de 80 %) que les lanceurs Android découpent.
    dessiner(192, 0.62).save(ICONES / 'icone-192.png', optimize=True)
    dessiner(512, 0.62).save(ICONES / 'icone-512.png', optimize=True)
    dessiner(512, 0.5).save(ICONES / 'icone-maskable-512.png', optimize=True)
    print('icônes écrites dans', ICONES)


if __name__ == '__main__':
    main()
