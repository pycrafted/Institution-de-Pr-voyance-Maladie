"""
Tests de l'API mobile (/api/mobile/).

Une petite IPM de laboratoire : deux sociétés, un participant avec sa
famille, un voisin avec son propre bon, des pharmacies et des prescripteurs.
On y vérifie l'identification, le jeton, les listes, l'émission d'un bon
(chaque règle), l'isolement entre participants et le PDF officiel - et que
le bon émis au mobile est bien un bon IPM comme les autres.
"""

import time
from base64 import b64encode
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pymupdf
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.db import OperationalError
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from adherents.models import Adherent
from documents.models import BonPharmacie, LettreGarantie
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from participants.models import Beneficiaire, Participant

from .authentification import VALIDITE_JETON, emettre_jeton

URL = '/api/mobile/'


class Fixture(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Les spécialités et natures de prestation sont désormais seedées par une
        # migration (données exactes de LAMPS). Ces tests contrôlent leur propre
        # univers : on repart donc d'une table vide avant de le bâtir.
        TypePrestation.objects.all().delete()
        Specialite.objects.all().delete()
        cls.sar = Adherent.objects.create(code='01', libelle='Cadres SAR')
        cls.autre_societe = Adherent.objects.create(code='02', libelle='Agents SAR')

        types = {}
        for code, libelle in [('1', 'PARTICIPANT'), ('2', 'EPOUSE'), ('3', 'ENFANT')]:
            types[code], _ = TypeBeneficiaire.objects.get_or_create(
                code=code, defaults={'libelle': libelle}
            )
        cls.type_participant, cls.type_epouse, cls.type_enfant = types['1'], types['2'], types['3']

        def specialite(code, libelle):
            return Specialite.objects.create(code=code, libelle=libelle)

        cls.sp_pharmacies = specialite('06', 'PHARMACIES')
        cls.sp_generalistes = specialite('00', 'GENERALISTES')
        cls.sp_cardiologues = specialite('09', 'CARDIOLOGUES')
        cls.sp_optique = specialite('04', 'OPTIQUE MEDICALE')
        cls.sp_vide = specialite('17', 'GASTRO-ENTEROLOGUES')

        def fournisseur(code, libelle, sp, **autres):
            return FournisseurDeSoins.objects.create(code=code, libelle=libelle, specialite=sp, **autres)

        cls.pharmacie = fournisseur(
            '101', 'PHARMACIE DU PLATEAU', cls.sp_pharmacies,
            adresse='Rue 1, Dakar', telephone='', mobile='+221 77 000 00 01',
        )
        cls.pharmacie_b = fournisseur('102', 'PHARMACIE ALPHA', cls.sp_pharmacies, telephone='33 800 00 02')
        cls.pharmacie_fermee = fournisseur('103', 'PHARMACIE FERMEE', cls.sp_pharmacies, actif=False)
        # Le fourre-tout d'IPM, classé en PHARMACIES : pas proposé au mobile.
        FournisseurDeSoins.objects.filter(code='9999').update(specialite=cls.sp_pharmacies)
        cls.generaliste = fournisseur('201', 'DR DIALLO', cls.sp_generalistes)
        cls.generaliste_radie = fournisseur('202', 'DR ANCIEN', cls.sp_generalistes, actif=False)
        cls.cardiologue = fournisseur('301', 'DR KANE', cls.sp_cardiologues)
        fournisseur('401', 'OPTIQUE CENTRE', cls.sp_optique)
        fournisseur('501', 'DR GASTRO', cls.sp_vide, actif=False)

        cls.moi = Participant.objects.create(
            matricule='1204', prenoms='Moustapha', nom='NDIAYE', sexe='M',
            date_naissance=date(1962, 1, 1), adherent=cls.sar, etat='Actif',
            mobile='77 000 00 00', email='moustapha@example.sn', adresse='Point E, Dakar',
            mot_de_passe=make_password('0000'),
        )
        cls.epouse = Beneficiaire.objects.create(
            matricule_benef='01-1204-21', participant=cls.moi, type_benef=cls.type_epouse,
            prenoms='Awa', nom='NDIAYE', sexe='F', date_naissance=date(1970, 5, 5),
        )
        cls.enfant = Beneficiaire.objects.create(
            matricule_benef='01-1204-31', participant=cls.moi, type_benef=cls.type_enfant,
            prenoms='Modou', nom='NDIAYE', sexe='M', date_naissance=date(2010, 3, 3),
        )
        cls.enfant_retire = Beneficiaire.objects.create(
            matricule_benef='01-1204-32', participant=cls.moi, type_benef=cls.type_enfant,
            prenoms='Ancien', nom='NDIAYE', actif=False,
        )
        # Radié (limite d'âge) sans que sa fiche soit désactivée : le cas
        # courant dans la base réelle. Il n'est plus couvert.
        cls.enfant_radie = Beneficiaire.objects.create(
            matricule_benef='01-1204-33', participant=cls.moi, type_benef=cls.type_enfant,
            prenoms='Grand', nom='NDIAYE', etat='Radié', actif=True,
        )

        cls.voisin = Participant.objects.create(
            matricule='1207', prenoms='Awa', nom='DIOP', sexe='F',
            date_naissance=date(1969, 2, 8), adherent=cls.sar, etat='Actif',
            mot_de_passe=make_password('1111'),
        )
        cls.enfant_du_voisin = Beneficiaire.objects.create(
            matricule_benef='01-1207-31', participant=cls.voisin, type_benef=cls.type_enfant,
            prenoms='Ousmane', nom='DIOP',
        )
        cls.bon_du_voisin = BonPharmacie.objects.create(
            code='BPI000050', adherent=cls.sar, participant=cls.voisin,
            type_benef=cls.type_participant, pharmacie=cls.pharmacie, nb_articles=2,
        )

        cls.suspendu = Participant.objects.create(
            matricule='1210', prenoms='Ibrahima', nom='FALL',
            date_naissance=date(1976, 3, 15), adherent=cls.autre_societe, etat='Suspendu',
            mot_de_passe=make_password('2222'),
        )

    def setUp(self):
        # Le compteur de la limitation de débit vit dans le cache : chaque
        # test repart de zéro.
        cache.clear()

    def identifier(self, participant=None):
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {emettre_jeton(participant or self.moi)}')

    def bon_valide(self, **changes):
        corps = {
            'beneficiaire': '1204',
            'pharmacie': '101',
            'specialite': '00',
            'prescripteur': '201',
            'nbArticles': 3,
            'dateOrdonnance': (timezone.localdate() - timedelta(days=2)).isoformat(),
        }
        corps.update(changes)
        return corps


class IdentificationTests(Fixture):
    def post(self, matricule, mot_de_passe):
        return self.client.post(
            f'{URL}identification/', {'matricule': matricule, 'mot_de_passe': mot_de_passe}, format='json'
        )

    def test_identite_exacte(self):
        reponse = self.post('1204', '0000')
        self.assertEqual(reponse.status_code, 200)
        self.assertTrue(reponse.data['jeton'])
        participant = reponse.data['participant']
        self.assertEqual(participant['matriculeAffiche'], '01-1204')
        self.assertEqual(participant['nomComplet'], 'Moustapha NDIAYE')
        self.assertEqual(participant['societe'], {'code': '01', 'libelle': 'Cadres SAR'})
        self.assertEqual(participant['dateNaissance'], '1962-01-01')
        self.assertIsInstance(participant['age'], int)
        # Coordonnées et état du dossier : l'employé les lit sur son profil.
        self.assertEqual(participant['telephone'], '77 000 00 00')
        self.assertEqual(participant['email'], 'moustapha@example.sn')
        self.assertEqual(participant['adresse'], 'Point E, Dakar')
        self.assertEqual(participant['etat'], 'Actif')
        # Jamais le mot de passe, sous aucun nom.
        self.assertNotIn('motDePasse', participant)
        # Le jeton rendu ouvre bien les vues mobiles.
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {reponse.data["jeton"]}')
        self.assertEqual(self.client.get(f'{URL}moi/').status_code, 200)

    def test_matricule_affiche(self):
        self.assertEqual(self.post('01-1204', '0000').status_code, 200)
        self.assertEqual(self.post(' 01-1204 ', '0000').status_code, 200)

    def test_matricule_affiche_d_une_autre_societe(self):
        reponse = self.post('02-1204', '0000')
        self.assertEqual(reponse.status_code, 401)

    def test_mauvais_mot_de_passe(self):
        reponse = self.post('1204', '0001')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Matricule ou mot de passe incorrect.'})

    def test_matricule_inconnu(self):
        reponse = self.post('9999', '0000')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Matricule ou mot de passe incorrect.'})

    def test_mot_de_passe_jamais_defini(self):
        # Sans mot de passe mobile, personne n'entre, pas même avec un mot de
        # passe vide ou avec l'ancienne date de naissance.
        Participant.objects.filter(pk=self.moi.pk).update(mot_de_passe='')
        self.assertEqual(self.post('1204', '').status_code, 401)
        self.assertEqual(self.post('1204', '0000').status_code, 401)

    def test_mot_de_passe_garde_chiffre(self):
        self.moi.refresh_from_db()
        self.assertTrue(self.moi.mot_de_passe.startswith('pbkdf2_sha256$'))
        self.assertTrue(self.moi.verifier_mot_de_passe('0000'))
        reponse = self.post('1204', '0000')
        self.assertNotIn('motDePasse', reponse.data['participant'])
        self.assertNotIn('mot_de_passe', reponse.data['participant'])

    def test_saisie_mal_formee(self):
        reponse = self.post('1204', ['0000'])
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Matricule ou mot de passe incorrect.'})

    def test_dossier_inactif_identite_exacte(self):
        reponse = self.post('1210', '2222')
        self.assertEqual(reponse.status_code, 403)
        self.assertEqual(
            reponse.data, {'detail': 'Votre dossier IPM n’est pas actif. Rapprochez-vous de l’IPM.'}
        )

    def test_dossier_inactif_mauvais_mot_de_passe(self):
        # Rien ne se dit du dossier tant que l'identité n'est pas prouvée.
        self.assertEqual(self.post('1210', '2223').status_code, 401)

    def test_participant_desactive(self):
        Participant.objects.filter(pk=self.moi.pk).update(actif=False)
        self.assertEqual(self.post('1204', '0000').status_code, 403)

    def test_limitation_de_debit(self):
        for _ in range(10):
            self.assertEqual(self.post('1204', '9999').status_code, 401)
        reponse = self.post('1204', '0000')
        self.assertEqual(reponse.status_code, 429)

    def test_limitation_derriere_iis(self):
        # Derrière IIS (REMOTE_ADDR local), ARR ajoute « adresse:port » à la
        # fin d'un X-Forwarded-For que le client a pu remplir lui-même. Ni un
        # en-tête forgé ni un nouveau port ne remettent le compteur à zéro.
        for essai in range(10):
            reponse = self.client.post(
                f'{URL}identification/',
                {'matricule': f'{9000 + essai}', 'mot_de_passe': '9999'},
                format='json',
                REMOTE_ADDR='127.0.0.1',
                HTTP_X_FORWARDED_FOR=f'10.9.{essai}.{essai}, 41.82.1.7:{50000 + essai}',
            )
            self.assertEqual(reponse.status_code, 401)
        reponse = self.client.post(
            f'{URL}identification/',
            {'matricule': '1204', 'mot_de_passe': '0000'},
            format='json',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='1.2.3.4:1, 41.82.1.7:61000',
        )
        self.assertEqual(reponse.status_code, 429)
        # Un autre téléphone (autre adresse vue par ARR) garde son propre compteur.
        reponse = self.client.post(
            f'{URL}identification/',
            {'matricule': '1204', 'mot_de_passe': '0000'},
            format='json',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='[2001:db8::5]:61001',
        )
        self.assertEqual(reponse.status_code, 200)

    def test_x_forwarded_for_ignore_hors_relais(self):
        # Sans relais local, l'en-tête ne vient que du client : ignoré.
        for essai in range(10):
            reponse = self.client.post(
                f'{URL}identification/',
                {'matricule': f'{9000 + essai}', 'mot_de_passe': '9999'},
                format='json',
                REMOTE_ADDR='41.82.1.8',
                HTTP_X_FORWARDED_FOR=f'10.0.0.{essai}',
            )
            self.assertEqual(reponse.status_code, 401)
        reponse = self.client.post(
            f'{URL}identification/',
            {'matricule': '1204', 'mot_de_passe': '0000'},
            format='json',
            REMOTE_ADDR='41.82.1.8',
            HTTP_X_FORWARDED_FOR='10.0.0.99',
        )
        self.assertEqual(reponse.status_code, 429)

    def test_limitation_par_matricule(self):
        # Même avec une adresse neuve à chaque essai, un matricule ne se
        # devine pas : 20 essais par heure, « 01-1204 » compté comme « 1204 ».
        for essai in range(20):
            reponse = self.client.post(
                f'{URL}identification/',
                {'matricule': '01-1204' if essai % 2 else '1204', 'mot_de_passe': '9999'},
                format='json',
                REMOTE_ADDR=f'41.82.2.{essai + 1}',
            )
            self.assertEqual(reponse.status_code, 401)
        reponse = self.client.post(
            f'{URL}identification/',
            {'matricule': '1204', 'mot_de_passe': '0000'},
            format='json',
            REMOTE_ADDR='41.82.3.1',
        )
        self.assertEqual(reponse.status_code, 429)
        # Les autres matricules ne sont pas touchés.
        reponse = self.client.post(
            f'{URL}identification/',
            {'matricule': '1207', 'mot_de_passe': '1111'},
            format='json',
            REMOTE_ADDR='41.82.3.2',
        )
        self.assertEqual(reponse.status_code, 200)

    def test_limitation_propre_a_l_identification(self):
        # Les autres vues mobiles ne sont pas limitées.
        self.identifier()
        for _ in range(15):
            self.assertEqual(self.client.get(f'{URL}moi/').status_code, 200)

    def test_jeton_ipm_perime_ignore(self):
        # Un en-tête d'une autre session ne gêne pas l'identification.
        self.client.credentials(HTTP_AUTHORIZATION='Participant n-importe-quoi')
        self.assertEqual(self.post('1204', '0000').status_code, 200)


class JetonTests(Fixture):
    def test_absent(self):
        reponse = self.client.get(f'{URL}moi/')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse['WWW-Authenticate'], 'Participant')

    def test_falsifie(self):
        jeton = emettre_jeton(self.moi)
        # Même signature, autre participant : refusé.
        _, reste = jeton.split(':', 1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {self.voisin.pk}:{reste}')
        reponse = self.client.get(f'{URL}moi/')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Session expirée. Identifiez-vous à nouveau.'})

    def test_illisible(self):
        self.client.credentials(HTTP_AUTHORIZATION='Participant abc')
        self.assertEqual(self.client.get(f'{URL}moi/').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Participant a b')
        self.assertEqual(self.client.get(f'{URL}moi/').status_code, 401)

    def test_expire(self):
        emis_il_y_a = time.time() - VALIDITE_JETON.total_seconds() - 60
        with mock.patch('django.core.signing.time.time', return_value=emis_il_y_a):
            jeton = emettre_jeton(self.moi)
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {jeton}')
        reponse = self.client.get(f'{URL}moi/')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Session expirée. Identifiez-vous à nouveau.'})

    def test_encore_valable(self):
        emis_il_y_a = time.time() - VALIDITE_JETON.total_seconds() + 3600
        with mock.patch('django.core.signing.time.time', return_value=emis_il_y_a):
            jeton = emettre_jeton(self.moi)
        self.client.credentials(HTTP_AUTHORIZATION=f'Participant {jeton}')
        self.assertEqual(self.client.get(f'{URL}moi/').status_code, 200)

    def test_participant_devenu_inactif(self):
        self.identifier()
        Participant.objects.filter(pk=self.moi.pk).update(etat='Suspendu')
        reponse = self.client.get(f'{URL}bons-pharmacie/')
        self.assertEqual(reponse.status_code, 401)
        self.assertEqual(reponse.data, {'detail': 'Session expirée. Identifiez-vous à nouveau.'})

    def test_jeton_ipm_refuse(self):
        # Un jeton d'utilisateur IPM n'ouvre pas les vues mobiles…
        utilisateur = get_user_model().objects.create_user('agent', password='x', is_staff=True)
        jeton = Token.objects.create(user=utilisateur)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {jeton.key}')
        self.assertEqual(self.client.get(f'{URL}moi/').status_code, 401)

    def test_jeton_participant_refuse_par_ipm(self):
        # … et un jeton participant n'ouvre pas l'API IPM.
        self.identifier()
        self.assertEqual(self.client.get('/api/bons-pharmacie/').status_code, 401)


class ListesTests(Fixture):
    def setUp(self):
        super().setUp()
        self.identifier()

    def test_moi(self):
        reponse = self.client.get(f'{URL}moi/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse.data['participant']['matricule'], '1204')
        beneficiaires = reponse.data['beneficiaires']
        # Lui-même d'abord, puis ses ayants droit actifs par matricule.
        self.assertEqual([b['matricule'] for b in beneficiaires], ['1204', '01-1204-21', '01-1204-31'])
        self.assertEqual(
            beneficiaires[0],
            {
                'matricule': '1204',
                'nomComplet': 'Moustapha NDIAYE',
                'prenoms': 'Moustapha',
                'nom': 'NDIAYE',
                'sexe': 'M',
                'age': beneficiaires[0]['age'],
                'type': {'code': '1', 'libelle': 'PARTICIPANT'},
                'estParticipant': True,
                'photo': None,
            },
        )
        self.assertEqual(beneficiaires[1]['type'], {'code': '2', 'libelle': 'EPOUSE'})
        self.assertFalse(beneficiaires[1]['estParticipant'])

    def test_moi_sans_ayant_droit_radie(self):
        reponse = self.client.get(f'{URL}moi/')
        self.assertNotIn('01-1204-33', [b['matricule'] for b in reponse.data['beneficiaires']])

    def test_pharmacies(self):
        reponse = self.client.get(f'{URL}pharmacies/')
        self.assertEqual(reponse.status_code, 200)
        # Actives, classées en PHARMACIES, par libellé ; sans le fourre-tout.
        self.assertEqual([p['code'] for p in reponse.data], ['102', '101'])
        self.assertEqual(
            reponse.data[1],
            {'code': '101', 'libelle': 'PHARMACIE DU PLATEAU', 'adresse': 'Rue 1, Dakar',
             'telephone': '+221 77 000 00 01'},
        )
        self.assertEqual(reponse.data[0]['telephone'], '33 800 00 02')

    def test_conventionnes_toutes_specialites(self):
        reponse = self.client.get(f'{URL}conventionnes/')
        self.assertEqual(reponse.status_code, 200)
        codes = [c['code'] for c in reponse.data]
        # Pharmacies, généraliste, cardiologue, opticien : toutes spécialités,
        # par libellé. Sans les inactifs (103, 202, 501) ni le fourre-tout.
        self.assertEqual(codes, ['201', '301', '401', '102', '101'])
        self.assertNotIn('9999', codes)
        # Chaque fiche porte sa spécialité : c'est elle qui filtre à l'écran.
        plateau = next(c for c in reponse.data if c['code'] == '101')
        self.assertEqual(
            plateau,
            {'code': '101', 'libelle': 'PHARMACIE DU PLATEAU', 'adresse': 'Rue 1, Dakar',
             'telephone': '+221 77 000 00 01',
             'specialite': {'code': '06', 'libelle': 'PHARMACIES'},
             # Pas encore localisée : le mobile guidera vers l'adresse.
             'position': None},
        )

    def test_conventionnes_portent_leur_position(self):
        self.pharmacie.latitude = Decimal('14.669700')
        self.pharmacie.longitude = Decimal('-17.437500')
        self.pharmacie.save()
        reponse = self.client.get(f'{URL}conventionnes/')
        plateau = next(c for c in reponse.data if c['code'] == '101')
        self.assertEqual(plateau['position'], {'latitude': 14.6697, 'longitude': -17.4375})

    def test_conventionnes_sans_specialite_inactive(self):
        self.sp_cardiologues.actif = False
        self.sp_cardiologues.save()
        codes = [c['code'] for c in self.client.get(f'{URL}conventionnes/').data]
        self.assertNotIn('301', codes)

    def test_conventionnes_exige_un_jeton(self):
        self.client.credentials()
        self.assertEqual(self.client.get(f'{URL}conventionnes/').status_code, 401)

    def test_specialites(self):
        reponse = self.client.get(f'{URL}specialites/')
        self.assertEqual(reponse.status_code, 200)
        # Ni pharmacies, ni optique, ni spécialité sans conventionné actif.
        self.assertEqual(
            reponse.data,
            [
                {'code': '09', 'libelle': 'CARDIOLOGUES', 'nombre': 1},
                {'code': '00', 'libelle': 'GENERALISTES', 'nombre': 1},
            ],
        )

    def test_prescripteurs(self):
        reponse = self.client.get(f'{URL}prescripteurs/', {'specialite': '00'})
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual([p['code'] for p in reponse.data], ['201'])

    def test_prescripteurs_sans_divers_ni_pharmacies(self):
        FournisseurDeSoins.objects.filter(code='9999').update(specialite=self.sp_generalistes)
        reponse = self.client.get(f'{URL}prescripteurs/', {'specialite': '00'})
        self.assertEqual([p['code'] for p in reponse.data], ['201'])
        self.assertEqual(self.client.get(f'{URL}prescripteurs/', {'specialite': '06'}).status_code, 400)

    def test_prescripteurs_sans_specialite(self):
        reponse = self.client.get(f'{URL}prescripteurs/')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('specialite', reponse.data)

    def test_prescripteurs_specialite_inconnue(self):
        reponse = self.client.get(f'{URL}prescripteurs/', {'specialite': '77'})
        self.assertEqual(reponse.status_code, 400)
        self.assertEqual(reponse.data, {'specialite': ['Spécialité inconnue.']})

    def test_mes_bons_du_plus_recent_au_plus_ancien(self):
        ancien = BonPharmacie.objects.create(
            code='BPI000060', adherent=self.sar, participant=self.moi,
            type_benef=self.type_participant, pharmacie=self.pharmacie,
        )
        recent = BonPharmacie.objects.create(
            code='BPI000061', adherent=self.sar, participant=self.moi,
            type_benef=self.type_enfant, beneficiaire=self.enfant, pharmacie=self.pharmacie,
        )
        reponse = self.client.get(f'{URL}bons-pharmacie/')
        self.assertEqual(reponse.status_code, 200)
        # Le bon du voisin n'y figure pas.
        self.assertEqual([b['id'] for b in reponse.data], [recent.id, ancien.id])
        self.assertEqual(
            reponse.data[0]['beneficiaire'],
            {'matricule': '01-1204-31', 'nomComplet': 'Modou NDIAYE', 'type': {'code': '3', 'libelle': 'ENFANT'}},
        )

    def test_statuts(self):
        aujourdhui = timezone.localdate()

        def bon(code, **champs):
            return BonPharmacie.objects.create(
                code=code, adherent=self.sar, participant=self.moi,
                type_benef=self.type_participant, **champs,
            )

        attendus = {
            bon('BPI000070').id: 'valide',
            bon('BPI000071', date=aujourdhui - timedelta(days=30)).id: 'valide',
            bon('BPI000072', date=aujourdhui - timedelta(days=31)).id: 'expire',
            bon('BPI000073', actif=False, traite=True).id: 'annule',
            bon('BPI000074', traite=True, date=aujourdhui - timedelta(days=60)).id: 'traite',
        }
        reponse = self.client.get(f'{URL}bons-pharmacie/')
        self.assertEqual({b['id']: b['statut'] for b in reponse.data}, attendus)
        recent = next(b for b in reponse.data if b['code'] == 'BPI000070')
        self.assertEqual(recent['valableJusquAu'], (aujourdhui + timedelta(days=30)).isoformat())


class CreationTests(Fixture):
    def setUp(self):
        super().setUp()
        self.identifier()

    def creer(self, **changes):
        return self.client.post(f'{URL}bons-pharmacie/', self.bon_valide(**changes), format='json')

    def test_cas_nominal_pour_lui_meme(self):
        reponse = self.creer()
        self.assertEqual(reponse.status_code, 201, reponse.data)
        bon = BonPharmacie.objects.get(pk=reponse.data['id'])
        # Numéro suivant le plus grand existant, comme à IPM.
        self.assertEqual(bon.code, 'BPI000051')
        self.assertEqual(bon.adherent, self.sar)
        self.assertEqual(bon.participant, self.moi)
        self.assertEqual(bon.type_benef, self.type_participant)
        self.assertIsNone(bon.beneficiaire)
        self.assertEqual(bon.pharmacie, self.pharmacie)
        self.assertEqual(bon.specialite, self.sp_generalistes)
        self.assertEqual(bon.prescripteur, self.generaliste)
        self.assertEqual(bon.nb_articles, 3)
        self.assertIsNone(bon.cree_par)
        self.assertEqual(bon.date, timezone.localdate())
        self.assertEqual(reponse.data['statut'], 'valide')
        self.assertEqual(reponse.data['code'], 'BPI000051')
        self.assertEqual(reponse.data['pharmacie']['code'], '101')
        self.assertEqual(reponse.data['specialite'], {'code': '00', 'libelle': 'GENERALISTES'})
        self.assertEqual(reponse.data['prescripteur']['libelle'], 'DR DIALLO')
        self.assertEqual(reponse.data['beneficiaire']['type'], {'code': '1', 'libelle': 'PARTICIPANT'})

    def test_cas_nominal_pour_un_ayant_droit(self):
        reponse = self.creer(beneficiaire='01-1204-21', specialite='09', prescripteur='301', nbArticles=8)
        self.assertEqual(reponse.status_code, 201, reponse.data)
        bon = BonPharmacie.objects.get(pk=reponse.data['id'])
        self.assertEqual(bon.beneficiaire, self.epouse)
        self.assertEqual(bon.type_benef, self.type_epouse)
        self.assertEqual(reponse.data['beneficiaire']['nomComplet'], 'Awa NDIAYE')

    def test_ordonnance_du_jour_et_de_j_moins_30(self):
        aujourdhui = timezone.localdate()
        self.assertEqual(self.creer(dateOrdonnance=aujourdhui.isoformat()).status_code, 201)
        self.assertEqual(
            self.creer(dateOrdonnance=(aujourdhui - timedelta(days=30)).isoformat()).status_code, 201
        )

    def assertRefus(self, reponse, champ):
        self.assertEqual(reponse.status_code, 400, reponse.data)
        self.assertIn(champ, reponse.data)
        # Rien n'est enregistré.
        self.assertFalse(BonPharmacie.objects.filter(participant=self.moi).exists())

    def test_beneficiaire_d_un_autre(self):
        self.assertRefus(self.creer(beneficiaire='01-1207-31'), 'beneficiaire')
        self.assertRefus(self.creer(beneficiaire='1207'), 'beneficiaire')

    def test_beneficiaire_inconnu_ou_retire(self):
        self.assertRefus(self.creer(beneficiaire='01-1204-99'), 'beneficiaire')
        self.assertRefus(self.creer(beneficiaire='01-1204-32'), 'beneficiaire')

    def test_ayant_droit_radie(self):
        # Fiche active mais état « Radié » : plus couvert, bon refusé.
        self.assertRefus(self.creer(beneficiaire='01-1204-33'), 'beneficiaire')

    def test_pharmacie_hors_pharmacies(self):
        self.assertRefus(self.creer(pharmacie='201'), 'pharmacie')

    def test_pharmacie_inconnue_ou_fermee(self):
        self.assertRefus(self.creer(pharmacie='999'), 'pharmacie')
        self.assertRefus(self.creer(pharmacie='103'), 'pharmacie')
        self.assertRefus(self.creer(pharmacie='9999'), 'pharmacie')

    def test_specialite_inconnue(self):
        self.assertRefus(self.creer(specialite='77'), 'specialite')

    def test_specialite_hors_prescription(self):
        # Pharmacies et optique ne prescrivent pas, même par appel direct.
        self.assertRefus(self.creer(specialite='06', prescripteur='102'), 'specialite')
        self.assertRefus(self.creer(specialite='04', prescripteur='401'), 'specialite')
        Specialite.objects.filter(pk=self.sp_generalistes.pk).update(actif=False)
        self.assertRefus(self.creer(), 'specialite')

    def test_prescripteur_divers_refuse(self):
        FournisseurDeSoins.objects.filter(code='9999').update(specialite=self.sp_generalistes)
        self.assertRefus(self.creer(prescripteur='9999'), 'prescripteur')

    def test_prescripteur_d_une_autre_specialite(self):
        reponse = self.creer(specialite='09', prescripteur='201')
        self.assertRefus(reponse, 'prescripteur')
        self.assertEqual(reponse.data['prescripteur'], ['Ce prescripteur n’est pas de la spécialité choisie.'])

    def test_prescripteur_inconnu_ou_radie(self):
        self.assertRefus(self.creer(prescripteur='999'), 'prescripteur')
        self.assertRefus(self.creer(prescripteur='202'), 'prescripteur')

    def test_nombre_d_articles(self):
        for valeur in (0, 9, -1, 'abc', None):
            self.assertRefus(self.creer(nbArticles=valeur), 'nbArticles')

    def test_ordonnance_future(self):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.assertRefus(self.creer(dateOrdonnance=demain), 'dateOrdonnance')

    def test_ordonnance_trop_ancienne(self):
        vieille = (timezone.localdate() - timedelta(days=31)).isoformat()
        self.assertRefus(self.creer(dateOrdonnance=vieille), 'dateOrdonnance')

    def test_ordonnance_mal_formee(self):
        self.assertRefus(self.creer(dateOrdonnance='31/12/2025'), 'dateOrdonnance')

    def test_seul_le_beneficiaire_est_exige(self):
        # Même règle qu'à l'écran IPM, où seuls la société, le participant et
        # le type de bénéficiaire portent l'astérisque : la pharmacie, le
        # prescripteur et l'ordonnance se renseignent plus tard.
        reponse = self.client.post(f'{URL}bons-pharmacie/', {}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertEqual(set(reponse.data), {'beneficiaire'})

    def test_bon_avec_le_seul_beneficiaire(self):
        reponse = self.client.post(
            f'{URL}bons-pharmacie/', {'beneficiaire': self.moi.matricule}, format='json'
        )
        self.assertEqual(reponse.status_code, 201, reponse.data)
        bon = BonPharmacie.objects.get(pk=reponse.data['id'])
        self.assertEqual(bon.participant, self.moi)
        # Tout le reste reste à compléter par le gestionnaire.
        self.assertIsNone(bon.pharmacie)
        self.assertIsNone(bon.specialite)
        self.assertIsNone(bon.prescripteur)
        self.assertIsNone(bon.date_ordonnance)
        self.assertEqual(bon.nb_articles, 0)

    def test_prescripteur_sans_specialite_refuse(self):
        # La spécialité dit parmi qui chercher le prescripteur : l'un sans
        # l'autre n'a pas de sens, comme à l'écran IPM.
        reponse = self.client.post(
            f'{URL}bons-pharmacie/',
            {'beneficiaire': self.moi.matricule, 'prescripteur': self.generaliste.code},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('specialite', reponse.data)

    def test_numero_pris_entre_temps(self):
        # Un autre poste a pris le numéro entre le calcul et l'enregistrement
        # (simulé : le premier calcul rend un numéro déjà porté) ; le second
        # essai prend le suivant.
        vrai = BonPharmacie.prochain_code
        appels = []

        def prochain_code():
            appels.append(1)
            return self.bon_du_voisin.code if len(appels) == 1 else vrai()

        with mock.patch.object(BonPharmacie, 'prochain_code', side_effect=prochain_code):
            reponse = self.creer()
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(len(appels), 2)
        self.assertEqual(reponse.data['code'], 'BPI000051')

    def test_base_verrouillee_entre_temps(self):
        # Avec SQLite, le perdant d'une course reçoit « database is locked »
        # et non une IntegrityError : même reprise.
        vrai = BonPharmacie.prochain_code
        appels = []

        def prochain_code():
            appels.append(1)
            if len(appels) == 1:
                raise OperationalError('database is locked')
            return vrai()

        with mock.patch.object(BonPharmacie, 'prochain_code', side_effect=prochain_code):
            reponse = self.creer()
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(len(appels), 2)

    def test_autre_erreur_de_base_non_reprise(self):
        with mock.patch.object(
            BonPharmacie, 'prochain_code', side_effect=OperationalError('no such table')
        ):
            with self.assertRaises(OperationalError):
                self.creer()

    def test_bon_visible_dans_ipm(self):
        reponse = self.creer()
        self.assertEqual(reponse.status_code, 201)
        agent = get_user_model().objects.create_user('agent', password='x', is_staff=True)
        jeton = Token.objects.create(user=agent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {jeton.key}')
        liste = self.client.get('/api/bons-pharmacie/')
        self.assertEqual(liste.status_code, 200)
        bon = next(b for b in liste.data if b['id'] == reponse.data['id'])
        self.assertEqual(bon['code'], reponse.data['code'])
        self.assertEqual(bon['codeSoc'], '01')
        self.assertEqual(bon['matriculePart'], '1204')
        self.assertEqual(bon['typeBenef'], '1')
        self.assertEqual(bon['codeFournisseur'], '101')
        self.assertEqual(bon['pharmacie'], 'PHARMACIE DU PLATEAU')
        # Aucune marque d'origine.
        self.assertNotIn('origine', bon)


class IsolementEtPdfTests(Fixture):
    def setUp(self):
        super().setUp()
        self.identifier()
        self.mon_bon = BonPharmacie.objects.create(
            code='BPI000123', adherent=self.sar, participant=self.moi,
            type_benef=self.type_participant, pharmacie=self.pharmacie,
            specialite=self.sp_generalistes, prescripteur=self.generaliste, nb_articles=2,
            date_ordonnance=timezone.localdate(),
        )

    def test_detail(self):
        reponse = self.client.get(f'{URL}bons-pharmacie/{self.mon_bon.id}/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse.data['code'], 'BPI000123')
        self.assertEqual(reponse.data['nbArticles'], 2)
        self.assertEqual(reponse.data['genre'], 'bon-pharmacie')
        self.assertEqual(
            set(reponse.data),
            {'genre', 'id', 'code', 'date', 'valableJusquAu', 'statut', 'beneficiaire', 'pharmacie',
             'prestataire', 'naturePrestation', 'specialite', 'prescripteur', 'nbArticles',
             'dateOrdonnance', 'creeLe'},
        )

    def test_bon_d_un_autre_introuvable(self):
        self.assertEqual(self.client.get(f'{URL}bons-pharmacie/{self.bon_du_voisin.id}/').status_code, 404)
        self.assertEqual(
            self.client.get(f'{URL}bons-pharmacie/{self.bon_du_voisin.id}/pdf/').status_code, 404
        )
        self.assertEqual(self.client.get(f'{URL}bons-pharmacie/999999/').status_code, 404)

    def test_pdf(self):
        reponse = self.client.get(f'{URL}bons-pharmacie/{self.mon_bon.id}/pdf/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse['Content-Type'], 'application/pdf')
        self.assertEqual(reponse['Content-Disposition'], 'inline; filename="BPI000123.pdf"')
        self.assertTrue(reponse.content.startswith(b'%PDF'))
        doc = pymupdf.open(stream=reponse.content, filetype='pdf')
        # Original et copie ; « édité par » le participant, sous son matricule
        # affiché ; « créé par » vide, aucun utilisateur IPM ne l'ayant émis.
        self.assertEqual(doc.page_count, 2)
        texte = doc[0].get_text()
        self.assertIn('BPI000123', texte)
        self.assertIn('par : 01-1204', texte)
        self.assertIn('PHARMACIE DU PLATEAU', texte)

    def test_pdf_ipm_edite_par_l_utilisateur(self):
        # L'appelant IPM, après le changement de signature de bon_pharmacie_pdf.
        agent = get_user_model().objects.create_user('agent.ipm', password='x', is_staff=True)
        jeton = Token.objects.create(user=agent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {jeton.key}')
        reponse = self.client.get(f'/api/bons-pharmacie/{self.mon_bon.id}/pdf/')
        self.assertEqual(reponse.status_code, 200)
        texte = pymupdf.open(stream=reponse.content, filetype='pdf')[0].get_text()
        self.assertIn('par : agent.ipm', texte)


class PhotoTests(Fixture):
    """
    Photo d'identité posée depuis le mobile (PUT /api/mobile/moi/photo/),
    une seule fois : ensuite, seule l'IPM peut la réinitialiser.

    C'est la seule écriture du mobile sur la fiche du participant : elle doit
    donc n'accepter qu'une vraie image, raisonnablement légère, et ne toucher
    qu'à celui qui l'envoie.
    """

    URL = '/api/mobile/moi/photo/'

    # Le plus petit JPEG et le plus petit PNG possibles : seuls leurs premiers
    # octets comptent pour la vérification.
    JPEG = 'data:image/jpeg;base64,' + b64encode(bytes.fromhex('ffd8ffdb0043') + b'x' * 40).decode()
    PNG = (
        'data:image/png;base64,'
        + b64encode(bytes.fromhex('89504e470d0a1a0a') + b'x' * 40).decode()
    )

    def setUp(self):
        super().setUp()
        self.identifier()

    def test_pose_une_photo_jpeg(self):
        reponse = self.client.put(self.URL, {'photo': self.JPEG}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.moi.refresh_from_db()
        self.assertEqual(self.moi.photo, self.JPEG)
        # Et elle revient aussitôt avec le profil : l'écran peut l'afficher.
        self.assertEqual(self.client.get('/api/mobile/moi/').data['participant']['photo'], self.JPEG)

    def test_png_accepte(self):
        self.assertEqual(self.client.put(self.URL, {'photo': self.PNG}, format='json').status_code, 200)
        self.moi.refresh_from_db()
        self.assertEqual(self.moi.photo, self.PNG)

    def test_une_seule_fois_ensuite_seule_lipm_peut_reinitialiser(self):
        # Une photo d'identité n'est pas un avatar : une fois posée, l'employé
        # ne la remplace plus depuis son téléphone.
        self.client.put(self.URL, {'photo': self.JPEG}, format='json')
        reponse = self.client.put(self.URL, {'photo': self.PNG}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('IPM', reponse.data['photo'][0])
        self.moi.refresh_from_db()
        self.assertEqual(self.moi.photo, self.JPEG)

    def test_le_mobile_ne_retire_pas_une_photo(self):
        self.client.put(self.URL, {'photo': self.JPEG}, format='json')
        self.assertEqual(self.client.delete(self.URL).status_code, 405)
        self.moi.refresh_from_db()
        self.assertEqual(self.moi.photo, self.JPEG)

    def test_sans_photo_le_profil_la_dit_vide(self):
        self.assertIsNone(self.client.get('/api/mobile/moi/').data['participant']['photo'])

    def test_refus_des_envois_mal_formes(self):
        for valeur in (
            '',
            '   ',
            None,
            42,
            'pas une url de donnees',
            'data:text/html;base64,' + b64encode(b'<script>').decode(),
            'data:image/gif;base64,' + b64encode(b'GIF89a').decode(),
            'data:image/jpeg;base64,',
            'data:image/jpeg;base64,pas-du-base64!!',
        ):
            with self.subTest(valeur=valeur):
                reponse = self.client.put(self.URL, {'photo': valeur}, format='json')
                self.assertEqual(reponse.status_code, 400)
                self.assertIn('photo', reponse.data)
        self.moi.refresh_from_db()
        self.assertEqual(self.moi.photo, '')

    def test_refus_dune_image_mentie(self):
        # En-tête JPEG, contenu qui n'en est pas un : la signature le dit.
        faux = 'data:image/jpeg;base64,' + b64encode(b'<html>trompe-oeil</html>').decode()
        self.assertEqual(self.client.put(self.URL, {'photo': faux}, format='json').status_code, 400)

    def test_refus_dune_photo_trop_lourde(self):
        lourde = 'data:image/jpeg;base64,' + b64encode(
            bytes.fromhex('ffd8ffdb0043') + b'x' * (400 * 1024)
        ).decode()
        reponse = self.client.put(self.URL, {'photo': lourde}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('400 Ko', reponse.data['photo'][0])

    def test_ne_touche_quau_participant_identifie(self):
        self.client.put(self.URL, {'photo': self.JPEG}, format='json')
        self.voisin.refresh_from_db()
        self.assertEqual(self.voisin.photo, '')

    def test_jeton_exige(self):
        self.client.credentials()
        self.assertEqual(self.client.put(self.URL, {'photo': self.JPEG}, format='json').status_code, 401)



class PhotoBeneficiaireTests(Fixture):
    """
    Photo d'un ayant droit, posée par le titulaire depuis le mobile
    (PUT /api/mobile/moi/beneficiaires/<matricule>/photo/).

    Mêmes règles que la sienne - une seule fois, pas de retrait - plus une qui
    n'a de sens qu'ici : on ne touche qu'aux ayants droit de SON dossier.
    """

    JPEG = PhotoTests.JPEG
    PNG = PhotoTests.PNG

    def url(self, matricule):
        return f'/api/mobile/moi/beneficiaires/{matricule}/photo/'

    def setUp(self):
        super().setUp()
        self.identifier()

    def test_pose_la_photo_dun_enfant(self):
        reponse = self.client.put(self.url('01-1204-31'), {'photo': self.JPEG}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.enfant.refresh_from_db()
        self.assertEqual(self.enfant.photo, self.JPEG)
        # Elle revient avec le profil : la carte d'ayant droit peut l'afficher.
        beneficiaires = self.client.get('/api/mobile/moi/').data['beneficiaires']
        enfant = next(b for b in beneficiaires if b['matricule'] == '01-1204-31')
        self.assertEqual(enfant['photo'], self.JPEG)

    def test_une_seule_fois_ensuite_seule_lipm_peut_reinitialiser(self):
        self.client.put(self.url('01-1204-31'), {'photo': self.JPEG}, format='json')
        reponse = self.client.put(self.url('01-1204-31'), {'photo': self.PNG}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('IPM', reponse.data['photo'][0])
        self.enfant.refresh_from_db()
        self.assertEqual(self.enfant.photo, self.JPEG)

    def test_le_mobile_ne_retire_pas_une_photo(self):
        self.client.put(self.url('01-1204-31'), {'photo': self.JPEG}, format='json')
        self.assertEqual(self.client.delete(self.url('01-1204-31')).status_code, 405)
        self.enfant.refresh_from_db()
        self.assertEqual(self.enfant.photo, self.JPEG)

    def test_refus_dun_ayant_droit_dun_autre_dossier(self):
        reponse = self.client.put(self.url('01-1207-31'), {'photo': self.JPEG}, format='json')
        self.assertEqual(reponse.status_code, 404)
        self.enfant_du_voisin.refresh_from_db()
        self.assertEqual(self.enfant_du_voisin.photo, '')

    def test_refus_dune_image_mentie(self):
        faux = 'data:image/jpeg;base64,' + b64encode(b'<html>trompe-oeil</html>').decode()
        self.assertEqual(
            self.client.put(self.url('01-1204-31'), {'photo': faux}, format='json').status_code,
            400,
        )
        self.enfant.refresh_from_db()
        self.assertEqual(self.enfant.photo, '')

    def test_jeton_exige(self):
        self.client.credentials()
        reponse = self.client.put(self.url('01-1204-31'), {'photo': self.JPEG}, format='json')
        self.assertEqual(reponse.status_code, 401)


class LettresGarantieTests(Fixture):
    """La lettre de garantie émise au mobile : une lettre IPM comme les autres."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.visite = TypePrestation.objects.create(code='00', libelle='VISITE')
        cls.analyses = TypePrestation.objects.create(code='01', libelle='ANALYSES BIO-MEDICALES')
        # Même libellé qu'une autre : proposée une seule fois.
        TypePrestation.objects.create(code='30', libelle='VISITE')
        # Couvertes par leur propre document.
        TypePrestation.objects.create(code='06', libelle='PHARMACIE')
        TypePrestation.objects.create(code='19', libelle='VERRES CORRECTEURS')
        TypePrestation.objects.create(code='12', libelle='SCANNER', actif=False)
        cls.lettre_du_voisin = LettreGarantie.objects.create(
            code='LGI000050', adherent=cls.sar, participant=cls.voisin,
            type_benef=cls.type_participant,
        )

    def setUp(self):
        super().setUp()
        self.identifier()

    def lettre_valide(self, **changes):
        corps = {
            'beneficiaire': self.enfant.matricule_benef,
            'specialitePrestataire': '09',
            'prestataire': '301',
            'naturePrestation': '00',
            'specialite': '00',
            'prescripteur': '201',
            'datePrescription': (timezone.localdate() - timedelta(days=3)).isoformat(),
        }
        corps.update(changes)
        return corps

    def creer(self, **changes):
        return self.client.post(f'{URL}lettres-garantie/', self.lettre_valide(**changes), format='json')

    def test_natures_de_prestation(self):
        reponse = self.client.get(f'{URL}natures-prestation/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(
            reponse.data,
            [
                {'code': '00', 'libelle': 'VISITE', 'courante': True},
                {'code': '01', 'libelle': 'ANALYSES BIO-MEDICALES', 'courante': True},
            ],
        )

    def test_natures_rangees_par_specialite(self):
        # Spécialité 01 BIOLOGISTES : les 2 889 lettres réelles de LAMPS ne
        # lui connaissent qu'une nature, 01 ANALYSES BIO-MEDICALES. Elle passe
        # devant, la visite reste proposée derrière.
        reponse = self.client.get(f'{URL}natures-prestation/?specialite=01')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(
            reponse.data,
            [
                {'code': '01', 'libelle': 'ANALYSES BIO-MEDICALES', 'courante': True},
                {'code': '00', 'libelle': 'VISITE', 'courante': False},
            ],
        )

    def test_specialite_sans_releve_garde_la_liste(self):
        # Aucune lettre réelle pour cette spécialité : rien ne justifie de
        # mettre une nature en avant, la liste reste celle d'avant.
        reponse = self.client.get(f'{URL}natures-prestation/?specialite=28')
        self.assertEqual([n['code'] for n in reponse.data], ['00', '01'])
        self.assertTrue(all(n['courante'] for n in reponse.data))

    def test_creation(self):
        reponse = self.creer()
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(reponse.data['genre'], 'lettre-garantie')
        self.assertTrue(reponse.data['code'].startswith('LGI'))
        self.assertEqual(reponse.data['statut'], 'valide')
        self.assertEqual(reponse.data['prestataire']['code'], '301')
        self.assertEqual(reponse.data['naturePrestation'], {'code': '00', 'libelle': 'VISITE'})
        self.assertEqual(reponse.data['prescripteur']['code'], '201')
        self.assertIsNone(reponse.data['pharmacie'])
        self.assertEqual(reponse.data['beneficiaire']['nomComplet'], 'Modou NDIAYE')

        lettre = LettreGarantie.objects.get(code=reponse.data['code'])
        self.assertEqual(lettre.participant, self.moi)
        self.assertEqual(lettre.adherent, self.sar)
        self.assertEqual(lettre.beneficiaire, self.enfant)
        self.assertEqual(lettre.type_benef, self.type_enfant)
        self.assertEqual(lettre.specialite_prestataire, self.sp_cardiologues)
        self.assertEqual(lettre.nature_prestation, self.visite)
        self.assertIsNone(lettre.cree_par)

    def test_lettre_pour_soi_meme(self):
        reponse = self.creer(beneficiaire='1204')
        self.assertEqual(reponse.status_code, 201, reponse.data)
        lettre = LettreGarantie.objects.get(code=reponse.data['code'])
        self.assertIsNone(lettre.beneficiaire)
        self.assertEqual(lettre.type_benef, self.type_participant)

    def test_refus(self):
        cas = {
            'beneficiaire': (self.enfant_du_voisin.matricule_benef, 'famille'),
            'prestataire': ('201', 'spécialité'),
            'naturePrestation': ('06', 'inconnue'),
            'specialitePrestataire': ('06', 'inconnue'),
            'prescripteur': ('999', 'inconnu'),
            'datePrescription': ((timezone.localdate() - timedelta(days=31)).isoformat(), '30 jours'),
        }
        for champ, (valeur, extrait) in cas.items():
            with self.subTest(champ=champ):
                reponse = self.creer(**{champ: valeur})
                self.assertEqual(reponse.status_code, 400)
                self.assertIn(extrait, reponse.data[champ][0])
        self.assertFalse(LettreGarantie.objects.filter(participant=self.moi).exists())

    def test_seul_le_beneficiaire_est_exige(self):
        # Meme regle que le bon et que l'ecran IPM : le reste se renseigne
        # plus tard, quand l'employe revient avec sa prescription.
        reponse = self.client.post(f'{URL}lettres-garantie/', {}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertEqual(set(reponse.data), {'beneficiaire'})

    def test_lettre_avec_le_seul_beneficiaire(self):
        reponse = self.client.post(
            f'{URL}lettres-garantie/',
            {'beneficiaire': self.enfant.matricule_benef},
            format='json',
        )
        self.assertEqual(reponse.status_code, 201, reponse.data)
        lettre = LettreGarantie.objects.get(pk=reponse.data['id'])
        self.assertEqual(lettre.participant, self.moi)
        self.assertIsNone(lettre.prestataire)
        self.assertIsNone(lettre.nature_prestation)
        self.assertIsNone(lettre.prescripteur)
        self.assertIsNone(lettre.date_prescription)
        self.assertEqual(lettre.nb_articles, 0)

    def test_fournisseur_sans_specialite_refuse(self):
        reponse = self.client.post(
            f'{URL}lettres-garantie/',
            {'beneficiaire': self.enfant.matricule_benef, 'prestataire': '301'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('specialitePrestataire', reponse.data)

    def test_nombre_d_actes_enregistre(self):
        reponse = self.creer(nbArticles=3)
        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(LettreGarantie.objects.get(pk=reponse.data['id']).nb_articles, 3)

    def test_prescription_dans_le_futur(self):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        reponse = self.creer(datePrescription=demain)
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('futur', reponse.data['datePrescription'][0])

    def test_liste_isolee(self):
        self.creer()
        reponse = self.client.get(f'{URL}lettres-garantie/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(len(reponse.data), 1)
        self.assertNotIn('LGI000050', [lettre['code'] for lettre in reponse.data])

    def test_lettre_d_un_autre_introuvable(self):
        pk = self.lettre_du_voisin.id
        self.assertEqual(self.client.get(f'{URL}lettres-garantie/{pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'{URL}lettres-garantie/{pk}/pdf/').status_code, 404)

    def test_detail_et_pdf(self):
        pk = self.creer().data['id']
        detail = self.client.get(f'{URL}lettres-garantie/{pk}/')
        self.assertEqual(detail.status_code, 200)
        reponse = self.client.get(f'{URL}lettres-garantie/{pk}/pdf/')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse['Content-Type'], 'application/pdf')
        doc = pymupdf.open(stream=reponse.content, filetype='pdf')
        self.assertEqual(len(doc), 2)
        texte = doc[0].get_text()
        self.assertIn(detail.data['code'], texte)
        # « édité par » : le participant, sous son matricule affiché.
        self.assertIn('par : 01-1204', texte)

    def test_jeton_exige(self):
        self.client.credentials()
        self.assertEqual(self.client.get(f'{URL}lettres-garantie/').status_code, 401)
        self.assertEqual(self.client.get(f'{URL}natures-prestation/').status_code, 401)
