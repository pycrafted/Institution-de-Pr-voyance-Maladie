"""
Tests des données de base.

Pour l'instant, la localisation des structures (latitude, longitude) : c'est
elle que l'application mobile donne au téléphone pour guider l'employé
jusqu'à la structure (bouton « S'y rendre » de l'écran « Conventionnés »).
Elle se saisit dans la fiche du fournisseur de soins, à l'IPM.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .management.commands.geolocaliser_structures import dans_la_ville, distance_km, ressemblance
from .models import DemandeAgrement, FournisseurDeSoins, Specialite
from .models.fournisseur_de_soins import CODE_FOURNISSEURS_DIVERS

URL = '/api/donnees-de-base/fournisseurs-de-soins/'


class LocalisationDesStructures(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Seedée par la migration LAMPS : on la réutilise.
        cls.cliniques, _ = Specialite.objects.get_or_create(code='08', defaults={'libelle': 'CLINIQUES'})

    def setUp(self):
        agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=agent).key}')

    def creer(self, **champs):
        corps = {'libelle': 'CLINIQUE DU CAP', 'specialite': '08', **champs}
        return self.client.post(URL, corps, format='json')

    def test_enregistre_la_position_et_la_rend_en_nombres(self):
        reponse = self.creer(latitude='14.669700', longitude='-17.437500')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(reponse.data['latitude'], 14.6697)
        self.assertEqual(reponse.data['longitude'], -17.4375)
        fiche = FournisseurDeSoins.objects.get(pk=reponse.data['id'])
        self.assertEqual(fiche.latitude, Decimal('14.669700'))

    def test_accepte_la_virgule_et_arrondit_a_six_decimales(self):
        # Clavier français, et un point copié d'une carte avec huit décimales.
        reponse = self.creer(latitude='14,66970012', longitude=-17.43749987)
        self.assertEqual(reponse.status_code, 201, reponse.data)
        fiche = FournisseurDeSoins.objects.get(pk=reponse.data['id'])
        self.assertEqual(fiche.latitude, Decimal('14.669700'))
        self.assertEqual(fiche.longitude, Decimal('-17.437500'))

    def test_sans_position_la_case_reste_vide(self):
        reponse = self.creer(latitude='', longitude='')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        # Vide et non « null » : le formulaire l'affiche tel quel.
        self.assertEqual(reponse.data['latitude'], '')
        self.assertIsNone(FournisseurDeSoins.objects.get(pk=reponse.data['id']).latitude)

    def test_refuse_une_valeur_qui_n_est_pas_une_coordonnee(self):
        for champ, valeur in (
            ('latitude', 'nord'),
            ('latitude', '91'),
            ('longitude', '-180.5'),
            ('latitude', 'NaN'),
        ):
            with self.subTest(champ=champ, valeur=valeur):
                autre = 'longitude' if champ == 'latitude' else 'latitude'
                reponse = self.creer(**{champ: valeur, autre: '10'})
                self.assertEqual(reponse.status_code, 400)
                self.assertIn(champ, reponse.data)

    def test_latitude_et_longitude_vont_ensemble(self):
        reponse = self.creer(latitude='14.6697')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('longitude', reponse.data)

    def test_modification_partielle_de_la_seule_latitude(self):
        # La fiche a déjà une position : n'envoyer que la latitude la corrige,
        # sans exiger de renvoyer la longitude.
        fiche = self.creer(latitude='14.6', longitude='-17.4').data
        reponse = self.client.patch(f"{URL}{fiche['id']}/", {'latitude': '14.7'}, format='json')
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertEqual(reponse.data['latitude'], 14.7)

    def test_la_demande_d_agrement_transmet_sa_position(self):
        # La position fait partie de la fiche commune : une demande validée la
        # recopie sur le fournisseur qu'elle fait naître.
        self.assertIn('latitude', DemandeAgrement.CHAMPS_FICHE)
        self.assertIn('longitude', DemandeAgrement.CHAMPS_FICHE)


class ReglesDeGeolocalisation(SimpleTestCase):
    """
    Les deux preuves exigées par la commande geolocaliser_structures avant
    d'écrire une position (sans réseau : seules les règles sont vérifiées).
    """

    def test_le_nom_doit_vraiment_concorder(self):
        self.assertEqual(ressemblance('CLINIQUE DE LA MADELEINE', 'Clinique de la Madeleine'), 1.0)
        self.assertEqual(ressemblance('HOPITAL FANN', 'Hôpital de Fann'), 1.0)
        # Deux établissements différents qui ne partagent que des mots génériques.
        self.assertLess(ressemblance('PHARMACIE DU PLATEAU', 'Pharmacie Gallieni'), 0.6)
        self.assertLess(
            ressemblance('CENTRE D’IMAGERIE MEDICALE DE DAKAR', "Centre d'imagerie médicale de Mermoz"), 0.6
        )
        # Rien de distinctif d'un côté : aucune preuve.
        self.assertEqual(ressemblance('CABINET DENTAIRE ALMADIES', 'Cabinet Dentaire'), 0.0)

    def test_la_distance_entre_deux_points(self):
        madeleine = {'lat': '14.6597309', 'lon': '-17.4383376'}
        dantec = {'lat': '14.6572465', 'lon': '-17.4366635'}
        self.assertAlmostEqual(distance_km(madeleine, dantec), 0.33, places=2)

    def test_la_ville_de_l_adresse(self):
        dakar = {'lat': '14.66', 'lon': '-17.44'}
        linguere = {'lat': '15.37', 'lon': '-13.13'}
        self.assertTrue(dans_la_ville(dakar, 'GRAND YOFF - DAKAR'))
        # L'homonyme à 450 km de Dakar.
        self.assertFalse(dans_la_ville(linguere, 'GRAND YOFF - DAKAR'))
        # Adresse sans ville connue : pas de contrainte.
        self.assertTrue(dans_la_ville(linguere, 'QUARTIER ESCALE'))


class SuppressionRefusee(APITestCase):
    """
    Une fiche de référentiel ne se supprime pas : elle se désactive.

    La règle vaut pour l'API elle-même, et pas seulement pour l'écran - un
    appel direct doit se heurter au même refus (cf. ReferentielViewSet.destroy).
    """

    def setUp(self):
        agent = get_user_model().objects.create_user(username='agent.suppression', password='x')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=agent).key}')
        self.specialite = Specialite.objects.create(code='90', libelle='ESSAI', compte='400090')

    def test_delete_refuse(self):
        reponse = self.client.delete(f'/api/donnees-de-base/specialites/{self.specialite.pk}/')
        self.assertEqual(reponse.status_code, 405)
        self.assertIn('désactivez-la', reponse.data['detail'])
        self.assertTrue(Specialite.objects.filter(pk=self.specialite.pk).exists())

    def test_desactivation_reste_possible(self):
        reponse = self.client.post(
            f'/api/donnees-de-base/specialites/{self.specialite.pk}/basculer-activation/'
        )
        self.assertEqual(reponse.status_code, 200)
        self.specialite.refresh_from_db()
        self.assertFalse(self.specialite.actif)


class NumerotationDesPrestataires(APITestCase):
    """
    Les numéros suivent l'application d'origine : quatre chiffres, zéros de
    tête compris (« 0001 », « 0817 »). Fournisseurs et demandes d'agrément
    partagent la série, un numéro donné ne resert jamais.
    """

    def test_le_prochain_numero_est_sur_quatre_chiffres(self):
        FournisseurDeSoins.objects.create(code='0007', libelle='CLINIQUE ESSAI')
        self.assertEqual(FournisseurDeSoins.prochain_code(), '0008')

    def test_la_serie_ignore_le_fourre_tout(self):
        # « 9999 » est le prestataire fourre-tout de l'origine, posé par une
        # migration : il se tient hors de la série, sans quoi le numéro suivant
        # serait 10000.
        self.assertTrue(FournisseurDeSoins.objects.filter(code=CODE_FOURNISSEURS_DIVERS).exists())
        FournisseurDeSoins.objects.create(code='0012', libelle='LABO ESSAI')
        self.assertEqual(FournisseurDeSoins.prochain_code(), '0013')

    def test_le_compte_du_prestataire_existe_et_suit_la_demande(self):
        # L'origine crédite le compte du fournisseur à la comptabilisation :
        # la fiche le porte, et une demande validée le transmet.
        self.assertIn('compte', DemandeAgrement.CHAMPS_FICHE)
        fournisseur = FournisseurDeSoins.objects.create(
            code='0020', libelle='CABINET ESSAI', compte='400008'
        )
        self.assertEqual(fournisseur.compte, '400008')
