"""
Installe l'équipe de la Direction des Systèmes d'Information.

Onze fiches, avec leurs matricules et leurs adresses réels, posées sur
l'organigramme de la DSI. Elles remplacent les participants engendrés au
hasard par ``remplir_donnees_demo`` : une page qu'on lit d'un coup d'œil, et
des noms qu'on reconnaît quand on vérifie un écran.

Les âges suivent la hiérarchie - le dernier arrivé a vingt-quatre ans, les
chefs de service la trentaine - et les plus gradés sont partis à la retraite :
directeur et chefs de département relèvent des mutuelles CMM, régime MSS, qui
prennent le relais de l'IPM au départ de l'entreprise (cf.
``Participant.retraite``).

Prudente : elle refuse de travailler tant qu'un document porte un
participant, car les bons et les lettres déjà émis désignent des fiches qui
disparaîtraient sous eux.
"""

import base64

from django.core.management.base import BaseCommand
from django.db import transaction

from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation
from donnees_de_base.models import StructureEntite
from parametres.models import TauxExceptionnel
from participants.models import Beneficiaire, Participant
from participants.serializers import BeneficiaireSerializer, ParticipantSerializer

# --- Entités que l'organigramme nomme et que le référentiel ignorait ---------
# Le modèle veut un service sous un département : « Sécurité Informatique »,
# qui rend compte au directeur, se range donc sous Informatique.
STRUCTURE = [
    ('DEP018', 'Automatisation', 'DEP', 'DIR007'),
    ('SRV017', 'Sécurité Informatique', 'SRV', 'DEP010'),
    ('SRV018', 'Automatisation', 'SRV', 'DEP018'),
]

DSI = 'DIR007'          # Direction des Systèmes d’Information
INFORMATIQUE = 'DEP010'
AUTOMATISATION = 'DEP018'

