"""
Charge le jeu de départ des référentiels de Données de base.

Reprend les valeurs initiales du frontend (services/referentiels.js) pour que
l'API serve d'emblée les mêmes données. Idempotent : relançable sans doublon.
"""

from django.core.management.base import BaseCommand

from donnees_de_base.models import (
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
TYPES_BENEFICIAIRES = [
    'PARTICIPANT',
    'EPOUSE',
    'ENFANT',
    'EPOUX',
    'ASCENDANT',
    'AUTRE',
]

# Actes médicaux remboursables. Compte = 6020 + code (sur deux chiffres).
TYPES_PRESTATIONS = [
    'VISITE',
    'ANALYSES BIO-MEDICALES',
    'RADIOLOGIE',
    'SEJOUR HOSPITAL-CLINIQUE',
    'OPTIQUE',
    'CONSULTATION DENTAIRE',
    'PHARMACIE',
    'CONSULTATION GYNÉCOLOGIE',
    'ACCOUCHEMENT-MATERNITE',
    'KINESITHERAPIE',
    'CONSULTATION SPECIALISTE',
    'ECHOGRAPHIE',
    'SCANNER',
    'IMAGERIE PAR RESONANCE MAGNETIQUE',
    'ELECTROCARDIOGRAMME',
    'CHIRURGIE AMBULATOIRE',
    'CHIRURGIE LOURDE',
    'PROTHESE DENTAIRE',
    'ORTHODONTIE',
    'VERRES CORRECTEURS',
    'MONTURE OPTIQUE',
    'LENTILLES DE CONTACT',
    'SOINS INFIRMIERS',
    'TRANSPORT SANITAIRE',
    'EVACUATION SANITAIRE',
    'HOSPITALISATION DE JOUR',
    'VACCINATION',
    'BILAN DE SANTE',
    'PROTHESE AUDITIVE',
    'APPAREILLAGE ORTHOPEDIQUE',
]

# Catégories de fournisseurs de soins conventionnés. Compte = 4000 + code.
SPECIALITES = [
    'GENERALISTES',
    'BIOLOGISTES',
    'RADIOLOGUES',
    'HOPITAUX',
    'OPTIQUE MEDICALE',
    'CHIRURGIENS DENTISTES',
    'PHARMACIES',
    'GYNECOLOGUES',
    'CLINIQUES',
    'CARDIOLOGUES',
    'DERMATOLOGUES',
    'PEDIATRES',
    'OPHTALMOLOGUES',
    'OTO-RHINO-LARYNGOLOGISTES',
    'NEUROLOGUES',
    'PSYCHIATRES',
    'RHUMATOLOGUES',
    'GASTRO-ENTEROLOGUES',
    'PNEUMOLOGUES',
    'UROLOGUES',
    'NEPHROLOGUES',
    'ENDOCRINOLOGUES',
    'CHIRURGIENS',
    'ORTHOPEDISTES',
    'ANESTHESISTES',
    'KINESITHERAPEUTES',
    'SAGES-FEMMES',
    'INFIRMIERS',
    'LABORATOIRES D’ANALYSES',
    'CENTRES DE SANTE',
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
JOURNAUX_COMPTABLES = [
    ['01', 'JOURNAL CAISSE SIEGE', 'CAISSE', '571100'],
    ['02', 'JOURNAL CAISSE LOCALE', 'CAISSE', '571000'],
    ['03', 'JOURNAL CAISSE ANTENNE NORD', 'CAISSE', '571200'],
    ['AC', 'JOURNAL DES ACHATS', 'ACHAT', '401000'],
    ['AV', 'JOURNAL AVOIR', '', ''],
    ['B1', 'CREDIT DU SENEGAL IPM', 'BANQUE', '521100'],
    ['B10', 'ECOBANK MSRNC', 'BANQUE', '521610'],
    ['B11', 'BICIS IPM', 'BANQUE', '521620'],
    ['B12', 'SGBS IPM', 'BANQUE', '521630'],
    ['B2', 'CREDIT DU SENEGAL CMMC', 'BANQUE', '521200'],
    ['B3', 'CREDIT DU SENEGAL CSM', 'BANQUE', '521300'],
    ['B4', 'ECOBANK IPM', 'BANQUE', '521400'],
    ['B5', 'ECOBANK CMMC', 'BANQUE', '521500'],
    ['B6', 'CREDIT DU SENEGAL CMMCR-SAR', 'BANQUE', '521600'],
    ['B7', 'ECOBANK IPM FONCTIONNEMENT', 'BANQUE', '521700'],
    ['B8', 'ECOBANK CMMC FONCTIONNEMENT', 'BANQUE', '521800'],
    ['B9', 'ECOBANK CSM', 'BANQUE', '521900'],
    ['C1', 'JOURNAL DES COTISATIONS IPM', 'COTISATION', '431100'],
    ['C2', 'JOURNAL DES COTISATIONS CMMC', 'COTISATION', '431200'],
    ['C3', 'JOURNAL DES COTISATIONS CSM', 'COTISATION', '431300'],
    ['OD', 'OPERATIONS DIVERSES', '', '471000'],
    ['R1', 'JOURNAL DES RETENUES SALAIRE', 'RETENUE', '422100'],
    ['R2', 'JOURNAL DES RETENUES PRESTATIONS', 'RETENUE', '422200'],
    ['RP', 'JOURNAL DE REPORT A NOUVEAU', 'REPORT', '120001'],
    ['T1', 'TRANSFERT INTER-CAISSES', 'TRANSFERT', '585100'],
    ['T2', 'TRANSFERT INTER-BANQUES', 'TRANSFERT', '585200'],
    ['V1', 'JOURNAL DES PRESTATIONS', 'ACHAT', '602000'],
    ['V2', 'JOURNAL DES REMBOURSEMENTS', 'ACHAT', '602100'],
    ['V3', 'JOURNAL DES SINISTRES', 'ACHAT', '602200'],
    ['ZZ', 'JOURNAL DE CLOTURE', '', '471200'],
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


# Fournisseurs divers : [compte, intitulé, adresse, téléphone]. Le reste de la
# fiche (email, banque…) est vide au départ, comme dans l'application d'origine.
FOURNISSEURS_DIVERS = [
    ['401001', 'RECEVEUR DES POSTES / DAKAR COLIS POSTAUX', 'AVENUE MALICK SY / DAKAR', ''],
    ['401003', 'SENEGALAISE DE LIMPRIMERIE', '51 RUE ST MICHEL EX DR. THEZE', '33 821 45 707'],
    ['401004', 'B.I.C. BUREAUTIQUE', '21 RUE MOUSSE X ESCARFAIT', '33 822 13 08'],
    ['401005', 'IMPRIMERIE SAINT - PAUL', '4, RUE ELH MBAYE GUEYE X RUE ST-MICHEL', ''],
    ['401006', 'A2SM INFORMATIQUE', 'KM 3,5 BLD DU CENTENAIRE DAKAR', '33 832 09 44'],
    ['401007', 'G-DIS/ GALAS DISTRIBUTION INTERNATIONALE ET SERVICES',
     'USINE BEN TALLY VILLA N2469 BP 10892', ''],
    ['401008', 'BUROTIC DIFFUSION', 'RUE HUART X A. LE DANTEC BP 3749 - DAKAR', '33 823 71 20'],
    ['401011', 'SONATEL', '', '33 839 10 10'],
    ['401012', 'MASTER OFFICE /ESPACE SA', '27, Avenue G. POMPIDOU - DAKAR', '33 889 44 44'],
    ['401014', 'SDE', 'Centre de Hann, Route du Front de Terre, BP 224', '33 839 37 37'],
    ['401015', 'SENELEC', '28, rue Vincens, BP 93 Dakar; Sénégal', '33 839 30 30'],
    ['401017', 'SENEGALAISE DE DISTRIBUTION ET D’IMPRESSION', 'LIBERTE 6 EXT VILLA 35', ''],
    ['401018', 'IMPRIMERIE MBOUP ET FILS', 'GUEDIAWAYE DAKAR', ''],
    ['401019', 'SIPREX SARL', '48 RUE MOUHAMED V', '33 821 09 91'],
    ['401020', 'AMERICAN HOSPITAL OF PARIS', '63, boulevard victor hugo', ''],
    ['401021', 'ORANGE SENEGAL', 'ROUTE DES ALMADIES - DAKAR', '33 859 90 00'],
    ['401022', 'SENEGALAISE DE L’AUTOMOBILE', 'KM 2,5 BLD DU CENTENAIRE - DAKAR', '33 849 60 60'],
    ['401023', 'CFAO MOTORS SENEGAL', 'KM 2,5 BLD DU CENTENAIRE - DAKAR', '33 839 99 99'],
    ['401024', 'ELTON OIL COMPANY', 'ZONE INDUSTRIELLE - DAKAR', '33 869 15 15'],
    ['401025', 'VIVO ENERGY SENEGAL', '01 PLACE DE L’INDEPENDANCE - DAKAR', '33 839 12 12'],
    ['401026', 'BUREAU VERITAS SENEGAL', 'ZONE PORTUAIRE - DAKAR', '33 849 44 00'],
    ['401027', 'DELTA SECURITE', 'SACRE COEUR 3 - DAKAR', '33 867 22 33'],
    ['401028', 'NETTOYAGE PRO SERVICES', 'GRAND YOFF - DAKAR', '33 855 10 10'],
    ['401029', 'LIBRAIRIE CLAIRAFRIQUE', '2 RUE SANDINIERY - DAKAR', '33 822 21 69'],
    ['401030', 'PAPETERIE MODERNE', 'AVENUE LAMINE GUEYE - DAKAR', ''],
    ['401031', 'POLYKROME', 'ZONE INDUSTRIELLE SODIDA - DAKAR', '33 869 77 77'],
    ['401032', 'GRAPHIPLUS', 'MERMOZ - DAKAR', ''],
    ['401033', 'AIR SENEGAL', 'AIBD - DIASS', '33 865 00 00'],
    ['401034', 'DAKAR DEM DIKK', 'THIAROYE - DAKAR', '33 834 00 00'],
    ['401035', 'HOTEL TERROU-BI', 'BOULEVARD MARTIN LUTHER KING - DAKAR', '33 839 90 39'],
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
    lignes = []
    for i, (libelle, code_specialite, adresse) in enumerate(FOURNISSEURS_DE_SOINS):
        complet = i % 3 == 0
        contact = i % 4 == 0
        lignes.append(
            {
                'code': f'{i + 1:03d}',
                'libelle': libelle,
                'specialite': specialites[code_specialite],
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
                {'code': f'{i:02d}', 'libelle': libelle, 'compte': f'6020{i:02d}'}
                for i, libelle in enumerate(TYPES_PRESTATIONS)
            ],
        )
        self._seed(
            'Spécialités',
            Specialite,
            [
                {'code': f'{i:02d}', 'libelle': libelle, 'compte': f'4000{i:02d}'}
                for i, libelle in enumerate(SPECIALITES)
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
