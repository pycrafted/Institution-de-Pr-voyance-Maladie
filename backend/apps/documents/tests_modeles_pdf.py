"""
Tests du dépôt des gabarits PDF officiels.

Deux choses à tenir :
  - le dépôt lui-même (/api/modeles-pdf/) est réservé au personnel et refuse
    ce qui n'est pas un des trois gabarits attendus, ou pas un PDF ;
  - un serveur SANS les fichiers sur le disque - le cas d'un hébergeur qui
    reconstruit son conteneur depuis le dépôt à chaque déploiement - imprime
    quand même, en relisant le gabarit déposé en base.
"""

import hashlib
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import ModelePdf
from .modeles import ModeleAbsent, ouvrir_modele

# Le plus petit PDF qu'ouvre PyMuPDF : une page blanche. Les vrais gabarits
# sont hors dépôt (en-tête SAR, cachet) ; ce qu'on vérifie ici, c'est le
# chemin suivi par les octets, pas leur contenu.
PDF_MINIMAL = (
    b'%PDF-1.4\n'
    b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
    b'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n'
    b'trailer<</Root 1 0 R>>\n'
)


class DepotDesGabarits(APITestCase):
    def setUp(self):
        self.agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.agent).key}')

    def _envoyer(self, nom, octets=PDF_MINIMAL, **extra):
        return self.client.put(
            f'/api/modeles-pdf/{nom}/',
            {'fichier': SimpleUploadedFile(nom, octets, content_type='application/pdf'), **extra},
            format='multipart',
        )

    def test_depot_enregistre_le_gabarit(self):
        reponse = self._envoyer('bon_pharmacie.pdf')
        self.assertEqual(reponse.status_code, 200)
        enregistrement = ModelePdf.objects.get(pk='bon_pharmacie.pdf')
        self.assertEqual(bytes(enregistrement.contenu), PDF_MINIMAL)
        self.assertEqual(enregistrement.empreinte, hashlib.sha256(PDF_MINIMAL).hexdigest())
        self.assertEqual(enregistrement.taille, len(PDF_MINIMAL))
        self.assertEqual(enregistrement.depose_par, self.agent)

    def test_second_depot_remplace_sans_doubler(self):
        self._envoyer('bon_pharmacie.pdf')
        autre = PDF_MINIMAL + b'% version suivante\n'
        self.assertEqual(self._envoyer('bon_pharmacie.pdf', autre).status_code, 200)
        self.assertEqual(ModelePdf.objects.filter(pk='bon_pharmacie.pdf').count(), 1)
        self.assertEqual(bytes(ModelePdf.objects.get(pk='bon_pharmacie.pdf').contenu), autre)

    def test_nom_inattendu_refuse(self):
        self.assertEqual(self._envoyer('bulletin_de_paie.pdf').status_code, 400)
        self.assertFalse(ModelePdf.objects.exists())

    def test_ce_qui_n_est_pas_un_pdf_refuse(self):
        self.assertEqual(self._envoyer('bon_pharmacie.pdf', b'GIF89a pas un PDF').status_code, 400)
        self.assertFalse(ModelePdf.objects.exists())

    def test_empreinte_annoncee_verifiee(self):
        reponse = self._envoyer('bon_pharmacie.pdf', empreinte='0' * 64)
        self.assertEqual(reponse.status_code, 400)
        self.assertFalse(ModelePdf.objects.exists())
        # La bonne empreinte passe.
        bonne = hashlib.sha256(PDF_MINIMAL).hexdigest()
        self.assertEqual(self._envoyer('bon_pharmacie.pdf', empreinte=bonne).status_code, 200)

    def test_etat_liste_les_trois_attendus(self):
        self._envoyer('bon_optique.pdf')
        reponse = self.client.get('/api/modeles-pdf/')
        self.assertEqual(reponse.status_code, 200)
        par_nom = {ligne['nom']: ligne for ligne in reponse.data}
        self.assertEqual(
            set(par_nom), {'bon_pharmacie.pdf', 'bon_optique.pdf', 'lettre_garantie.pdf'}
        )
        self.assertEqual(par_nom['bon_optique.pdf']['taille'], len(PDF_MINIMAL))
        self.assertIsNone(par_nom['bon_pharmacie.pdf']['taille'])

    def test_retrait(self):
        self._envoyer('bon_pharmacie.pdf')
        self.assertEqual(self.client.delete('/api/modeles-pdf/bon_pharmacie.pdf/').status_code, 204)
        self.assertFalse(ModelePdf.objects.exists())

    def test_sans_jeton_refuse(self):
        self.client.credentials()
        self.assertEqual(self._envoyer('bon_pharmacie.pdf').status_code, 401)
        self.assertEqual(self.client.get('/api/modeles-pdf/').status_code, 401)

    def test_simple_utilisateur_refuse(self):
        simple = get_user_model().objects.create_user('participant', password='x')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=simple).key}')
        self.assertEqual(self._envoyer('bon_pharmacie.pdf').status_code, 403)


class RepliSurLaBase(APITestCase):
    """Le serveur n'a aucun fichier sur le disque : la base doit suffire."""

    def setUp(self):
        self.vide = Path(tempfile.mkdtemp(prefix='ipm-modeles-vides-'))

    def test_gabarit_en_base_ouvert_quand_le_fichier_manque(self):
        ModelePdf.deposer('bon_pharmacie.pdf', PDF_MINIMAL)
        document = ouvrir_modele(self.vide / 'bon_pharmacie.pdf')
        self.assertEqual(document.page_count, 1)
        document.close()

    def test_gabarit_remplace_en_base_est_relu(self):
        ModelePdf.deposer('bon_pharmacie.pdf', PDF_MINIMAL)
        ouvrir_modele(self.vide / 'bon_pharmacie.pdf').close()
        # Une seconde page : le fichier déplié doit suivre, sans purge manuelle.
        deux_pages = PDF_MINIMAL.replace(
            b'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n',
            b'2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n'
            b'4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n',
        )
        ModelePdf.deposer('bon_pharmacie.pdf', deux_pages)
        document = ouvrir_modele(self.vide / 'bon_pharmacie.pdf')
        self.assertEqual(document.page_count, 2)
        document.close()

    def test_rien_nulle_part_leve_modele_absent(self):
        with self.assertRaises(ModeleAbsent):
            ouvrir_modele(self.vide / 'bon_pharmacie.pdf')

    def test_le_fichier_sur_le_disque_prime_sur_la_base(self):
        sur_disque = self.vide / 'bon_pharmacie.pdf'
        sur_disque.write_bytes(PDF_MINIMAL)
        ModelePdf.deposer('bon_pharmacie.pdf', b'%PDF-1.4\n% jamais lu\n')
        document = ouvrir_modele(sur_disque)
        self.assertEqual(Path(document.name), sur_disque)
        document.close()

    def test_base_injoignable_ne_masque_pas_le_modele_absent(self):
        from django.db import DatabaseError

        with mock.patch.object(
            ModelePdf.objects, 'filter', side_effect=DatabaseError('base coupee')
        ):
            with self.assertRaises(ModeleAbsent):
                ouvrir_modele(self.vide / 'bon_pharmacie.pdf')