# --- L'équipe ----------------------------------------------------------------
# Une ligne par personne : identité, société, poste, dossier, puis la famille.
# La société dit tout : 01 (personnel MOO) et 02 (cadres) pour les salariés en
# activité, 03 (CMM CR-SAR) pour les cadres retraités.
EQUIPE = [
    {
        'fonction': 'Directeur des Systèmes d’Information',
        'matricule': '1035', 'prenoms': 'Idrissa', 'nom': 'CISSE', 'sexe': 'M',
        'naissance': '1960-03-12', 'embauche': '1985-09-01', 'situation': 'MARIE',
        'email': 'idrissa.cisse@sar.sn', 'adherent': '03', 'categorie': 'CADRE',
        'etat': 'Actif', 'structure': (DSI, '', ''), 'souscription': '2022-04-01',
        'famille': [
            ('EPOUSE', 'Adama', 'NDIAYE', 'F', '1963-05-20'),
            ('ENFANT', 'Ousmane', 'CISSE', 'M', '1990-01-15'),
            ('ENFANT', 'Awa', 'CISSE', 'F', '1993-08-09'),
            ('ENFANT', 'Souleymane', 'CISSE', 'M', '2005-03-11'),
        ],
    },
    {
        'fonction': 'Chef de département Informatique',
        'matricule': '0802', 'prenoms': 'Fatou Kane', 'nom': 'GUEYE', 'sexe': 'F',
        'naissance': '1964-07-05', 'embauche': '1989-10-01', 'situation': 'MARIE',
        'email': 'fatoukane.gueye@sar.sn', 'adherent': '03', 'categorie': 'CADRE',
        'etat': 'Résilié', 'structure': (DSI, INFORMATIQUE, ''),
        'souscription': '2021-01-04', 'sortie': '2026-06-30',
        'famille': [
            ('EPOUX', 'Ibrahima', 'DIALLO', 'M', '1959-12-02'),
            ('ENFANT', 'Mamadou', 'DIALLO', 'M', '1989-06-14'),
            ('ENFANT', 'Sokhna', 'DIALLO', 'F', '1992-10-27'),
        ],
    },
    {
        'fonction': 'Chef de département Automatisation',
        'matricule': '1057', 'prenoms': 'Yaye Mbékhé', 'nom': 'SARR', 'sexe': 'F',
        'naissance': '1965-11-18', 'embauche': '1990-02-01', 'situation': 'MARIE',
        'email': 'yayembekhe.sarr@sar.sn', 'adherent': '03', 'categorie': 'CADRE',
        'etat': 'Radié', 'structure': (DSI, AUTOMATISATION, ''),
        'souscription': '2021-03-01', 'sortie': '2026-03-31',
        'famille': [
            ('EPOUX', 'Ousseynou', 'FAYE', 'M', '1958-04-19'),
            ('ENFANT', 'Cheikh', 'FAYE', 'M', '1991-07-03'),
            ('ENFANT', 'Ndeye', 'FAYE', 'F', '1995-09-21'),
            ('ASCENDANT', 'Khady', 'SARR', 'F', '1938-01-25'),
        ],
    },
    {
        'fonction': 'Chef de service Sécurité informatique',
        'matricule': '1042', 'prenoms': 'Ndeye Maguette', 'nom': 'CISSE', 'sexe': 'F',
        'naissance': '1988-05-22', 'embauche': '2013-03-01', 'situation': 'MARIE',
        'email': 'ndeyemaguette.cisse@sar.sn', 'adherent': '02', 'categorie': 'CADRE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV017'),
        'souscription': '2013-04-01',
        'famille': [
            ('EPOUX', 'Alioune', 'BA', 'M', '1985-03-08'),
            ('ENFANT', 'Mame Diarra', 'BA', 'F', '2015-11-12'),
            ('ENFANT', 'Serigne', 'BA', 'M', '2018-04-30'),
        ],
    },
    {
        'fonction': 'Chef de service SAP',
        'matricule': '0760', 'prenoms': 'Dieynaba Sileye', 'nom': 'DIAO', 'sexe': 'F',
        'naissance': '1990-09-14', 'embauche': '2015-01-05', 'situation': 'MARIE',
        'email': 'dsdiao@sar.sn', 'adherent': '02', 'categorie': 'CADRE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV006'),
        'souscription': '2015-02-02',
        'famille': [
            ('EPOUX', 'Moussa', 'THIAM', 'M', '1987-02-17'),
            ('ENFANT', 'Aïda', 'THIAM', 'F', '2017-06-05'),
        ],
    },
    {
        'fonction': 'Chef de service Réseaux et Systèmes',
        'matricule': '1043', 'prenoms': 'Dior', 'nom': 'DIENE', 'sexe': 'F',
        'naissance': '1991-02-08', 'embauche': '2016-04-01', 'situation': 'MARIE',
        'email': 'dior.diene@sar.sn', 'adherent': '02', 'categorie': 'CADRE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV004'),
        'souscription': '2016-05-02',
        'famille': [
            ('EPOUX', 'Babacar', 'SECK', 'M', '1988-08-23'),
            ('ENFANT', 'Fatou', 'SECK', 'F', '2019-10-14'),
        ],
    },
    {
        'fonction': 'Chef de service Automatisation',
        'matricule': '0949', 'prenoms': 'Moustapha', 'nom': 'MBAYE', 'sexe': 'M',
        'naissance': '1993-04-12', 'embauche': '2015-03-02', 'situation': 'MARIE',
        'email': 'mmbaye@sar.sn', 'adherent': '02', 'categorie': 'CADRE',
        'etat': 'Actif', 'structure': (DSI, AUTOMATISATION, 'SRV018'),
        'souscription': '2015-05-01',
        'famille': [
            ('EPOUSE', 'Aminata', 'SECK', 'F', '1996-07-03'),
            ('ENFANT', 'Yacine', 'MBAYE', 'F', '2019-02-14'),
            ('ENFANT', 'Ibrahima', 'MBAYE', 'M', '2022-06-05'),
            ('ASCENDANT', 'Khady', 'FALL', 'F', '1965-11-20'),
        ],
    },
    {
        'fonction': 'Analyste SOC',
        'matricule': '1056', 'prenoms': 'Aboubakrine', 'nom': 'FALL', 'sexe': 'M',
        'naissance': '1997-01-30', 'embauche': '2021-09-01', 'situation': 'MARIE',
        'email': 'aboubakrine.fall@sar.sn', 'adherent': '01', 'categorie': 'MAITRISE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV017'),
        'souscription': '2021-10-01',
        'famille': [
            ('EPOUSE', 'Mariama', 'SOW', 'F', '1999-05-09'),
            ('ENFANT', 'Amadou', 'FALL', 'M', '2023-03-18'),
        ],
    },
    {
        'fonction': 'Technicien Support et Maintenance',
        'matricule': '1037', 'prenoms': 'Michel', 'nom': 'COLY', 'sexe': 'M',
        'naissance': '1998-06-25', 'embauche': '2022-02-01', 'situation': 'MARIE',
        'email': 'michel.coly@sar.sn', 'adherent': '01', 'categorie': 'MAITRISE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV002'),
        'souscription': '2022-03-01',
        'famille': [
            ('EPOUSE', 'Bineta', 'MENDY', 'F', '2000-01-22'),
            ('ENFANT', 'Jean', 'COLY', 'M', '2024-07-07'),
        ],
    },
    {
        'fonction': 'Technicien Support et Maintenance',
        'matricule': '0945', 'prenoms': 'Mademba', 'nom': 'GAYE', 'sexe': 'M',
        'naissance': '2000-06-03', 'embauche': '2023-11-01', 'situation': 'CELIBATAIRE',
        'email': 'magaye@sar.sn', 'adherent': '01', 'categorie': 'MAITRISE',
        'etat': 'Actif', 'structure': (DSI, INFORMATIQUE, 'SRV002'),
        'souscription': '2023-12-01', 'famille': [],
    },
    {
        'fonction': 'Études et Développement',
        'matricule': '1051', 'prenoms': 'Abdoulaye', 'nom': 'LAH', 'sexe': 'M',
        'naissance': '2002-08-16', 'embauche': '2025-06-02', 'situation': 'CELIBATAIRE',
        'email': 'alah@sar.sn', 'adherent': '01', 'categorie': 'EMPLOYE',
        'etat': 'En Attente', 'structure': (DSI, INFORMATIQUE, 'SRV003'),
        'souscription': '2025-07-01', 'famille': [],
    },
]

