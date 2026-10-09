"""
Tests des paramètres.

Le barème de prise en charge est ce qui décide, facture par facture, de la
part de l'IPM et de celle du participant. Les tests portent donc sur ce qui le
rend fiable : il reste entier, ses valeurs tiennent dans leurs bornes, et une
exception ne se pose pas sur un dossier clos.
"""

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire, TypePrestation
from participants.models import Participant

from .models import TauxExceptionnel, TauxPriseEnCharge

URL = '/api/taux-prise-en-charge/'
URL_EXC = '/api/taux-exceptionnels/'


class BaseTaux(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.societe = Adherent.objects.create(
            code='01', libelle='IPM SAR PERSONNEL MOO', type='IPM'
        )
        # get_or_create : ces natures sont désormais seedées par la migration
        # qui aligne les données de base sur LAMPS - on les réutilise au lieu de
        # les recréer (sinon, doublon de code).
        cls.optique, _ = TypePrestation.objects.get_or_create(
            code='04', defaults={'libelle': 'OPTIQUE', 'compte': '602004'}
        )
        cls.pharmacie, _ = TypePrestation.objects.get_or_create(
            code='06', defaults={'libelle': 'PHARMACIE', 'compte': '602006'}
        )
        cls.participant_type = TypeBeneficiaire.objects.create(code='1', libelle='PARTICIPANT')
        cls.enfant = TypeBeneficiaire.objects.create(code='3', libelle='ENFANT')
        cls.actif = Participant.objects.create(
            matricule='0949', adherent=cls.societe, etat='Actif', nom='MBAYE', prenoms='Moustapha'
        )
        cls.radie = Participant.objects.create(
            matricule='1261', adherent=cls.societe, etat='Radié', nom='LO', prenoms='Coumba'
        )

    def setUp(self):
        agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=agent).key}')

    def creer(self, **champs):
        corps = {
            'codeSoc': '01',
            'prestation': '04',
            'typeBenef': '1',
            'taux': 100,
            'plafond': 250000,
            'forfait': 0,
            **champs,
        }
        return self.client.post(URL, corps, format='json')


class LeBaremeResteEntier(BaseTaux):
    """
    Une combinaison absente du barème n'est pas « zéro » : c'est un trou que
    personne ne voit le jour où la facture se présente.
    """

    def test_la_suppression_est_refusee(self):
        cree = self.creer()
        self.assertEqual(cree.status_code, 201, cree.data)
        reponse = self.client.delete(f'{URL}{cree.data["id"]}/')
        self.assertEqual(reponse.status_code, 405)
        self.assertIn('ne se supprime pas', reponse.data['detail'])
        self.assertEqual(TauxPriseEnCharge.objects.count(), 1)

    def test_un_taux_qui_ne_s_applique_plus_se_met_a_zero(self):
        cree = self.creer()
        reponse = self.client.patch(f'{URL}{cree.data["id"]}/', {'taux': 0}, format='json')
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertEqual(reponse.data['taux'], 0)

    def test_une_seule_ligne_par_societe_prestation_et_qualite(self):
        self.assertEqual(self.creer().status_code, 201)
        doublon = self.creer()
        self.assertEqual(doublon.status_code, 400)


class BornesDuTaux(BaseTaux):
    def test_refuse_au_dessus_de_cent(self):
        reponse = self.creer(taux=120)
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('taux', reponse.data)

    def test_refuse_un_taux_negatif(self):
        self.assertEqual(self.creer(taux=-10).status_code, 400)

    def test_accepte_les_bornes(self):
        self.assertEqual(self.creer(taux=0).status_code, 201)
        self.assertEqual(self.creer(prestation='06', taux=100).status_code, 201)


class LeCompteVientDeLaPrestation(BaseTaux):
    def test_le_compte_est_celui_de_la_nature_et_ne_se_saisit_pas(self):
        reponse = self.creer(compte='999999')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(reponse.data['compte'], '602004')


class TauxExceptionnelSurDossierEnCours(BaseTaux):
    """Une exception accordée à un dossier clos ne s'appliquerait jamais."""

    def creer_exception(self, matricule, **champs):
        return self.client.post(
            URL_EXC,
            {'matriculePart': matricule, 'prestation': '04', 'taux': 100, **champs},
            format='json',
        )

    def test_accepte_un_dossier_en_cours(self):
        reponse = self.creer_exception('0949')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(reponse.data['codeSoc'], '01')
        self.assertEqual(reponse.data['beneficiaire'], 'Moustapha MBAYE')

    def test_refuse_un_dossier_radie(self):
        reponse = self.creer_exception('1261')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('matriculePart', reponse.data)

    def test_refuse_un_dossier_resilie(self):
        self.radie.etat = 'Résilié'
        self.radie.save(update_fields=['etat'])
        self.assertEqual(self.creer_exception('1261').status_code, 400)

    def test_une_seule_exception_par_participant_et_nature(self):
        self.assertEqual(self.creer_exception('0949').status_code, 201)
        self.assertEqual(self.creer_exception('0949').status_code, 400)

    def test_une_exception_se_retire(self):
        # Contrairement au barème, elle ne laisse aucun trou : la personne
        # revient simplement au taux de sa société.
        cree = self.creer_exception('0949')
        self.assertEqual(self.client.delete(f'{URL_EXC}{cree.data["id"]}/').status_code, 204)
        self.assertEqual(TauxExceptionnel.objects.count(), 0)
