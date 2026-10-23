"""
Charge le jeu de départ des référentiels de Données de base.

Reprend les valeurs initiales du frontend (services/referentiels.js) pour que
l'API serve d'emblée les mêmes données. Idempotent : relançable sans doublon.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from donnees_de_base.models import (
    Acte,
    ArticleAchat,
    FournisseurDeSoins,
    FournisseurDivers,
    JournalComptable,
    Medicament,
    Specialite,
    StructureEntite,
    TypeBeneficiaire,
    TypePrestation,
)

# Lien de parenté entre le bénéficiaire et le participant (liste fermée).
# « AUTRE » (code 6) retiré volontairement : fourre-tout non souhaité.
TYPES_BENEFICIAIRES = [
    'PARTICIPANT',
    'EPOUSE',
    'ENFANT',
    'EPOUX',
    'ASCENDANT',
]

# Natures de prestation, reprises à l'identique de LAMPS (plan comptable réel,
# comptes 602xx). Numérotation avec ses trous d'origine. Compte = 6020 + code.
TYPES_PRESTATIONS = [
    ('00', 'VISITE'),
    ('01', 'ANALYSES BIO-MEDICALES'),
    ('02', 'RADIOLOGIE'),
    ('03', 'SEJOUR HOSPITAL-CLINIQUE'),
    ('04', 'OPTIQUE'),
    ('05', 'CONSULTATION DENTAIRE'),
    ('06', 'PHARMACIE'),
    ('07', 'CONSULTATION GYNÉCOLOGIE'),
    ('08', 'ACCOUCHEMENT-MATERNITE'),
    ('09', 'CONSULTATION PÉDIATRIE'),
    ('10', 'CONSULTATION DERMATOLOGIE'),
    ('11', 'CONSULTATION CARDIOLOGIE'),
    ('12', 'CONSULTATION GASTROLOGIE-ENDOSCOPIE'),
    ('13', 'CONSULTATION OPHTALMOLOGIE'),
    ('14', 'ECHOGRAPHIE'),
    ('15', 'CONSULTATION O.R.L'),
    ('16', 'CONSULTATION CHIRURGIE'),
    ('17', 'TRANSPORT MALADES'),
    ('18', 'CONSULTATION NEUROLOGIE'),
    ('19', 'CONSULTATION RHUMATOLOGIE/ORTHOPEDIE'),
    ('20', 'CONSULTATION UROLOGIE'),
    ('21', 'CONSULTATION PNEUMO-ALLERGOLOGIE'),
    ('22', 'SCANNER'),
    ('23', 'EVACUATION SANITAIRE EXT.'),
    ('24', 'IRM'),
    ('25', 'CONSULTATION ONCOLOGIE'),
    ('26', 'CONSULTATION ORTHOPEDIE'),
    ('27', 'ENDOCRINOLOGIE'),
    ('28', 'CONSULTATION PSYCHIATRIE'),
    ('29', 'NEO NATALOGIE'),
    ('30', 'SOINS GENERALISTES'),
    ('31', 'SOINS DENTAIRES'),
    ('32', 'SOINS / GYNECOLOGIE'),
    ('33', 'SOINS / PEDIATRIE'),
    ('34', 'SOINS / DERMATOLOGIE'),
    ('35', 'SOINS CARDIOLOGIE'),
    ('36', 'SOINS / GASTROLOGIE - ENDOSCOPIE'),
    ('37', 'SOINS / OPHTALMOLOGIE'),
    ('38', 'SOINS / NEUROLOGIE'),
    ('39', 'SOINS / RHUMATOLOGIE'),
    ('40', 'SOINS / UROLOGIE'),
    ('41', 'SOINS / PNEUMO-ALLERGOLOGIE'),
    ('42', 'SOINS / PSYCHIATRIE'),
    ('43', 'SOINS / O.R.L.'),
    ('44', 'ACTES OPERATOIRES'),
    ('45', 'SEANCES D’ORTHOPHONIE'),
    ('46', 'SOINS ONCOLOGIE'),
    ('47', 'SEANCES DE KINESI'),
    ('48', 'CONSULTATION ORTHOPHONIE'),
    ('49', 'CONSULTATION ETIOPATHIE'),
    ('50', 'CONSULTATION PODOLOGIE'),
    ('51', 'CONSULTATION NEPHROLOGIE'),
    ('52', 'SEANCES DE DIALYSE'),
    ('53', 'AUDIOPROTHESISTE'),
    ('54', 'HEMATOLOGIE'),
    ('55', 'HOSPITALISATION ADHERENT MUTUELLE'),
    ('56', 'consultation'),
    ('57', 'SEANCES DE KINESI'),
    ('58', 'SEANCES DE REEDUCATION'),
    ('59', 'MAMMOGRAPHIE'),
    ('91', 'FACTURES A RECEVOIR IPM'),
    ('92', 'FACTURES A RECEVOIR CMMC'),
    ('99', 'SOINS DIVERS'),
]

# Spécialités des fournisseurs de soins, reprises à l'identique de LAMPS
# (plan comptable réel, comptes 400xx). Compte = 4000 + code.
SPECIALITES = [
    ('00', 'GENERALISTES'),
    ('01', 'BIOLOGISTES'),
    ('02', 'RADIOLOGUES'),
    ('03', 'HOPITAUX'),
    ('04', 'OPTIQUE MEDICALE'),
    ('05', 'CHIRURGIENS DENTISTES'),
    ('06', 'PHARMACIES'),
    ('07', 'GYNECOLOGUES'),
    ('08', 'CLINIQUES'),
    ('09', 'PEDIATRES'),
    ('10', 'DERMATOLOGUES'),
    ('11', 'CARDIOLOGUES'),
    ('12', 'GASTEROLOGUES'),
    ('13', 'OPHTALMOLOGUES'),
    ('14', 'ALLERGOLOGUES'),
    ('15', 'ORL'),
    ('16', 'CHIRURGIENS'),
    ('17', 'TRANSPORT DE MALADES'),
    ('18', 'NEUROLOGUES'),
    ('19', 'RHUMATOLOGUES/ORTHOPEDISTES'),
    ('20', 'UROLOGUES'),
    ('21', 'PNEUMOLOGUES'),
    ('22', 'ORTHOPHONISTE'),
    ('23', 'PODOLOGUES'),
    ('25', 'ONCOLOGUES'),
    ('26', 'ORTHOPEDISTES'),
    ('27', 'ENDOCRINOLOGUES'),
    ('28', 'PSYCHIATRES'),
    ('40', 'AUTRES FOURNISSEURS'),
    ('47', 'KINESITHERAPEUTES'),
    ('49', 'ETHIOPATHES'),
    ('51', 'NEPHROLOGUES'),
    ('52', 'DIALYSE'),
    ('53', 'AUDIOPROTHESISTE'),
    ('54', 'CENTRES DE SANTE'),
    ('98', 'VALIDATION IPM'),
    ('99', 'FOURN. DIVERS SOINS MDX'),
]

# Articles d'achat, repris de l'application d'origine : [code, désignation,
# prix unitaire, compte de rattachement]. Codes ART + rang (non contigus, comme
# à l'origine où ils ont été attribués au fil de l'eau). Désignations en casse
# normale, comme à l'écran.
ARTICLES_ACHAT = [
    ['ART0001', 'Carton Papier A4 (5 Rames)', 12500, '604160'],
    ['ART0002', 'Calculatrice', 5000, '604700'],
    ['ART0003', 'Bic Bleu (Paquet de 50)', 3000, '604700'],
    ['ART0004', 'Bic Noir (Paquet de 50)', 3000, '604700'],
    ['ART0005', 'Bic Rouge (Paquet de 50)', 3000, '604700'],
    ['ART0006', 'Boîte Archive (Carton de 30)', 15750, '604700'],
    ['ART0007', 'Chemise Cartonnée (Paquet de 100)', 6000, '604700'],
    ['ART0008', 'Sous Chemise (Paquet de 100)', 1900, '604700'],
    ['ART0009', 'Enveloppe Kraft A5 (Paquet de 100)', 2600, '604700'],
    ['ART0010', 'Enveloppe Kraft A4 (Paquet de 100)', 4500, '604700'],
    ['ART1000', 'Carton Enveloppe Bull 11 X 16 (Pqt de 500)', 7000, '604700'],
    ['ART1001', 'Agrafeuse (6-8mm)', 12500, '604700'],
]


# Journaux comptables : [code, libellé, type, compte]. Type et compte
# facultatifs (avoirs, clôture…). Codes classés comme des chaînes.
# Les 32 journaux de l'application d'origine, repris à l'identique de sa table
# `journaux` (code, libellé, type, compte de rattachement). Beaucoup n'ont ni
# type ni compte - c'est le cas réel, on ne l'invente pas. Le journal « IF »
# (imputation facture) est de type RETENUE ; les cotisations portent des
# comptes de produits 701xxx ; les banques vont de B1 à B10 (521xxx).
JOURNAUX_COMPTABLES = [
    ['IF', 'IMPUTATION FACTURE', 'RETENUE', ''],
    ['RAN', 'REPORT A NOUVEAU', 'REPORT', ''],
    ['RIB', 'REMBOURSEMENT PAR BANQUE', '', ''],
    ['RIC', 'REMBOURSEMENT PAR COMPENSE', '', ''],
    ['OM', 'ORANGE MONEY', 'TRANSFERT', '571200'],
    ['RP', 'REMBT FRAIS MEDICAUX PARTICIPANT', '', ''],
    ['SAL', 'JOURNAL DES SALAIRES', '', ''],
    ['RA', 'JOURNAL DES REMBOURSEMENTS ASSURANCES', '', ''],
    ['02', 'JOURNAL CAISSE LOCALE', 'CAISSE', '571000'],
    ['OD', 'JOURNAL DES OPERATIONS DIVERSES', '', ''],
    ['FG', 'JOURNAL DES FRAIS GENERAUX', 'ACHAT', ''],
    ['OP', 'ORDRE DE PAIEMENT', '', ''],
    ['C500', 'COTISATION SALARIALE IPM', 'COTISATION', '701500'],
    ['C510', 'COTISATION SALARIALE CSM', 'COTISATION', '701510'],
    ['C530', 'COTISATION SALARIALE CMMC', 'COTISATION', '701530'],
    ['C651', 'COTISATION CMMCR', 'COTISATION', '701651'],
    ['C662', 'COTISATION MSRNC-SAR', 'COTISATION', '701662'],
    ['C900', 'COTISATION PATRONALE IPM', 'COTISATION', '701900'],
    ['C910', 'COTISATION PATRONALE CSM', 'COTISATION', '701910'],
    ['C920', 'COTISATION PATRONALE CSM', 'COTISATION', '701920'],
    ['C930', 'COTISATION PATRONALE CMMC', 'COTISATION', '701930'],
    ['B1', 'CREDIT DU SENEGAL IPM', 'BANQUE', '521100'],
    ['B2', 'CREDIT DU SENEGAL CMMC', 'BANQUE', '521200'],
    ['B3', 'CREDIT DU SENEGAL CSM', 'BANQUE', '521300'],
    ['B4', 'ECOBANK IPM', 'BANQUE', '521400'],
    ['B5', 'ECOBANK CMMC', 'BANQUE', '521500'],
    ['B6', 'CREDIT DU SENEGAL CMMCR-SAR', 'BANQUE', '521600'],
    ['B7', 'ECOBANK IPM FONCTIONNEMENT', 'BANQUE', '521700'],
    ['B8', 'ECOBANK CMMC FONCTIONNEMENT', 'BANQUE', '521800'],
    ['B9', 'ECOBANK CSM', 'BANQUE', '521900'],
    ['B10', 'ECOBANK MSRNC', 'BANQUE', '521610'],
    ['AV', 'JOURNAL AVOIR', '', ''],
]

# Catalogue pharmaceutique. Les treize premières lignes sont relevées de
# l'application d'origine ; les suivantes sont engendrées pour atteindre un
# volume réaliste, avec des codes déterministes. Portage fidèle du générateur
# du frontend (services/referentiels.js → medicaments()).
_MEDICAMENTS_RELEVES = [
    ['7112216', 'A CERUMEN 2ML DOSE B/10'],
    ['7080479', 'A DERMA EXOMEGA CR T/200ML'],
    ['7673423', 'A DERMA EXOMEGA LAIT CORPS PEAU F/400ML'],
    ['6267922', 'A DERMA PAIN LAIT AVOINE 100G'],
    ['6614074', 'A PAR AEROSOL 125G FL/200ML'],
    ['8040192', 'A-QUIN SUSP ORALE F/60ML'],
    ['2037272', 'ACARILBIAL SOL EXT F/200ML'],
    ['8236363', 'ACCU CHEK ACTIVE BDLETTE B/25'],
    ['8236400', 'ACCU CHEK ACTIVE BDLETTE B/50'],
    ['7706039', 'ACCU CHEK ACTIVE LECT GLYC MG/DL KIT'],
    ['7957184', 'ACCU CHEK GO BDELETTE B/50'],
    ['8234683', 'ACCU CHEK GO BDLETTE B/25'],
    ['7957155', 'ACCU CHEK GO LECT GLYC MG/DL KIT'],
]

_MEDICAMENTS_MOLECULES = [
    'ACETYLCYSTEINE', 'ACICLOVIR', 'ALBENDAZOLE', 'ALLOPURINOL', 'AMLODIPINE',
    'AMOXICILLINE', 'AMPICILLINE', 'ARTEMETHER LUMEFANTRINE', 'ASPIRINE',
    'ATENOLOL', 'ATORVASTATINE', 'AZITHROMYCINE', 'BECLOMETASONE', 'BETAHISTINE',
    'BISOPROLOL', 'BROMHEXINE', 'CAPTOPRIL', 'CARBAMAZEPINE', 'CEFIXIME',
    'CEFTRIAXONE', 'CETIRIZINE', 'CHARBON ACTIVE', 'CIPROFLOXACINE',
    'CLARITHROMYCINE', 'CLOPIDOGREL', 'COTRIMOXAZOLE', 'DEXAMETHASONE',
    'DICLOFENAC', 'DIGOXINE', 'DOMPERIDONE', 'DOXYCYCLINE', 'ENALAPRIL',
    'ERYTHROMYCINE', 'ESOMEPRAZOLE', 'FER FOLATE', 'FLUCONAZOLE', 'FUROSEMIDE',
    'GENTAMICINE', 'GLIBENCLAMIDE', 'GLIMEPIRIDE', 'HYDROCHLOROTHIAZIDE',
    'IBUPROFENE', 'INSULINE ISOPHANE', 'IRBESARTAN', 'KETOCONAZOLE',
    'LANSOPRAZOLE', 'LEVOTHYROXINE', 'LORATADINE', 'LOSARTAN', 'MEBENDAZOLE',
    'METFORMINE', 'METHYLDOPA', 'METOCLOPRAMIDE', 'METRONIDAZOLE', 'MICONAZOLE',
    'NIFEDIPINE', 'OMEPRAZOLE', 'ONDANSETRON', 'PARACETAMOL', 'PENICILLINE V',
    'PHENOBARBITAL', 'PIROXICAM', 'PRAZIQUANTEL', 'PREDNISOLONE', 'QUININE',
    'RANITIDINE', 'RIFAMPICINE', 'SALBUTAMOL', 'SIMVASTATINE', 'SPIRONOLACTONE',
    'SULFADOXINE PYRIMETHAMINE', 'TRAMADOL', 'VALSARTAN', 'VITAMINE B COMPLEXE',
    'VITAMINE C', 'ZINC SULFATE',
]

_MEDICAMENTS_PRESENTATIONS = [
    'CP B/20', 'CP B/30', 'GELULE B/14', 'SIROP F/125ML', 'SACHET B/12',
    'INJ AMP B/6', 'CR T/30G', 'COLLYRE FL/10ML', 'SUPPO B/10', 'POUDRE FL/60ML',
]


def _actes():
    """
    Nomenclature des actes (hors pharmacie) relevée dans LAMPS, lue dans le
    fichier de données partagé avec la commande ``importer_actes``.
    """
    fichier = Path(__file__).resolve().parents[2] / 'data' / 'actes.json'
    with open(fichier, encoding='utf-8-sig') as flux:
        return [
            {
                'code': str(a.get('code', '')).strip(),
                'libelle': str(a.get('libelle', '')).strip(),
                'specialite': str(a.get('specialite', '')).strip(),
                'tarif': int(a.get('tarif') or 0),
                'exclus': bool(a.get('exclus', False)),
                'taux': int(a.get('taux') or 0),
            }
            for a in json.load(flux)
            if str(a.get('code', '')).strip()
        ]


def _medicaments():
    """Reproduit à l'identique le catalogue engendré côté frontend."""
    lignes = [list(paire) for paire in _MEDICAMENTS_RELEVES]
    for m, molecule in enumerate(_MEDICAMENTS_MOLECULES):
        # 2 à 4 présentations par molécule : varié sans gonfler.
        nb = 2 + (m % 3)
        for p in range(nb):
            presentation = _MEDICAMENTS_PRESENTATIONS[(m + p * 3) % len(_MEDICAMENTS_PRESENTATIONS)]
            lignes.append([None, f'{molecule} {presentation}'])

    entrees = []
    for i, (code, libelle) in enumerate(lignes):
        reste = (i * 137) % 9500
        entrees.append({
            'code': code or str(3000000 + i * 7),
            'libelle': libelle,
            'prestation': '06',
            'compte': '602006',
            # Un tarif à zéro signifie « pas de tarif négocié », cas fréquent.
            'tarif': 0 if i % 5 == 0 else 500 + reste - (reste % 5),
            'exclus': i % 17 == 0 and i > 0,
        })
    return entrees


