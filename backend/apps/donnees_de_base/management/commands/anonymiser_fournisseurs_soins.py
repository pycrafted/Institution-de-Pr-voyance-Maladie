"""
Anonymise les fournisseurs de soins : remplace les vrais prestataires (noms
réels d'établissements et de praticiens) par une **liste fictive** cohérente,
sans rapport avec les vrais. On garde la structure (code, spécialité, compte
comptable, dates) pour que les documents qui les citent par leur code
continuent de fonctionner.

La vraie base reste disponible dans la base d'analyse ``lamps_analyse``
(table ``fournisseurs``) : on ne perd rien, on masque seulement côté appli.

Noms fictifs selon la spécialité : les établissements prennent leur type + un
quartier de Dakar (« PHARMACIE MERMOZ », « CLINIQUE PLATEAU »…), les praticiens
un cabinet (« CABINET DENTAIRE FANN »…). Adresse, téléphones, contact, banque et
numéros officiels sont eux aussi fictifs ; les coordonnées GPS sont effacées.

    python manage.py anonymiser_fournisseurs_soins
    python manage.py anonymiser_fournisseurs_soins --seed 42   # reproductible
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.models import FournisseurDeSoins

# Spécialité -> préfixe du nom fictif. Absente = nom laissé tel quel (générique
# ou technique : « FOURN. DIVERS SOINS MDX » 99, « VALIDATION IPM » 98).
PREFIXES = {
    '00': 'CABINET MEDICAL',
    '01': 'LABORATOIRE',
    '02': "CENTRE D'IMAGERIE",
    '03': 'HOPITAL',
    '04': 'OPTIQUE',
    '05': 'CABINET DENTAIRE',
    '06': 'PHARMACIE',
    '07': 'CABINET GYNECOLOGIE',
    '08': 'CLINIQUE',
    '09': 'CABINET PEDIATRIE',
    '10': 'CABINET DERMATOLOGIE',
    '11': 'CABINET CARDIOLOGIE',
    '12': 'CABINET GASTRO-ENTEROLOGIE',
    '13': 'CABINET OPHTALMOLOGIE',
    '14': 'CABINET ALLERGOLOGIE',
    '15': 'CABINET ORL',
    '16': 'CABINET CHIRURGIE',
    '17': 'AMBULANCES',
    '18': 'CABINET NEUROLOGIE',
    '19': 'CABINET RHUMATOLOGIE',
    '20': 'CABINET UROLOGIE',
    '21': 'CABINET PNEUMOLOGIE',
    '22': 'CABINET ORTHOPHONIE',
    '23': 'CABINET PODOLOGIE',
    '25': 'CABINET ONCOLOGIE',
    '26': 'CABINET ORTHOPEDIE',
    '27': 'CABINET ENDOCRINOLOGIE',
    '28': 'CABINET PSYCHIATRIE',
    '40': 'FOURNISSEUR MEDICAL',
    '47': 'CABINET KINESITHERAPIE',
    '49': 'CABINET ETHIOPATHIE',
    '51': 'CABINET NEPHROLOGIE',
    '52': 'CENTRE DE DIALYSE',
    '53': 'CENTRE AUDITION',
    '54': 'CENTRE DE SANTE',
    '99': 'FOURNISSEUR MEDICAL',
}

# Préfixe par défaut pour une spécialité non listée.
PREFIXE_DEFAUT = 'FOURNISSEUR MEDICAL'

# Fiches génériques/techniques à ne PAS renommer (ni anonymiser) : le
# prestataire fourre-tout et la validation IPM.
NOMS_SENTINELLES = {'FOURNISSEURS DIVERS SOINS'}
SPECIALITES_TECHNIQUES = {'98'}

# Quartiers / localités (région de Dakar surtout) : qualifient le nom et servent
# d'adresse fictive.
LIEUX = [
    'PLATEAU', 'MEDINA', 'FANN', 'POINT E', 'MERMOZ', 'SACRE-COEUR', 'OUAKAM',
    'NGOR', 'YOFF', 'ALMADIES', 'GRAND DAKAR', 'HLM', 'GRAND YOFF', 'LIBERTE 6',
    'SICAP BAOBABS', 'DIEUPPEUL', 'CASTORS', 'GUEULE TAPEE', 'COLOBANE',
    'PIKINE', 'GUEDIAWAYE', 'PARCELLES ASSAINIES', 'THIAROYE', 'RUFISQUE',
    'BARGNY', 'KEUR MASSAR', 'PATTE D’OIE', 'HANN', 'BEL-AIR', 'ZONE A',
    'ZONE B', 'AMITIE', 'NORD FOIRE', 'CITE KEUR GORGUI', 'DIAMNIADIO',
    'BAMBILOR', 'MBAO', 'MALIKA', 'YEUMBEUL', 'CAMBERENE', 'FASS', 'DERKLE',
    'SCAT URBAM', 'LIBERTE 5', 'OUEST FOIRE', 'NGOR ALMADIES', 'TOUBA',
    'THIES', 'MBOUR', 'SAINT-LOUIS',
]

PRENOMS_M = [
    'Mamadou', 'Ibrahima', 'Ousmane', 'Cheikh', 'Modou', 'Moussa', 'Alioune',
    'Babacar', 'Lamine', 'Serigne', 'Amadou', 'Malick', 'Assane', 'Souleymane',
    'Elhadji', 'Saliou', 'Djibril', 'Mansour', 'Oumar', 'Abdoulaye',
]
PRENOMS_F = [
    'Awa', 'Fatou', 'Aminata', 'Mariama', 'Ndeye', 'Khady', 'Aissatou',
    'Rokhaya', 'Coumba', 'Astou', 'Bineta', 'Sokhna', 'Adama', 'Dior',
    'Seynabou', 'Nafissatou', 'Maimouna', 'Ramatoulaye', 'Oulimata', 'Rama',
]
NOMS = [
    'Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Diallo', 'Gueye', 'Sarr', 'Sy',
    'Faye', 'Thiam', 'Niang', 'Sall', 'Kane', 'Diouf', 'Seck', 'Camara',
    'Dia', 'Ndour', 'Toure', 'Mbengue', 'Diagne', 'Lo', 'Sene', 'Cisse',
]
BANQUES = [
    'CBAO', 'SGBS', 'BICIS', 'ECOBANK', 'BOA SENEGAL', 'UBA', 'BHS',
    'ORABANK', 'CORIS BANK', 'BANQUE ATLANTIQUE',
]


class Command(BaseCommand):
    help = "Remplace les fournisseurs de soins réels par une liste fictive cohérente."

    def add_arguments(self, parser):
        parser.add_argument('--seed', type=int, default=None)

    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])

        fournisseurs = list(
            FournisseurDeSoins.objects.select_related('specialite').all()
        )
        utilises = set()

        def nom_unique(base):
            nom, n = base, 1
            while nom.upper() in utilises:
                n += 1
                nom = f'{base} {n}'
            utilises.add(nom.upper())
            return nom

        def tel_fixe():
            return f'33 8{random.randint(0, 99):02d} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'

        def tel_mobile():
            return (
                f'{random.choice(["70", "75", "76", "77", "78"])} '
                f'{random.randint(100, 999)} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'
            )

        def slug(nom):
            return ''.join(c for c in nom.lower() if c.isalnum())

        modifies = 0
        with transaction.atomic():
            for f in fournisseurs:
                code_spe = f.specialite.code if f.specialite_id else ''
                # On garde le prestataire fourre-tout et la validation IPM.
                if (f.libelle or '').strip().upper() in NOMS_SENTINELLES or (
                    code_spe in SPECIALITES_TECHNIQUES
                ):
                    continue
                prefixe = PREFIXES.get(code_spe, PREFIXE_DEFAUT)
                lieu = random.choice(LIEUX)
                f.libelle = nom_unique(f'{prefixe} {lieu}')

                f.adresse = f'{lieu}, DAKAR'
                f.telephone = tel_fixe()
                f.mobile = tel_mobile()
                f.email = f'contact@{slug(f.libelle)[:24]}.sn'
                f.fax = ''
                f.bp = f'BP {random.randint(1000, 9999)} DAKAR'
                f.site_web = ''
                f.region = 'Dakar'
                f.pays = 'Sénégal'
                f.latitude = None
                f.longitude = None

                masculin = random.random() < 0.5
                f.contact_prenoms = random.choice(PRENOMS_M if masculin else PRENOMS_F)
                f.contact_nom = random.choice(NOMS)
                f.contact_fonction = random.choice(
                    ['Gérant', 'Directeur', 'Responsable', 'Secrétaire', 'Comptable']
                )
                f.contact_telephone = tel_fixe()
                f.contact_mobile = tel_mobile()

                # Coordonnées bancaires fictives.
                f.banque_nom = random.choice(BANQUES)
                f.banque_code = f'SN{random.randint(1, 199):03d}'
                f.guichet_code = f'{random.randint(0, 99999):05d}'
                f.compte_bancaire = f'{random.randint(0, 10**12 - 1):012d}'
                f.cle_rib = f'{random.randint(1, 99):02d}'

                # Numéros officiels fictifs.
                f.ninea = f'{random.randint(0, 10**9 - 1):09d}'
                f.rc_numero = f'SN-DKR-{random.randint(2005, 2024)}-{random.randint(1, 99999)}'
                f.carte_numero = f'{random.randint(1000, 999999)}'
                f.carte_autorite = 'Ministère de la Santé'
                f.autorisation_numero = f'{random.randint(100, 9999)}/MSAS'

                f.save()
                modifies += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Fournisseurs de soins anonymisés : {modifies} sur {len(fournisseurs)} '
                '(les génériques/techniques — divers, validation — gardent leur nom).'
            )
        )
