"""La photo du titulaire, imprimée sur les bons (photo_bon)."""

import base64

import pymupdf
from django.test import SimpleTestCase

from documents.photo_bon import poser_photo


def _photo_png(largeur=60, hauteur=40):
    """Une petite image PNG en URL de données, plus large que haute (à recadrer)."""
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, largeur, hauteur), False)
    pix.set_rect(pix.irect, (200, 30, 30))
    return 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode()


class PhotoBonTests(SimpleTestCase):
    def _couleur_au_centre_du_cadre(self, page):
        # Le cadre : x 43..175, haut 632, largeur 132 -> hauteur 176.
        pix = page.get_pixmap(clip=pymupdf.Rect(100, 710, 120, 730))
        return pix.pixel(pix.width // 2, pix.height // 2)

    def test_pose_la_photo_recadree(self):
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, _photo_png(), x=43, haut=632, largeur=132)
        # La photo (rouge) remplit le cadre.
        self.assertEqual(self._couleur_au_centre_du_cadre(page)[:3], (200, 30, 30))

    def test_photo_tres_large_comme_sur_iphone(self):
        # 320 x 136 : la photo d'un participant prise en paysage sur iPhone, que
        # l'ancien recadrage rendait vide (PDF en erreur 500).
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, _photo_png(320, 136), x=43, haut=632, largeur=132)
        self.assertEqual(self._couleur_au_centre_du_cadre(page)[:3], (200, 30, 30))

    def test_photo_tres_haute(self):
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, _photo_png(60, 400), x=43, haut=632, largeur=132)
        self.assertEqual(self._couleur_au_centre_du_cadre(page)[:3], (200, 30, 30))

    def test_la_photo_est_posee_nue(self):
        """Ni cadre, ni légende : la photo, et rien d'autre."""
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, _photo_png(), x=43, haut=632, largeur=132)
        self.assertEqual(page.get_text().strip(), '')
        self.assertEqual(page.get_drawings(), [])

    def test_sans_photo_rien_n_est_dessine(self):
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, '', x=43, haut=632, largeur=132)
        self.assertEqual(page.get_images(), [])
        self.assertEqual(page.get_text().strip(), '')
        self.assertEqual(page.get_drawings(), [])

    def test_photo_illisible_comme_sans_photo(self):
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, 'data:image/png;base64,pas-une-image', x=43, haut=632, largeur=132)
        self.assertEqual(page.get_text().strip(), '')