# Fournisseurs divers : [compte, intitulé, adresse, téléphone], repris à
# l'identique de LAMPS (comptes 401xxx du plan comptable réel).
FOURNISSEURS_DIVERS = [
    ['401001', 'RECEVEUR DES POSTES / DAKAR COLIS POSTAUX', 'AVENUE MALICK SY / DAKAR', ''],
    ['401003', 'SENEGALAISE DE LIMPRIMERIE', '51 RUE ST MICHEL EX DR. THEZE', ''],
    ['401004', 'B.I.C. BUREAUTIQUE', '21 RUE MOUSSE X ESCARFAIT', ''],
    ['401005', 'IMPRIMERIE SAINT - PAUL', '4, RUE ELH MBAYE GUEYE X RUE ST -MICHEL DAKAR', ''],
    ['401006', 'A2SM INFORMATIQUE', 'KM 3,5 BLD DU CENTENAIRE DAKAR', ''],
    ['401007', 'G-DIS/ GALAS DISTRIBUTION INTERNATIONALE ET SERVICES', 'USINE BEN TALLY VILLA N2469 BP 10892 HLM5 DAKAR', ''],
    ['401008', 'BUROTIC DIFFUSION', 'RUE HUART X A. Le DANTEC BP 3749 - DAKAR', ''],
    ['401011', 'SONATEL', '', ''],
    ['401012', 'MASTER OFFICE /ESPACE SA', '27, Avenue G. POMPIDOU - DAKAR', ''],
    ['401014', 'SDE', 'Centre de Hann, Route du Front de Terre, BP : 224 Dakar (Sénégal)', '338393705'],
    ['401015', 'SENELEC', '28, rue Vincens, BP 93 Dakar; Sénégal', ''],
    ['401017', 'SENEGALAISE DE DISTRIBUTION ET D’IMPRESSION', 'LIBERTE 6 EXT VILLA 35', ''],
    ['401018', 'IMPRIMERIE MBOUP ET FILS', 'GUEDIAWAYE DAKAR', ''],
    ['401019', 'SIPREX SARL', '48 RUE MOUHAMED V', ''],
    ['401020', 'AMERICAN HOSPITAL OF PARIS', '63, boulevard victor hugo', ''],
    ['401021', 'GUSTAVE ROUSS', '114, RUE EDOUARD-VAILLANT 94805 VILLE JUIF CEDEX-FRANCE', ''],
]


