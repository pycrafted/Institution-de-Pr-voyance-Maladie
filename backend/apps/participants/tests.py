"""
Tests des participants et de leurs bénéficiaires.

Ils portent sur ce que l'écran seul ne peut pas garantir : la forme du
matricule, le régime qui distingue un retraité d'un salarié en activité,
l'accord entre l'état d'un dossier et celui de son contrat, et la composition
du matricule d'un bénéficiaire.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire

from .models import Beneficiaire, Participant

URL = '/api/participants/'
URL_FAMILLES = '/api/beneficiaires/'


class BaseParticipants(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.moo = Adherent.objects.create(code='01', libelle='IPM SAR PERSONNEL MOO', type='IPM')
        cls.cmm = Adherent.objects.create(code='03', libelle='CMM CR-SAR', type='MSS')
        cls.epouse = TypeBeneficiaire.objects.create(code='2', libelle='EPOUSE')
        cls.epoux = TypeBeneficiaire.objects.create(code='4', libelle='EPOUX')
        cls.enfant = TypeBeneficiaire.objects.create(code='3', libelle='ENFANT')

    def setUp(self):
        agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=agent).key}')

    def fiche(self, **champs):
        """Une fiche complète ; chaque test ne change que ce qui l'intéresse."""
        return {
            'matricule': '0781',
            'nom': 'DIOP',
            'prenoms': 'Awa',
            'sexe': 'F',
            'nationalite': 'SEN',
            'situationFamiliale': 'MARIE',
            'dateNaissance': '1980-02-08',
            'lieuNaissance': 'DAKAR',
            'adresse': 'GRAND YOFF',
            'mobile': '+221 77 100 20 30',
            'region': 'Dakar',
            'email': 'awa.diop@sar.sn',
            'dateEmbauche': '2005-03-01',
            'typeContrat': 'CDI',
            'adherent': '01',
            **champs,
        }

    def creer(self, **champs):
        return self.client.post(URL, self.fiche(**champs), format='json')


class FormeDuMatricule(BaseParticipants):
    """Quatre chiffres, comme l'application d'origine (« 0781 »)."""

    def test_accepte_quatre_chiffres(self):
        reponse = self.creer()
        self.assertEqual(reponse.status_code, 201, reponse.data)

    def test_refuse_trois_chiffres(self):
        reponse = self.creer(matricule='781')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('matricule', reponse.data)

    def test_refuse_cinq_chiffres(self):
        self.assertEqual(self.creer(matricule='07810').status_code, 400)


class RegimeEtRetraite(BaseParticipants):
    """
    « Retraité » se lit sur la société : l'IPM couvre les salariés en activité,
    les mutuelles (régime MSS) les anciens salariés.
    """

    def test_un_participant_de_l_ipm_n_est_pas_retraite(self):
        reponse = self.creer()
        self.assertFalse(reponse.data['retraite'])

    def test_un_participant_d_une_mutuelle_est_retraite(self):
        reponse = self.creer(adherent='03')
        self.assertTrue(reponse.data['retraite'])

    def test_changer_de_societe_change_de_liste(self):
        # Le départ à la retraite, vu de l'écran : la fiche passe à la mutuelle
        # et quitte du même coup la liste des salariés en activité.
        cree = self.creer()
        self.assertFalse(cree.data['retraite'])
        reponse = self.client.patch(f'{URL}{cree.data["id"]}/', {'adherent': '03'}, format='json')
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertTrue(reponse.data['retraite'])
        self.assertTrue(Participant.objects.get(pk=cree.data['id']).retraite)

    def test_la_case_ne_se_saisit_pas(self):
        # Envoyée quand même, elle est ignorée : c'est la société qui décide.
        reponse = self.creer(retraite=True)
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertFalse(reponse.data['retraite'])


