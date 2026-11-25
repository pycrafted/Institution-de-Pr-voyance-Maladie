"""
Le fond de l'application : un mur d'hexagones discret. Deux versions, une
par mode (clair, sombre), dans les couleurs de l'application.

Écrit src/theme/fonds/*.svg ; la feuille src/theme/fond.css les pose sous le
contenu de chaque écran.

Usage : python scripts/fond-hexagones.py
"""

import math
import pathlib

DOSSIER = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'theme' / 'fonds'

# Couleur du trait du mur, par mode.
MODES = {
    'clair': 'rgba(229,38,33,0.075)',
    'sombre': 'rgba(255,96,84,0.085)',
}


def hexagone(cx, cy, r):
    """Sommets d'un hexagone à pointe en haut."""
    return [
        (cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90)))
        for i in range(6)
    ]


def chemin(points, decimales=2):
    return 'M' + ' L'.join(f'{x:.{decimales}f} {y:.{decimales}f}' for x, y in points) + ' Z'


def pavage(trait):
    """Tuile répétable d'hexagones à pointe en haut (rayon 28 px)."""
    r = 28
    l = math.sqrt(3) * r
    h = 3 * r
    formes = [hexagone(l / 2, r, r), hexagone(0, r * 2.5, r), hexagone(l, r * 2.5, r)]
    corps = ''.join(f'<path d="{chemin(f)}"/>' for f in formes)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{l:.2f}" height="{h}" '
        f'viewBox="0 0 {l:.2f} {h}"><g fill="none" stroke="{trait}" stroke-width="1">'
        f'{corps}</g></svg>'
    )


def main():
    DOSSIER.mkdir(parents=True, exist_ok=True)
    for mode, trait_pavage in MODES.items():
        (DOSSIER / f'hexagones-{mode}.svg').write_text(pavage(trait_pavage), encoding='utf-8')
    for f in sorted(DOSSIER.glob('*.svg')):
        print(f.name, f.stat().st_size, 'octets')


if __name__ == '__main__':
    main()