# Organigramme de la SAR. Un tuple par type : (préfixe, [entités]). Chaque
# entité DEP/SRV est [libellé, code du parent] ; une direction n'a pas de parent.
# Le code est engendré : préfixe + rang sur trois chiffres (DIR001, DEP014…).
STRUCTURE = {
    'DIR': [
        'Direction Générale',
        'Direction Financière et Comptable',
        'Direction des Ressources Humaines',
        'Direction Technique',
        'Direction Commerciale',
        'Direction QHSE',
        'Direction des Systèmes d’Information',
        'Direction des Approvisionnements',
        'Direction Juridique',
        'Direction de l’Audit et du Contrôle Interne',
    ],
    'DEP': [
        ['Comptabilité Générale', 'DIR002'],
        ['Contrôle de Gestion', 'DIR002'],
        ['Trésorerie', 'DIR002'],
        ['Paie et Administration du Personnel', 'DIR003'],
        ['Formation et Développement des Compétences', 'DIR003'],
        ['Recrutement', 'DIR003'],
        ['Maintenance', 'DIR004'],
        ['Production', 'DIR004'],
        ['Laboratoire', 'DIR004'],
        ['Informatique', 'DIR007'],
        ['Achats', 'DIR008'],
        ['Logistique et Transport', 'DIR008'],
        ['Sécurité Industrielle', 'DIR006'],
        ['Environnement', 'DIR006'],
        ['Communication', 'DIR001'],
        ['Marchés et Contrats', 'DIR009'],
    ],
    'SRV': [
        ['Exploitation Réseau', 'DEP010'],
        ['Assistance aux Utilisateurs', 'DEP010'],
        ['Études et Développement', 'DEP010'],
        ['Infrastructure et Systèmes', 'DEP010'],
        ['Service Info Centre', 'DEP010'],
        ['Projets Applicatifs et SAP', 'DEP010'],
        ['IPM', 'DEP004'],
        ['REXAS', 'DEP008'],
        ['Preparation', 'DEP008'],
        ['Inspection', 'DEP007'],
        ['Métrologie', 'DEP009'],
        ['Magasin Général', 'DEP012'],
        ['Ordonnancement', 'DEP007'],
        ['Facturation', 'DEP001'],
        ['Recouvrement', 'DEP001'],
    ],
}


