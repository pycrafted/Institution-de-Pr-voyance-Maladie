"""
Tests des documents côté IPM.

Pour l'instant, l'action ``etat`` du socle des référentiels : c'est elle que
l'écran interroge toutes les trois secondes pour savoir si son tableau a
vieilli (cf. src/views/donnees-de-base/ecouteChangements.js). Un bon émis
depuis le mobile doit s'y voir sans que personne ne rafraîchisse la page, donc
ses deux valeurs doivent bouger à chaque création, modification et suppression.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire
from participants.models import Participant

from .models import BonPharmacie

URL = '/api/bons-pharmacie/etat/'


class EtatBonsPharmacie(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.societe = Adherent.objects.create(code='01', libelle='Cadres SAR')
        cls.type_participant, _ = TypeBeneficiaire.objects.get_or_create(
            code='1', defaults={'libelle': 'PARTICIPANT'}
        )
        cls.participant = Participant.objects.create(
            matricule='1204', nom='NDIAYE', prenoms='Moustapha', adherent=cls.societe,
            date_naissance=date(1962, 1, 1), etat='Actif',
        )
        specialite, _ = Specialite.objects.get_or_create(
            code='06', defaults={'libelle': 'PHARMACIES'}
        )
        cls.pharmacie = FournisseurDeSoins.objects.create(
            code='101', libelle='PHARMACIE DU PLATEAU', specialite=specialite,
        )

    def setUp(self):
        agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=agent).key}')

    def _bon(self, code):
        return BonPharmacie.objects.create(
            code=code, adherent=self.societe, participant=self.participant,
            type_benef=self.type_participant, pharmacie=self.pharmacie,
            nb_articles=2, date_ordonnance=date.today(),
        )

    def _etat(self):
        reponse = self.client.get(URL)
        self.assertEqual(reponse.status_code, 200)
        return reponse.data

    def test_jeu_vide(self):
        # Aucun bon : l'écoute doit quand même obtenir un état, sans quoi elle
        # s'arrêterait sur une liste qui ne fait que commencer.
        self.assertEqual(self._etat(), {'nombre': 0, 'dernier_changement': None})

    def test_creation_fait_bouger_les_deux_valeurs(self):
        avant = self._etat()
        self._bon('BPI000001')
        apres = self._etat()
        self.assertEqual(apres['nombre'], avant['nombre'] + 1)
        self.assertNotEqual(apres['dernier_changement'], avant['dernier_changement'])

    def test_modification_fait_bouger_la_date_a_nombre_egal(self):
        bon = self._bon('BPI000001')
        avant = self._etat()
        bon.nb_articles = 5
        bon.save()
        apres = self._etat()
        self.assertEqual(apres['nombre'], avant['nombre'])
        self.assertGreater(apres['dernier_changement'], avant['dernier_changement'])

    def test_suppression_fait_baisser_le_nombre(self):
        # Le cas que la seule date ne verrait pas : supprimer la fiche la plus
        # récente ramène « dernier_changement » à une valeur ANTÉRIEURE. C'est
        # pourquoi l'écoute compare les deux valeurs, et non la seule date.
        ancien = self._bon('BPI000001')
        BonPharmacie.objects.filter(pk=ancien.pk).update(
            modifie_le=ancien.modifie_le - timedelta(days=1)
        )
        recent = self._bon('BPI000002')
        avant = self._etat()
        recent.delete()
        apres = self._etat()
        self.assertEqual(apres['nombre'], avant['nombre'] - 1)
        self.assertLess(apres['dernier_changement'], avant['dernier_changement'])

    def test_desactivation_compte_comme_un_changement(self):
        # Un bon annulé reste dans la liste, mais sa ligne change d'aspect :
        # l'écran doit donc le recharger.
        bon = self._bon('BPI000001')
        avant = self._etat()
        reponse = self.client.post(f'/api/bons-pharmacie/{bon.pk}/basculer-activation/')
        self.assertEqual(reponse.status_code, 200)
        self.assertGreater(self._etat()['dernier_changement'], avant['dernier_changement'])

    def test_sans_jeton_refuse(self):
        # L'état dit combien de bons existent : c'est déjà une information sur
        # les assurés, elle exige la même authentification que la liste.
        self.client.credentials()
        self.assertEqual(self.client.get(URL).status_code, 401)

    def test_disponible_sur_les_quatre_documents(self):
        for chemin in ('bons-pharmacie', 'lettres-garantie', 'bons-optique', 'lg-hospitalisation'):
            with self.subTest(chemin=chemin):
                reponse = self.client.get(f'/api/{chemin}/etat/')
                self.assertEqual(reponse.status_code, 200)
                self.assertIn('nombre', reponse.data)
                self.assertIn('dernier_changement', reponse.data)