# Le mot de passe du compte qui sert à l'application mobile (pwa/).
COMPTE_MOBILE = '0949'
MOT_DE_PASSE_MOBILE = '0000'

# Teintes des vignettes d'identité, dans l'ordre des fiches.
TEINTES = ['#1f6f8b', '#a3423c', '#3f704d', '#6b4c8a', '#b5651d', '#2e5d7c',
           '#8a3b5f', '#3d6b6b', '#7a5230', '#4a5568', '#5b7c99']

ADRESSES = ['POINT E', 'MERMOZ', 'SACRE-COEUR 3', 'ALMADIES', 'OUAKAM',
            'LIBERTE 6', 'PARCELLES ASSAINIES U26', 'YOFF', 'GRAND YOFF',
            'HLM GRAND MEDINE', 'KEUR MASSAR']


def vignette(prenoms, nom, teinte):
    """Vignette aux initiales, au format d'une photo d'identité (3/4)."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">'
        f'<rect width="240" height="320" fill="{teinte}"/>'
        '<text x="120" y="192" font-family="Arial, sans-serif" font-size="96" '
        f'fill="#ffffff" text-anchor="middle">{prenoms[:1]}{nom[:1]}</text></svg>'
    )
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode('utf-8')).decode()


class Command(BaseCommand):
    help = 'Remplace les participants par l’équipe de la DSI (onze fiches).'

    def add_arguments(self, parseur):
        parseur.add_argument(
            '--remplacer',
            action='store_true',
            help='Supprime les participants et familles existants avant de créer.',
        )

    def handle(self, *args, **options):
        documents = sum(
            modele.objects.exclude(participant=None).count()
            for modele in (BonPharmacie, LettreGarantie, BonOptique, LettreHospitalisation)
        )
        if documents:
            raise SystemExit(
                f'{documents} document(s) portent un participant : ils désigneraient '
                'des fiches supprimées. Traitez-les d’abord.'
            )
        if Participant.objects.exists() and not options['remplacer']:
            raise SystemExit(
                f'{Participant.objects.count()} participant(s) en base. '
                'Relancez avec --remplacer pour les remplacer.'
            )

        with transaction.atomic():
            self.completer_structure()
            photo_mobile = self.oublier_les_anciens()
            self.creer(photo_mobile)

    # --- Étapes ---------------------------------------------------------------

    def completer_structure(self):
        """Les entités que l'organigramme nomme et que le référentiel ignorait."""
        for code, libelle, type_, parent in STRUCTURE:
            _, cree = StructureEntite.objects.get_or_create(
                code=code, defaults={'libelle': libelle, 'type': type_, 'parent': parent}
            )
            if cree:
                self.stdout.write(f'  Structure : {code} « {libelle} » ajouté.')

    def oublier_les_anciens(self):
        """
        Efface les fiches en place. Rend la photo du compte mobile, seule chose
        qui mérite de survivre : c'est une vraie photo, pas une vignette.
        """
        photo = (
            Participant.objects.filter(matricule=COMPTE_MOBILE)
            .values_list('photo', flat=True)
            .first()
        )
        TauxExceptionnel.objects.all().delete()
        Beneficiaire.objects.all().delete()
        supprimes = Participant.objects.count()
        Participant.objects.all().delete()
        if supprimes:
            self.stdout.write(f'  {supprimes} participant(s) et leur famille effacés.')
        return photo if photo and not photo.startswith('data:image/svg') else ''

    def creer(self, photo_mobile):
        familles = 0
        for rang, personne in enumerate(EQUIPE):
            direction, departement, service = personne['structure']
            photo = (
                photo_mobile
                if personne['matricule'] == COMPTE_MOBILE and photo_mobile
                else vignette(personne['prenoms'], personne['nom'], TEINTES[rang])
            )
            fiche = {
                'matricule': personne['matricule'],
                'nom': personne['nom'],
                'prenoms': personne['prenoms'],
                'sexe': personne['sexe'],
                'photo': photo,
                'nationalite': 'SEN',
                'typePiece': 'CIN',
                'numeroPiece': f'{1 if personne["sexe"] == "M" else 2}'
                               f'{personne["naissance"][:4]}{personne["matricule"]}00',
                'situationFamiliale': personne['situation'],
                'dateNaissance': personne['naissance'],
                'lieuNaissance': 'DAKAR',
                'adresse': ADRESSES[rang],
                'mobile': f'+221 77 {700 + rang} {10 + rang} {20 + rang}',
                'region': 'Dakar',
                'email': personne['email'],
                'dateEmbauche': personne['embauche'],
                'typeContrat': 'CDI',
                'categorie': personne['categorie'],
                'direction': direction,
                'departement': departement,
                'service': service,
                'adherent': personne['adherent'],
                'numeroFiche': personne['matricule'],
                'numeroContrat': f'IPM-{personne["souscription"][:4]}-{personne["matricule"]}',
                'dateSouscription': personne['souscription'],
                'etat': personne['etat'],
                # L'état du contrat et l'autre date de sortie se déduisent de
                # l'état : le serializer les pose (cf. _accorder_la_sortie).
                'dateResiliation': personne.get('sortie', '') if personne['etat'] == 'Résilié' else '',
                'dateRadiation': personne.get('sortie', '') if personne['etat'] == 'Radié' else '',
            }
            serializer = ParticipantSerializer(data=fiche)
            serializer.is_valid(raise_exception=True)
            participant = serializer.save()

            for lien, prenoms, nom, sexe, naissance in personne['famille']:
                membre = BeneficiaireSerializer(data={
                    'typeBenef': lien,
                    'prenoms': prenoms,
                    'nom': nom,
                    'matriculePart': participant.matricule,
                    'adresse': participant.adresse,
                    'dateNaissance': naissance,
                    'lieuNaissance': 'DAKAR',
                    'sexe': sexe,
                    # Un dossier radié emporte celui de sa famille.
                    'etat': 'Radié' if participant.etat == 'Radié' else 'Actif',
                })
                membre.is_valid(raise_exception=True)
                membre.save()
            familles += len(personne['famille'])

            self.stdout.write(
                f'  {participant.matricule}  {personne["adherent"]}  '
                f'{"retraité" if participant.retraite else "activité"}  '
                f'{participant.etat:<11} {participant.nom_complet:<24} '
                f'{personne["fonction"]}'
            )

        mobile = Participant.objects.get(matricule=COMPTE_MOBILE)
        mobile.definir_mot_de_passe(MOT_DE_PASSE_MOBILE)
        mobile.save(update_fields=['mot_de_passe'])

        self.stdout.write(self.style.SUCCESS(
            f'Équipe DSI : {len(EQUIPE)} participant(s), {familles} ayant(s) droit. '
            f'Compte mobile {COMPTE_MOBILE} rétabli.'
        ))