def _structure():
    """Aplati l'organigramme en lignes prêtes à insérer, codes engendrés."""
    lignes = []
    for prefixe, entites in STRUCTURE.items():
        for i, entite in enumerate(entites, start=1):
            libelle, parent = (entite, '') if isinstance(entite, str) else entite
            lignes.append({
                'code': f'{prefixe}{i:03d}',
                'libelle': libelle,
                'type': prefixe,
                'parent': parent,
            })
    return lignes


# Prestataires conventionnés : raison sociale, code de spécialité, adresse.
# Repris tels quels du jeu du frontend, pour que la mise en base ne change rien
# à ce que les écrans montraient jusqu'ici.
FOURNISSEURS_DE_SOINS = [
    ("HOPITAL PRINCIPAL DE DAKAR", '03', "1 AVENUE NELSON MANDELA - DAKAR"),
    ("HOPITAL ARISTIDE LE DANTEC", '03', "30 AVENUE PASTEUR - DAKAR"),
    ("HOPITAL FANN", '03', "AVENUE CHEIKH ANTA DIOP - DAKAR"),
    ("HOPITAL ABASS NDAO", '03', "AVENUE CHEIKH ANTA DIOP - DAKAR"),
    ("HOPITAL GENERAL IDRISSA POUYE", '03', "GRAND YOFF - DAKAR"),
    ("HOPITAL REGIONAL DE THIES", '03', "CITE MALICK SY - THIES"),
    ("CLINIQUE DU CAP", '08', "AVENUE PASTEUR - DAKAR"),
    ("CLINIQUE DE LA MADELEINE", '08', "18 AVENUE DES DIAMBARS - DAKAR"),
    ("CLINIQUE CASAHOUS", '08', "SACRE COEUR 3 - DAKAR"),
    ("CLINIQUE DE LA PAIX", '08', "MERMOZ - DAKAR"),
    ("CLINIQUE SOKHNA FATMA", '08', "HANN MARISTES - DAKAR"),
    ("CENTRE DE SANTE NABIL CHOUCAIR", '29', "CASTORS - DAKAR"),
    ("CENTRE DE SANTE GASPARD CAMARA", '29', "GRAND DAKAR - DAKAR"),
    ("CENTRE DE SANTE PHILIPPE MAGUILEN SENGHOR", '29', "YOFF - DAKAR"),
    ("CENTRE DE SANTE DE MBAO", '29', "MBAO - DAKAR"),
    ("CENTRE DE SANTE DE RUFISQUE", '29', "RUFISQUE"),
    ("PHARMACIE GUIGON", '06', "1 PLACE DE L’INDEPENDANCE - DAKAR"),
    ("PHARMACIE DU PLATEAU", '06', "RUE CARNOT - DAKAR"),
    ("PHARMACIE DE LA GARE", '06', "AVENUE MALICK SY - DAKAR"),
    ("PHARMACIE MAME DIARRA", '06', "GRAND YOFF - DAKAR"),
    ("PHARMACIE FANN HOCK", '06', "FANN HOCK - DAKAR"),
    ("PHARMACIE DES ALMADIES", '06', "ROUTE DES ALMADIES - DAKAR"),
    ("PHARMACIE KEUR GOR MACK", '06', "PARCELLES ASSAINIES U15 - DAKAR"),
    ("PHARMACIE DE MBAO", '06', "KM 18 ROUTE DE RUFISQUE - MBAO"),
    ("INSTITUT PASTEUR DE DAKAR", '28', "36 AVENUE PASTEUR - DAKAR"),
    ("LABORATOIRE BIO 24", '28', "SACRE COEUR 3 VDN - DAKAR"),
    ("LABORATOIRE MERMOZ", '28', "MERMOZ PYROTECHNIE - DAKAR"),
    ("LABORATOIRE BIOLABO", '28', "LIBERTE 6 - DAKAR"),
    ("LABORATOIRE DE L’OUEST", '28', "POINT E - DAKAR"),
    ("LABORATOIRE D’ANALYSES DU PLATEAU", '01', "RUE VINCENS - DAKAR"),
    ("CABINET DE BIOLOGIE MEDICALE SACRE-COEUR", '01', "SACRE COEUR 1 - DAKAR"),
    ("CABINET MEDICAL MEDINA", '00', "RUE 11 X 22 MEDINA - DAKAR"),
    ("CABINET DR SARR", '00', "LIBERTE 6 EXTENSION - DAKAR"),
    ("CABINET MEDICAL LES BAOBABS", '00', "SICAP BAOBABS - DAKAR"),
    ("CABINET MEDICAL DE NGOR", '00', "NGOR VILLAGE - DAKAR"),
    ("CENTRE D’IMAGERIE MEDICALE DE DAKAR", '02', "FANN RESIDENCE - DAKAR"),
    ("CABINET DE RADIOLOGIE SOLEIL", '02', "PARCELLES ASSAINIES - DAKAR"),
    ("CENTRE D’IMAGERIE SEA PLAZA", '02', "CORNICHE OUEST - DAKAR"),
    ("OPTIQUE DU FLEUVE", '04', "AVENUE LAMINE GUEYE - DAKAR"),
    ("GRAND OPTICAL SENEGAL", '04', "SEA PLAZA - DAKAR"),
    ("OPTIQUE 2000 DAKAR", '04', "AVENUE GEORGES POMPIDOU - DAKAR"),
    ("CABINET DENTAIRE ALMADIES", '05', "ROUTE DES ALMADIES - DAKAR"),
    ("CENTRE DENTAIRE POINT E", '05', "POINT E - DAKAR"),
    ("CABINET DENTAIRE DIEUPPEUL", '05', "DIEUPPEUL - DAKAR"),
    ("CABINET GYNECOLOGIQUE SAINT-LOUIS", '07', "HANN MARISTES - DAKAR"),
    ("CENTRE DE MATERNITE LES FLAMBOYANTS", '07', "OUAKAM - DAKAR"),
    ("CENTRE DE CARDIOLOGIE DE DAKAR", '09', "MERMOZ - DAKAR"),
    ("CABINET CARDIOLOGIQUE DU PLATEAU", '09', "RUE JULES FERRY - DAKAR"),
    ("CABINET DE DERMATOLOGIE FANN", '10', "FANN RESIDENCE - DAKAR"),
    ("CABINET DE PEDIATRIE LES BAOBABS", '11', "OUAKAM - DAKAR"),
    ("CENTRE PEDIATRIQUE ALBERT ROYER", '11', "FANN - DAKAR"),
    ("CENTRE OPHTALMOLOGIQUE DE DAKAR", '12', "POINT E - DAKAR"),
    ("CABINET D’OPHTALMOLOGIE SICAP", '12', "SICAP LIBERTE 2 - DAKAR"),
    ("CABINET ORL DE LA CORNICHE", '13', "CORNICHE OUEST - DAKAR"),
    ("CABINET DE NEUROLOGIE FANN", '14', "FANN - DAKAR"),
    ("CENTRE PSYCHIATRIQUE DE FANN", '15', "FANN - DAKAR"),
    ("CABINET DE RHUMATOLOGIE MERMOZ", '16', "MERMOZ - DAKAR"),
    ("CABINET DE GASTRO-ENTEROLOGIE PLATEAU", '17', "RUE DE THANN - DAKAR"),
    ("CABINET DE PNEUMOLOGIE YOFF", '18', "YOFF - DAKAR"),
    ("CABINET D’UROLOGIE LE DANTEC", '19', "AVENUE PASTEUR - DAKAR"),
    ("CENTRE DE DIALYSE DE DAKAR", '20', "GRAND YOFF - DAKAR"),
    ("CABINET D’ENDOCRINOLOGIE POINT E", '21', "POINT E - DAKAR"),
    ("CABINET DE CHIRURGIE GENERALE ALMADIES", '22', "ALMADIES - DAKAR"),
    ("CENTRE D’ORTHOPEDIE ET DE TRAUMATOLOGIE", '23', "GRAND YOFF - DAKAR"),
    ("CABINET D’ANESTHESIE DU CAP", '24', "AVENUE PASTEUR - DAKAR"),
    ("CENTRE DE KINESITHERAPIE VDN", '25', "VDN - DAKAR"),
    ("CABINET DE KINESITHERAPIE MERMOZ", '25', "MERMOZ - DAKAR"),
    ("CABINET DE SAGE-FEMME KEUR MAME FATIM", '26', "GUEDIAWAYE"),
    ("CABINET INFIRMIER LES PARCELLES", '27', "PARCELLES ASSAINIES - DAKAR"),
]