class SortieDuDossier(BaseParticipants):
    """
    L'état du dossier et celui du contrat disent la même chose, jusqu'au
    changement d'état en lot - qui n'envoie que l'état.
    """

    def creer_actif(self):
        reponse = self.creer(etat='Actif')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        return reponse.data['id']

    def test_resilier_ferme_le_contrat_et_date_la_sortie(self):
        reponse = self.client.patch(
            f'{URL}{self.creer_actif()}/', {'etat': 'Résilié'}, format='json'
        )
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertEqual(reponse.data['etatContrat'], 'Fermeture')
        self.assertEqual(reponse.data['dateResiliation'], str(date.today()))
        self.assertEqual(reponse.data['dateRadiation'], '')

    def test_radier_radie_le_contrat(self):
        reponse = self.client.patch(
            f'{URL}{self.creer_actif()}/', {'etat': 'Radié'}, format='json'
        )
        self.assertEqual(reponse.data['etatContrat'], 'Radiation')
        self.assertEqual(reponse.data['dateRadiation'], str(date.today()))
        self.assertEqual(reponse.data['dateResiliation'], '')

    def test_la_date_saisie_est_gardee(self):
        reponse = self.client.patch(
            f'{URL}{self.creer_actif()}/',
            {'etat': 'Résilié', 'dateResiliation': '2025-09-01'},
            format='json',
        )
        self.assertEqual(reponse.data['dateResiliation'], '2025-09-01')

    def test_revenir_en_couverture_rouvre_le_contrat_et_efface_les_dates(self):
        identifiant = self.creer_actif()
        self.client.patch(f'{URL}{identifiant}/', {'etat': 'Radié'}, format='json')
        reponse = self.client.patch(f'{URL}{identifiant}/', {'etat': 'Actif'}, format='json')
        self.assertEqual(reponse.data['etatContrat'], 'Ouverture')
        self.assertEqual(reponse.data['dateRadiation'], '')

    def test_le_changement_d_etat_en_lot_accorde_aussi_le_contrat(self):
        # Le geste de la liste : cocher des lignes, choisir « Radié ». Seul
        # l'état part sur le réseau - le contrat doit suivre quand même.
        identifiants = [self.creer_actif(), self.creer(matricule='0782', email='b@sar.sn').data['id']]
        reponse = self.client.post(
            f'{URL}modifier-en-lot/',
            {'ids': identifiants, 'champs': {'etat': 'Radié'}},
            format='json',
        )
        self.assertEqual(reponse.status_code, 200, reponse.data)
        for identifiant in identifiants:
            fiche = Participant.objects.get(pk=identifiant)
            self.assertEqual(fiche.etat_contrat, 'Radiation')
            self.assertEqual(fiche.date_radiation, date.today())

    def test_un_contrat_saisi_a_contresens_est_remis_d_accord(self):
        reponse = self.creer(etat='Actif', etatContrat='Radiation')
        self.assertEqual(reponse.data['etatContrat'], 'Ouverture')


class DateDEmbauche(BaseParticipants):
    def test_refuse_une_embauche_avant_seize_ans(self):
        reponse = self.creer(dateNaissance='1993-04-12', dateEmbauche='1986-03-15')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('dateEmbauche', reponse.data)

    def test_accepte_une_embauche_a_dix_huit_ans(self):
        reponse = self.creer(dateNaissance='1993-04-12', dateEmbauche='2011-09-01')
        self.assertEqual(reponse.status_code, 201, reponse.data)


