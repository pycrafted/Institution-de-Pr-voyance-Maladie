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
    def test_pose_la_photo_recadree(self):
        doc = pymupdf.open()
        page = doc.new_page()
        poser_photo(page, _photo_png(), x=43, haut=632, largeur=132)
        images = page.get_images(full=True)
        self.assertEqual(len(images), 1)
        rect = page.get_image_rects(images[0][0])[0]
        # Au format photo d'identité (3/4), à l'emplacement demandé.
        self.assertAlmostEqual(rect.width / rect.height, 3 / 4, places=1)
        self.assertAlmostEqual(rect.x0, 43, places=1)
        self.assertAlmostEqual(rect.y0, 632, places=1)

    def test_la_photo_est_posee_nue(self):
        """Ni cadre, ni légende, ni trait de signature : la photo, et rien d'autre."""
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
        self.assertEqual(page.get_images(), [])
        self.assertEqual(page.get_text().strip(), '')