# Spécialité refuge des fiches dont le code n'existe plus (cf. migration 0019).
SPE_REFUGE = '40'  # AUTRES FOURNISSEURS

# Conventions dénoncées : la fiche reste, le prestataire sort du circuit.
_FDS_SUSPENDUS = {3, 18, 29, 44, 57}

_FDS_NOMS = ['NDIAYE', 'DIOP', 'SALL', 'FAYE', 'BA', 'SECK', 'GUEYE']
_FDS_PRENOMS = ['Awa', 'Cheikh', 'Mariama', 'Ibrahima']
_FDS_BANQUES = ['CBAO', 'ECOBANK', 'SGBS', 'BICIS']


def _fournisseurs_de_soins():
    """
    Reprend le jeu du frontend à l'identique, formules comprises : téléphones,
    pièces professionnelles et domiciliations y sont engendrés à partir du rang
    de la ligne. Les réécrire autrement ferait diverger la base de ce que les
    utilisateurs avaient sous les yeux.

    Beaucoup de fiches restent incomplètes, comme en pratique : une sur trois
    porte ses pièces et sa banque, une sur quatre son interlocuteur.
    """
    specialites = {s.code: s for s in Specialite.objects.all()}
    # Le jeu cite des spécialités que la migration 0019 a retirées pour coller
    # au LAMPS (« 24 », « 29 ») ; comme elle, on rabat ces fiches sur la
    # spécialité refuge. Sans cela, une base neuve ne se remplit pas.
    refuge = specialites[SPE_REFUGE]
    lignes = []
    for i, (libelle, code_specialite, adresse) in enumerate(FOURNISSEURS_DE_SOINS):
        complet = i % 3 == 0
        contact = i % 4 == 0
        lignes.append(
            {
                # Quatre chiffres, comme l'application d'origine (« 0001 »).
                'code': f'{i + 1:04d}',
                'libelle': libelle,
                'specialite': specialites.get(code_specialite, refuge),
                'adresse': adresse,
                'telephone': f'33 8{39 + i % 55} {10 + (i * 7) % 89} {10 + (i * 13) % 89}',
                'mobile': (
                    f'77 {100 + (i * 31) % 899} {10 + (i * 17) % 89} {10 + (i * 23) % 89}'
                    if complet
                    else ''
                ),
                'contact_nom': _FDS_NOMS[i % 7] if contact else '',
                'contact_prenoms': _FDS_PRENOMS[i % 4] if contact else '',
                'contact_fonction': 'Responsable administratif' if contact else '',
                'contact_mobile': f'77 {300 + i} {10 + i} {20 + i}' if contact else '',
                'carte_numero': f'CO/{2400 + i}' if complet else '',
                'rc_numero': f'SN-DKR-2019-B-{1000 + i * 7}' if complet else '',
                'ninea': str(4500000 + i * 131) if complet else '',
                'autorisation_numero': f'MSAS/DES/{900 + i}' if i % 5 == 0 else '',
                'banque_nom': _FDS_BANQUES[i % 4] if complet else '',
                'banque_code': f'SN0{10 + i % 9}' if complet else '',
                'guichet_code': f'0100{i % 10}' if complet else '',
                'compte_bancaire': str(100000000000 + i * 917)[:12] if complet else '',
                'cle_rib': str(10 + i % 89) if complet else '',
                'actif': i not in _FDS_SUSPENDUS,
            }
        )
    return lignes


