"""
Tampon « EXPIRÉ » sur un document imprimé.

Un bon ou une lettre dont la validité est passée se consulte encore depuis
le mobile, mais ne doit plus pouvoir être présenté : chaque page de son PDF
reçoit, en plein milieu, un grand tampon rouge à double cadre - comme un
cachet « EXPIRÉ ». Il est posé par le serveur, dans le fichier même : un PDF
téléchargé ou imprimé le porte.
"""

import pymupdf

ROUGE = (0.86, 0.12, 0.10)
TEXTE = 'EXPIRÉ'


def tamponner_expire(contenu):
    """Le même PDF (octets), avec le tampon « EXPIRÉ » au centre de chaque page."""
    doc = pymupdf.open(stream=contenu, filetype='pdf')
    police = pymupdf.Font('hebo')  # Helvetica gras, intégrée aux PDF.
    for page in doc:
        largeur_page, hauteur_page = page.rect.width, page.rect.height
        taille = largeur_page * 0.11
        largeur_texte = police.text_length(TEXTE, fontsize=taille)
        marge = taille * 0.55
        cadre = pymupdf.Rect(0, 0, largeur_texte + 2 * marge, taille * 1.9)
        cadre += (
            (largeur_page - cadre.width) / 2,
            hauteur_page * 0.42 - cadre.height / 2,
            (largeur_page - cadre.width) / 2,
            hauteur_page * 0.42 - cadre.height / 2,
        )
        # Fond blanc translucide : le texte du bon reste lisible en dessous,
        # le tampon ne se confond pas avec lui.
        page.draw_rect(cadre, color=None, fill=(1, 1, 1), fill_opacity=0.55, overlay=True)
        # Double cadre arrondi, comme un cachet.
        page.draw_rect(cadre, color=ROUGE, width=taille * 0.07, radius=0.12, overlay=True)
        interieur = pymupdf.Rect(cadre.x0, cadre.y0, cadre.x1, cadre.y1)
        retrait = taille * 0.2
        interieur.x0 += retrait
        interieur.y0 += retrait
        interieur.x1 -= retrait
        interieur.y1 -= retrait
        page.draw_rect(interieur, color=ROUGE, width=taille * 0.03, radius=0.1, overlay=True)
        ecrit = pymupdf.TextWriter(page.rect, color=ROUGE)
        ecrit.append(
            (cadre.x0 + marge, cadre.y0 + cadre.height / 2 + taille * 0.36),
            TEXTE,
            font=police,
            fontsize=taille,
        )
        ecrit.write_text(page, overlay=True)
    resultat = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return resultat