class MatriculeDuBeneficiaire(BaseParticipants):
    """« 01-0781-21 » : société, matricule du participant, type et rang."""

    def setUp(self):
        super().setUp()
        self.participant = Participant.objects.create(matricule='0781', adherent=self.moo)

    def membre(self, **champs):
        return {
            'typeBenef': 'ENFANT',
            'matriculePart': '0781',
            'prenoms': 'Yacine',
            'nom': 'DIOP',
            'sexe': 'F',
            'dateNaissance': '2015-06-01',
            **champs,
        }

    def test_compose_le_matricule_et_avance_le_rang(self):
        premier = self.client.post(URL_FAMILLES, self.membre(), format='json')
        self.assertEqual(premier.status_code, 201, premier.data)
        self.assertEqual(premier.data['matriculeBenef'], '01-0781-31')
        second = self.client.post(URL_FAMILLES, self.membre(prenoms='Ibrahima', sexe='M'), format='json')
        self.assertEqual(second.data['matriculeBenef'], '01-0781-32')

    def test_le_matricule_propose_est_ignore(self):
        reponse = self.client.post(
            URL_FAMILLES, self.membre(matriculeBenef='99-9999-99'), format='json'
        )
        self.assertEqual(reponse.data['matriculeBenef'], '01-0781-31')

    def test_le_beneficiaire_ne_change_pas_de_participant(self):
        Participant.objects.create(matricule='0782', adherent=self.moo)
        cree = self.client.post(URL_FAMILLES, self.membre(), format='json')
        reponse = self.client.patch(
            f'{URL_FAMILLES}{cree.data["id"]}/', {'matriculePart': '0782'}, format='json'
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('matriculePart', reponse.data)

    def test_une_epouse_est_une_femme(self):
        reponse = self.client.post(
            URL_FAMILLES, self.membre(typeBenef='EPOUSE', sexe='M'), format='json'
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('sexe', reponse.data)

    def test_un_epoux_est_un_homme(self):
        self.assertEqual(
            self.client.post(
                URL_FAMILLES, self.membre(typeBenef='EPOUX', sexe='F'), format='json'
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                URL_FAMILLES, self.membre(typeBenef='EPOUX', sexe='M'), format='json'
            ).status_code,
            201,
        )

    def test_un_enfant_peut_etre_de_l_un_ou_l_autre_sexe(self):
        for sexe in ('M', 'F'):
            reponse = self.client.post(URL_FAMILLES, self.membre(sexe=sexe), format='json')
            self.assertEqual(reponse.status_code, 201, reponse.data)


class LaFamilleSuitLaFiche(BaseParticipants):
    """
    Le matricule d'un bénéficiaire recopie la société et le matricule de son
    participant : les deux ne peuvent pas diverger.
    """

    def setUp(self):
        super().setUp()
        self.fiche_creee = self.creer()
        self.assertEqual(self.fiche_creee.status_code, 201, self.fiche_creee.data)
        for lien, prenoms, sexe in (('EPOUX', 'Modou', 'M'), ('ENFANT', 'Yacine', 'F')):
            reponse = self.client.post(
                URL_FAMILLES,
                {
                    'typeBenef': lien,
                    'matriculePart': '0781',
                    'prenoms': prenoms,
                    'nom': 'DIOP',
                    'sexe': sexe,
                    'dateNaissance': '2015-06-01',
                },
                format='json',
            )
            self.assertEqual(reponse.status_code, 201, reponse.data)

    def matricules(self):
        return sorted(Beneficiaire.objects.values_list('matricule_benef', flat=True))

    def test_les_matricules_partent_de_la_societe_du_participant(self):
        self.assertEqual(self.matricules(), ['01-0781-31', '01-0781-41'])

    def test_changer_de_societe_recompose_la_famille(self):
        reponse = self.client.patch(
            f'{URL}{self.fiche_creee.data["id"]}/', {'adherent': '03'}, format='json'
        )
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertEqual(self.matricules(), ['03-0781-31', '03-0781-41'])

    def test_corriger_le_matricule_recompose_la_famille(self):
        reponse = self.client.patch(
            f'{URL}{self.fiche_creee.data["id"]}/', {'matricule': '0782'}, format='json'
        )
        self.assertEqual(reponse.status_code, 200, reponse.data)
        self.assertEqual(self.matricules(), ['01-0782-31', '01-0782-41'])

    def test_le_rang_dans_la_fratrie_ne_bouge_pas(self):
        # Un troisième enfant : le rang 2 doit rester libre de toute confusion
        # après un changement de société.
        self.client.post(
            URL_FAMILLES,
            {
                'typeBenef': 'ENFANT',
                'matriculePart': '0781',
                'prenoms': 'Ibrahima',
                'nom': 'DIOP',
                'sexe': 'M',
                'dateNaissance': '2018-02-03',
            },
            format='json',
        )
        self.client.patch(f'{URL}{self.fiche_creee.data["id"]}/', {'adherent': '03'}, format='json')
        self.assertEqual(self.matricules(), ['03-0781-31', '03-0781-32', '03-0781-41'])

    def test_un_changement_sans_rapport_ne_touche_a_rien(self):
        self.client.patch(
            f'{URL}{self.fiche_creee.data["id"]}/', {'adresse': 'MERMOZ'}, format='json'
        )
        self.assertEqual(self.matricules(), ['01-0781-31', '01-0781-41'])


class UneFicheNeSeSupprimePas(BaseParticipants):
    def test_la_suppression_est_refusee(self):
        participant = Participant.objects.create(matricule='0781', adherent=self.moo)
        self.assertEqual(self.client.delete(f'{URL}{participant.pk}/').status_code, 405)

    def test_la_suppression_d_un_beneficiaire_est_refusee(self):
        participant = Participant.objects.create(matricule='0781', adherent=self.moo)
        membre = Beneficiaire.objects.create(
            matricule_benef='01-0781-31', type_benef=self.enfant, participant=participant
        )
        self.assertEqual(self.client.delete(f'{URL_FAMILLES}{membre.pk}/').status_code, 405)


class IdentificationMobile(TestCase):
    """
    Le matricule s'enregistre sur quatre chiffres ; l'employé tape le sien
    comme il le dit - « 949 » et non « 0949 ».
    """

    URL = '/api/mobile/identification/'

    @classmethod
    def setUpTestData(cls):
        societe = Adherent.objects.create(code='01', libelle='IPM SAR PERSONNEL MOO', type='IPM')
        participant = Participant.objects.create(
            matricule='0949', adherent=societe, etat='Actif', nom='MBAYE', prenoms='Moustapha'
        )
        participant.definir_mot_de_passe('0000')
        participant.save()

    def identifier(self, matricule):
        return self.client.post(
            self.URL, {'matricule': matricule, 'mot_de_passe': '0000'}, format='json'
        )

    def test_accepte_le_matricule_sans_ses_zeros(self):
        self.assertEqual(self.identifier('949').status_code, 200)

    def test_accepte_le_matricule_complet(self):
        self.assertEqual(self.identifier('0949').status_code, 200)

    def test_accepte_le_matricule_precede_de_la_societe(self):
        self.assertEqual(self.identifier('01-949').status_code, 200)

    def test_refuse_une_autre_societe(self):
        self.assertEqual(self.identifier('02-949').status_code, 401)
