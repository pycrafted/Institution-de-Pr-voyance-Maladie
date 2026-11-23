"""
Le compte mobile : code d'activation de l'IPM, mot de passe choisi, clés
d'accès (empreinte / Face ID).
"""

from datetime import timedelta
from io import StringIO
from pathlib import Path
import tempfile

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from adherents.models import Adherent
from mobile.authentification import emettre_jeton
from participants.models import CleAcces, Participant

ORIGINE = 'http://localhost:5174'


@override_settings(WEBAUTHN_ORIGINES=[ORIGINE])
class CompteMobileTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.societe = Adherent.objects.create(code='01', libelle='IPM SAR MOO', type='IPM')
        cls.moi = Participant.objects.create(
            matricule='0949', adherent=cls.societe, etat='Actif', nom='MBAYE', prenoms='Moustapha'
        )

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.moi.refresh_from_db()

    def identifier(self, mot_de_passe, matricule='949'):
        return self.client.post(
            '/api/mobile/identification/',
            {'matricule': matricule, 'mot_de_passe': mot_de_passe},
            format='json',
        )

    def activer(self, code, mot_de_passe, matricule='949'):
        return self.client.post(
            '/api/mobile/activation/',
            {'matricule': matricule, 'code': code, 'mot_de_passe': mot_de_passe},
            format='json',
        )

    # --- Plus de matricule ni de « 0000 » comme mot de passe ---------------

    def test_le_matricule_ne_connecte_plus(self):
        self.assertEqual(self.identifier('0949').status_code, 401)
        self.assertEqual(self.identifier('949').status_code, 401)

    def test_un_mot_de_passe_pose_d_office_ne_connecte_pas(self):
        self.moi.definir_mot_de_passe('0000')
        self.moi.save()
        self.assertEqual(self.identifier('0000').status_code, 401)

    # --- Activation ----------------------------------------------------------

    def test_activation_puis_connexion(self):
        code = self.moi.generer_code_activation()
        reponse = self.activer(code, 'Raffinerie-2026')
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertIn('jeton', reponse.data)
        self.assertEqual(self.identifier('Raffinerie-2026').status_code, 200)
        # Le code est brûlé : il ne sert qu'une fois.
        self.assertEqual(self.activer(code, 'Autre-Mot-2026').status_code, 400)

    def test_code_tape_comme_mot_de_passe(self):
        code = self.moi.generer_code_activation()
        reponse = self.identifier(code)
        self.assertEqual(reponse.status_code, 409)
        self.assertTrue(reponse.data['activation'])
        # Pas consommé : l'activation passe ensuite.
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 200)
        # Un code faux reste un simple refus.
        self.assertEqual(self.identifier('000000' if code != '000000' else '111111').status_code, 401)

    def test_code_faux_ou_expire(self):
        code = self.moi.generer_code_activation()
        faux = '000000' if code != '000000' else '111111'
        self.assertEqual(self.activer(faux, 'Raffinerie-2026').status_code, 400)
        Participant.objects.filter(pk=self.moi.pk).update(
            code_activation_expire=timezone.now() - timedelta(minutes=1)
        )
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 400)

    def test_matricule_inconnu_meme_reponse(self):
        reponse = self.activer('123456', 'Raffinerie-2026', matricule='9999')
        self.assertEqual(reponse.status_code, 400)

    def test_regles_du_mot_de_passe(self):
        code = self.moi.generer_code_activation()
        for faible in ('court', '12345678', 'password', '0949'):
            reponse = self.activer(code, faible)
            self.assertEqual(reponse.status_code, 400, faible)
            self.assertIn('mot_de_passe', reponse.data)
        # Le code n'est pas brûlé par un mot de passe refusé.
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 200)

    def test_dossier_inactif(self):
        code = self.moi.generer_code_activation()
        Participant.objects.filter(pk=self.moi.pk).update(etat='Suspendu')
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 403)

    # --- Changement de mot de passe ------------------------------------------

    def test_changer_son_mot_de_passe(self):
        self.moi.choisir_mot_de_passe('Raffinerie-2026')
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {emettre_jeton(self.moi)}')
        url = '/api/mobile/moi/mot-de-passe/'
        mauvais = self.client.post(url, {'ancien': 'faux', 'nouveau': 'Nouveau-2027'}, format='json')
        self.assertEqual(mauvais.status_code, 400)
        bon = self.client.post(
            url, {'ancien': 'Raffinerie-2026', 'nouveau': 'Nouveau-2027'}, format='json'
        )
        self.assertEqual(bon.status_code, 204)
        self.client.credentials()
        self.assertEqual(self.identifier('Nouveau-2027').status_code, 200)
        self.assertEqual(self.identifier('Raffinerie-2026').status_code, 401)

    # --- Code généré par l'IPM -------------------------------------------------

    def test_le_back_office_genere_un_code(self):
        agent = get_user_model().objects.create_user('agent', password='Secret-IPM-2026')
        jeton = Token.objects.create(user=agent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {jeton.key}')
        reponse = self.client.post(f'/api/participants/{self.moi.pk}/code-activation/')
        self.assertEqual(reponse.status_code, 200, getattr(reponse, 'data', None))
        code = reponse.data['code']
        self.assertRegex(code, r'^\d{6}$')
        self.assertEqual(reponse.data['participant']['compteMobile']['statut'], 'code')
        # Gardé chiffré : jamais en clair en base.
        self.moi.refresh_from_db()
        self.assertNotIn(code, self.moi.code_activation)
        self.client.credentials()
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 200)

    def test_un_participant_ne_genere_pas_de_code(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {emettre_jeton(self.moi)}')
        reponse = self.client.post(f'/api/participants/{self.moi.pk}/code-activation/')
        self.assertIn(reponse.status_code, (401, 403))

    def test_commande_codes_activation(self):
        with tempfile.TemporaryDirectory() as dossier:
            fichier = Path(dossier) / 'codes.csv'
            call_command('codes_activation', csv=str(fichier), stdout=StringIO())
            lignes = fichier.read_text(encoding='utf-8-sig').splitlines()
        self.assertEqual(len(lignes), 2)
        code = lignes[1].split(';')[4]
        self.assertEqual(self.activer(code, 'Raffinerie-2026').status_code, 200)

    # --- Clés d'accès : garde-fous (la cryptographie est celle de py_webauthn) --

    def test_options_d_inscription_reservees_et_liees_a_l_origine(self):
        url = '/api/mobile/moi/cles/inscription/options/'
        self.assertIn(self.client.post(url).status_code, (401, 403))
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {emettre_jeton(self.moi)}')
        refuse = self.client.post(url, HTTP_ORIGIN='https://pirate.example')
        self.assertEqual(refuse.status_code, 400)
        reponse = self.client.post(url, HTTP_ORIGIN=ORIGINE)
        self.assertEqual(reponse.status_code, 200)
        options = reponse.data['options']
        self.assertEqual(options['rp']['id'], 'localhost')
        self.assertEqual(options['authenticatorSelection']['residentKey'], 'required')
        self.assertEqual(options['authenticatorSelection']['userVerification'], 'required')
        self.assertTrue(reponse.data['jeton'])

    def test_connexion_avec_une_cle_inconnue_ou_un_defi_falsifie(self):
        options = self.client.post('/api/mobile/cles/connexion/options/', HTTP_ORIGIN=ORIGINE)
        self.assertEqual(options.status_code, 200)
        inconnue = self.client.post(
            '/api/mobile/cles/connexion/',
            {'jeton': options.data['jeton'], 'reponse': {'id': 'inconnue'}},
            format='json',
            HTTP_ORIGIN=ORIGINE,
        )
        self.assertEqual(inconnue.status_code, 401)
        CleAcces.objects.create(participant=self.moi, identifiant='abc', cle_publique=b'x')
        falsifie = self.client.post(
            '/api/mobile/cles/connexion/',
            {'jeton': 'faux', 'reponse': {'id': 'abc'}},
            format='json',
            HTTP_ORIGIN=ORIGINE,
        )
        self.assertEqual(falsifie.status_code, 401)

    def test_lister_et_retirer_ses_cles(self):
        cle = CleAcces.objects.create(
            participant=self.moi, identifiant='abc', cle_publique=b'x', nom='iPhone'
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {emettre_jeton(self.moi)}')
        liste = self.client.get('/api/mobile/moi/cles/')
        self.assertEqual([c['nom'] for c in liste.data], ['iPhone'])
        self.assertEqual(self.client.delete(f'/api/mobile/moi/cles/{cle.pk}/').status_code, 204)
        self.assertFalse(CleAcces.objects.exists())