class Command(BaseCommand):
    help = 'Charge le jeu de départ du module Données de base.'

    def handle(self, *args, **options):
        self._seed(
            'Types de bénéficiaire',
            TypeBeneficiaire,
            [
                {'code': str(i), 'libelle': libelle}
                for i, libelle in enumerate(TYPES_BENEFICIAIRES, start=1)
            ],
        )
        self._seed(
            'Types de prestation',
            TypePrestation,
            [
                {'code': code, 'libelle': libelle, 'compte': f'6020{code}'}
                for code, libelle in TYPES_PRESTATIONS
            ],
        )
        self._seed(
            'Spécialités',
            Specialite,
            [
                {'code': code, 'libelle': libelle, 'compte': f'4000{code}'}
                for code, libelle in SPECIALITES
            ],
        )
        # Purge des anciennes lignes génériques (codes 0001…, sans préfixe ART)
        # remplacées par le jeu fidèle à l'application d'origine.
        anciennes = ArticleAchat.objects.exclude(code__startswith='ART').delete()[0]
        if anciennes:
            self.stdout.write(f'Articles d’achat : {anciennes} ancienne(s) ligne(s) supprimée(s).')
        self._seed(
            'Articles d’achat',
            ArticleAchat,
            [
                {'code': code, 'libelle': libelle, 'prix_unitaire': prix, 'compte': compte}
                for code, libelle, prix, compte in ARTICLES_ACHAT
            ],
        )
        self._seed(
            'Journaux comptables',
            JournalComptable,
            [
                {'code': code, 'libelle': libelle, 'type': type_, 'compte': compte}
                for code, libelle, type_, compte in JOURNAUX_COMPTABLES
            ],
        )
        self._seed('Médicaments', Medicament, _medicaments())
        self._seed('Actes', Acte, _actes())
        self._seed(
            'Fournisseurs divers',
            FournisseurDivers,
            [
                {'code': code, 'libelle': libelle, 'adresse': adresse, 'telephone': telephone}
                for code, libelle, adresse, telephone in FOURNISSEURS_DIVERS
            ],
        )
        # Après les spécialités : chaque fiche pointe vers l'une d'elles, elles
        # doivent donc déjà exister en base.
        self._seed('Fournisseurs de soins', FournisseurDeSoins, _fournisseurs_de_soins())
        self._seed('Structure', StructureEntite, _structure())

    def _seed(self, titre, modele, lignes):
        """Crée les lignes manquantes ; ne touche pas à celles déjà présentes."""
        crees = 0
        for ligne in lignes:
            code = ligne.pop('code')
            _, cree = modele.objects.get_or_create(code=code, defaults=ligne)
            crees += int(cree)
        self.stdout.write(
            self.style.SUCCESS(
                f'{titre} : {crees} créé(s), {len(lignes) - crees} déjà présent(s).'
            )
        )
