/**
 * Accès aux données des référentiels de la section « Données de base ».
 *
 * Migration en cours vers l'API IPM (Django). Les référentiels listés dans
 * ENDPOINTS_API sont servis par le backend ; les autres continuent de vivre en
 * localStorage le temps que leur endpoint existe. Aiguiller un référentiel de
 * plus = ajouter une ligne dans ENDPOINTS_API et retirer ses données statiques.
 *
 * Toutes les fonctions sont asynchrones : les composants ne voient pas d'où
 * viennent les données.
 */

import { request } from './api'

// =====================================================================
// Aiguillage backend
//
// clé du référentiel → chemin de son endpoint (relatif à API_BASE). Un
// référentiel absent de cette table reste servi par le localStorage ci-dessous.
// =====================================================================
const ENDPOINTS_API = {
  'types-beneficiaires': '/donnees-de-base/types-beneficiaires',
  'types-prestations': '/donnees-de-base/types-prestations',
  specialites: '/donnees-de-base/specialites',
  'articles-achat': '/donnees-de-base/articles-achat',
  'journaux-comptables': '/donnees-de-base/journaux-comptables',
  medicaments: '/donnees-de-base/medicaments',
  'fournisseurs-divers': '/donnees-de-base/fournisseurs-divers',
  'fournisseurs-de-soins': '/donnees-de-base/fournisseurs-de-soins',
  'demandes-agrement': '/donnees-de-base/demandes-agrement',
  structure: '/donnees-de-base/structure',
  // Module à part entière, monté à la racine de l'API (cf. backend/apps/adherents).
  adherents: '/adherents',
}

const servrParApi = (cle) => cle in ENDPOINTS_API

// =====================================================================
// Store mémoire — source synchrone unique
//
// Les référentiels servis par l'API sont copiés ici au démarrage
// (prechargerReferentiels), pour que les lectures synchrones — les cascades
// Direction → Département → Service de la fiche participant, qui se calculent
// pendant le rendu — disposent des données sans attendre le réseau.
//
// La base de données reste la source de vérité ; ce store n'est qu'une copie de
// travail, tenue à jour à chaque écriture pour ne jamais diverger de la base.
// =====================================================================
const magasin = {}

/**
 * Précharge en mémoire tous les référentiels servis par l'API. À appeler une
 * fois au démarrage de l'application, avant d'afficher les écrans qui lisent
 * ces données de façon synchrone.
 */
export async function prechargerReferentiels() {
  await Promise.all(
    Object.entries(ENDPOINTS_API).map(async ([cle, chemin]) => {
      magasin[cle] = await request(`${chemin}/`)
    }),
  )
}

// Le suffixe de version force le rechargement du jeu de départ quand celui-ci
// évolue, sans quoi les postes ayant déjà ouvert l'application garderaient
// l'ancien contenu en cache. v21 : participants enrichis (état, retraité,
// région) et nouveau jeu « beneficiaires » (familles) pour l'onglet Familles.
const CLE_STOCKAGE = 'ipm-referentiels-v24'

/**
 * Catégories de fournisseurs de soins conventionnés, et non spécialités
 * médicales académiques : c'est ce classement qui porte le compte comptable.
 *
 * Exporté parce que deux écrans en dépendent : le référentiel « Spécialités »
 * de Données de base, et le filtre de la liste des fournisseurs de soins. Les
 * codes ('00' à '29') sont le rang dans cette liste — la déclarer à deux
 * endroits reviendrait à laisser les deux dériver.
 */
export const SPECIALITES = [
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
].map((libelle, i) => ({ valeur: String(i).padStart(2, '0'), libelle }))

// Le catalogue pharmaceutique n’est plus statique : il est servi par le backend
// (cf. ENDPOINTS_API en tête de fichier).

/**
 * Prestataires conventionnés avec l'IPM : cliniques, pharmacies, laboratoires,
 * cabinets.
 *
 * L'écran « Fournisseurs de Soins » ne lit plus ce jeu : il est servi par le
 * backend, qui a été semé à partir de ces mêmes lignes (cf. la commande
 * seed_donnees_de_base). Il ne subsiste ici que pour les bons de pharmacie,
 * encore locaux, qui y puisent des pharmacies existantes — un bon dont le
 * prestataire serait introuvable se verrait tout de suite.
 *
 * À supprimer le jour où les bons de pharmacie passeront eux aussi en base.
 */
const fournisseursDeSoins = () =>
  [
    // --- Établissements hospitaliers -------------------------------------
    ['HOPITAL PRINCIPAL DE DAKAR', '03', '1 AVENUE NELSON MANDELA - DAKAR'],
    ['HOPITAL ARISTIDE LE DANTEC', '03', '30 AVENUE PASTEUR - DAKAR'],
    ['HOPITAL FANN', '03', 'AVENUE CHEIKH ANTA DIOP - DAKAR'],
    ['HOPITAL ABASS NDAO', '03', 'AVENUE CHEIKH ANTA DIOP - DAKAR'],
    ['HOPITAL GENERAL IDRISSA POUYE', '03', 'GRAND YOFF - DAKAR'],
    ['HOPITAL REGIONAL DE THIES', '03', 'CITE MALICK SY - THIES'],

    // --- Cliniques privées conventionnées --------------------------------
    ['CLINIQUE DU CAP', '08', 'AVENUE PASTEUR - DAKAR'],
    ['CLINIQUE DE LA MADELEINE', '08', '18 AVENUE DES DIAMBARS - DAKAR'],
    ['CLINIQUE CASAHOUS', '08', 'SACRE COEUR 3 - DAKAR'],
    ['CLINIQUE DE LA PAIX', '08', 'MERMOZ - DAKAR'],
    ['CLINIQUE SOKHNA FATMA', '08', 'HANN MARISTES - DAKAR'],

    // --- Centres de santé publics ----------------------------------------
    ['CENTRE DE SANTE NABIL CHOUCAIR', '29', 'CASTORS - DAKAR'],
    ['CENTRE DE SANTE GASPARD CAMARA', '29', 'GRAND DAKAR - DAKAR'],
    ['CENTRE DE SANTE PHILIPPE MAGUILEN SENGHOR', '29', 'YOFF - DAKAR'],
    ['CENTRE DE SANTE DE MBAO', '29', 'MBAO - DAKAR'],
    ['CENTRE DE SANTE DE RUFISQUE', '29', 'RUFISQUE'],

    // --- Pharmacies -------------------------------------------------------
    ['PHARMACIE GUIGON', '06', '1 PLACE DE L’INDEPENDANCE - DAKAR'],
    ['PHARMACIE DU PLATEAU', '06', 'RUE CARNOT - DAKAR'],
    ['PHARMACIE DE LA GARE', '06', 'AVENUE MALICK SY - DAKAR'],
    ['PHARMACIE MAME DIARRA', '06', 'GRAND YOFF - DAKAR'],
    ['PHARMACIE FANN HOCK', '06', 'FANN HOCK - DAKAR'],
    ['PHARMACIE DES ALMADIES', '06', 'ROUTE DES ALMADIES - DAKAR'],
    ['PHARMACIE KEUR GOR MACK', '06', 'PARCELLES ASSAINIES U15 - DAKAR'],
    ['PHARMACIE DE MBAO', '06', 'KM 18 ROUTE DE RUFISQUE - MBAO'],

    // --- Laboratoires et biologie ----------------------------------------
    ['INSTITUT PASTEUR DE DAKAR', '28', '36 AVENUE PASTEUR - DAKAR'],
    ['LABORATOIRE BIO 24', '28', 'SACRE COEUR 3 VDN - DAKAR'],
    ['LABORATOIRE MERMOZ', '28', 'MERMOZ PYROTECHNIE - DAKAR'],
    ['LABORATOIRE BIOLABO', '28', 'LIBERTE 6 - DAKAR'],
    ['LABORATOIRE DE L’OUEST', '28', 'POINT E - DAKAR'],
    ['LABORATOIRE D’ANALYSES DU PLATEAU', '01', 'RUE VINCENS - DAKAR'],
    ['CABINET DE BIOLOGIE MEDICALE SACRE-COEUR', '01', 'SACRE COEUR 1 - DAKAR'],

    // --- Médecine générale ------------------------------------------------
    ['CABINET MEDICAL MEDINA', '00', 'RUE 11 X 22 MEDINA - DAKAR'],
    ['CABINET DR SARR', '00', 'LIBERTE 6 EXTENSION - DAKAR'],
    ['CABINET MEDICAL LES BAOBABS', '00', 'SICAP BAOBABS - DAKAR'],
    ['CABINET MEDICAL DE NGOR', '00', 'NGOR VILLAGE - DAKAR'],

    // --- Imagerie ---------------------------------------------------------
    ['CENTRE D’IMAGERIE MEDICALE DE DAKAR', '02', 'FANN RESIDENCE - DAKAR'],
    ['CABINET DE RADIOLOGIE SOLEIL', '02', 'PARCELLES ASSAINIES - DAKAR'],
    ['CENTRE D’IMAGERIE SEA PLAZA', '02', 'CORNICHE OUEST - DAKAR'],

    // --- Optique et dentaire ---------------------------------------------
    ['OPTIQUE DU FLEUVE', '04', 'AVENUE LAMINE GUEYE - DAKAR'],
    ['GRAND OPTICAL SENEGAL', '04', 'SEA PLAZA - DAKAR'],
    ['OPTIQUE 2000 DAKAR', '04', 'AVENUE GEORGES POMPIDOU - DAKAR'],
    ['CABINET DENTAIRE ALMADIES', '05', 'ROUTE DES ALMADIES - DAKAR'],
    ['CENTRE DENTAIRE POINT E', '05', 'POINT E - DAKAR'],
    ['CABINET DENTAIRE DIEUPPEUL', '05', 'DIEUPPEUL - DAKAR'],

    // --- Spécialités médicales -------------------------------------------
    ['CABINET GYNECOLOGIQUE SAINT-LOUIS', '07', 'HANN MARISTES - DAKAR'],
    ['CENTRE DE MATERNITE LES FLAMBOYANTS', '07', 'OUAKAM - DAKAR'],
    ['CENTRE DE CARDIOLOGIE DE DAKAR', '09', 'MERMOZ - DAKAR'],
    ['CABINET CARDIOLOGIQUE DU PLATEAU', '09', 'RUE JULES FERRY - DAKAR'],
    ['CABINET DE DERMATOLOGIE FANN', '10', 'FANN RESIDENCE - DAKAR'],
    ['CABINET DE PEDIATRIE LES BAOBABS', '11', 'OUAKAM - DAKAR'],
    ['CENTRE PEDIATRIQUE ALBERT ROYER', '11', 'FANN - DAKAR'],
    ['CENTRE OPHTALMOLOGIQUE DE DAKAR', '12', 'POINT E - DAKAR'],
    ['CABINET D’OPHTALMOLOGIE SICAP', '12', 'SICAP LIBERTE 2 - DAKAR'],
    ['CABINET ORL DE LA CORNICHE', '13', 'CORNICHE OUEST - DAKAR'],
    ['CABINET DE NEUROLOGIE FANN', '14', 'FANN - DAKAR'],
    ['CENTRE PSYCHIATRIQUE DE FANN', '15', 'FANN - DAKAR'],
    ['CABINET DE RHUMATOLOGIE MERMOZ', '16', 'MERMOZ - DAKAR'],
    ['CABINET DE GASTRO-ENTEROLOGIE PLATEAU', '17', 'RUE DE THANN - DAKAR'],
    ['CABINET DE PNEUMOLOGIE YOFF', '18', 'YOFF - DAKAR'],
    ['CABINET D’UROLOGIE LE DANTEC', '19', 'AVENUE PASTEUR - DAKAR'],
    ['CENTRE DE DIALYSE DE DAKAR', '20', 'GRAND YOFF - DAKAR'],
    ['CABINET D’ENDOCRINOLOGIE POINT E', '21', 'POINT E - DAKAR'],
    ['CABINET DE CHIRURGIE GENERALE ALMADIES', '22', 'ALMADIES - DAKAR'],
    ['CENTRE D’ORTHOPEDIE ET DE TRAUMATOLOGIE', '23', 'GRAND YOFF - DAKAR'],
    ['CABINET D’ANESTHESIE DU CAP', '24', 'AVENUE PASTEUR - DAKAR'],

    // --- Paramédical ------------------------------------------------------
    ['CENTRE DE KINESITHERAPIE VDN', '25', 'VDN - DAKAR'],
    ['CABINET DE KINESITHERAPIE MERMOZ', '25', 'MERMOZ - DAKAR'],
    ['CABINET DE SAGE-FEMME KEUR MAME FATIM', '26', 'GUEDIAWAYE'],
    ['CABINET INFIRMIER LES PARCELLES', '27', 'PARCELLES ASSAINIES - DAKAR'],
  ].map(([libelle, specialite, adresse], i) => ({
    code: String(i + 1).padStart(3, '0'),
    libelle,
    specialite,
    adresse,
    // Numéros engendrés : les écrire à la main pour soixante-dix lignes aurait
    // noyé les noms, seuls porteurs de sens ici. La formule reste déterministe,
    // donc le jeu est identique d'un poste à l'autre.
    telephone: `33 8${39 + (i % 55)} ${10 + ((i * 7) % 89)} ${10 + ((i * 13) % 89)}`,
    // Un fixe partout, un portable sur deux fiches environ : c'est l'usage.
    mobile:
      i % 3 === 0
        ? `7${[7, 6, 8][i % 3]} ${100 + ((i * 31) % 899)} ${10 + ((i * 17) % 89)} ${10 + ((i * 23) % 89)}`
        : '',
    // Beaucoup de fiches restent incomplètes en pratique : seules quelques-unes
    // portent l'interlocuteur, les pièces et la domiciliation bancaire.
    contactNom: i % 4 === 0 ? ['NDIAYE', 'DIOP', 'SALL', 'FAYE', 'BA', 'SECK', 'GUEYE'][i % 7] : '',
    contactPrenoms: i % 4 === 0 ? ['Awa', 'Cheikh', 'Mariama', 'Ibrahima'][i % 4] : '',
    contactFonction: i % 4 === 0 ? 'Responsable administratif' : '',
    contactTelephone: '',
    contactMobile: i % 4 === 0 ? `77 ${300 + i} ${10 + i} ${20 + i}` : '',
    carteNumero: i % 3 === 0 ? `CO/${2400 + i}` : '',
    carteDate: '',
    rcNumero: i % 3 === 0 ? `SN-DKR-2019-B-${1000 + i * 7}` : '',
    ninea: i % 3 === 0 ? String(4500000 + i * 131) : '',
    autorisationNumero: i % 5 === 0 ? `MSAS/DES/${900 + i}` : '',
    autorisationDate: '',
    banqueNom: i % 3 === 0 ? ['CBAO', 'ECOBANK', 'SGBS', 'BICIS'][i % 4] : '',
    banqueCode: i % 3 === 0 ? `SN0${10 + (i % 9)}` : '',
    guichetCode: i % 3 === 0 ? `0100${i % 10}` : '',
    compteBancaire: i % 3 === 0 ? String(100000000000 + i * 917).slice(0, 12) : '',
    cleRib: i % 3 === 0 ? String(10 + (i % 89)) : '',
    // Conventions dénoncées : la fiche reste, le fournisseur sort du circuit.
    actif: ![3, 18, 29, 44, 57].includes(i),
  }))

/**
 * Salariés couverts par l'IPM.
 *
 * Chaque ligne est rattachée à un adhérent — la collectivité qui cotise pour
 * elle — et à un triplet direction / département / service qui existe
 * réellement dans le référentiel « Structure ». Un rattachement inventé
 * afficherait un code sans intitulé dès qu'on ouvrirait la fiche.
 *
 * Rappel des codes utilisés : DIR002 Financière (DEP001 Comptabilité →
 * SRV014 Facturation, SRV015 Recouvrement), DIR003 RH (DEP004 Paie →
 * SRV007 IPM), DIR004 Technique (DEP007 Maintenance → SRV010 Inspection,
 * SRV013 Ordonnancement ; DEP008 Production → SRV008 REXAS, SRV009
 * Preparation ; DEP009 Laboratoire → SRV011 Métrologie), DIR007 Systèmes
 * d'Information (DEP010 Informatique → SRV001 à SRV006), DIR008
 * Approvisionnements (DEP012 Logistique → SRV012 Magasin Général).
 */
const participants = () =>
  [
    ['NDIAYE', 'Moustapha', 'M', 'CADRE', '02', 'DIR007', 'DEP010', 'SRV003'],
    ['DIOP', 'Awa', 'F', 'CADRE', '02', 'DIR007', 'DEP010', 'SRV006'],
    ['FALL', 'Ibrahima', 'M', 'MAITRISE', '01', 'DIR007', 'DEP010', 'SRV001'],
    ['SOW', 'Fatou', 'F', 'EMPLOYE', '01', 'DIR007', 'DEP010', 'SRV002'],
    ['BA', 'Cheikh', 'M', 'MAITRISE', '01', 'DIR007', 'DEP010', 'SRV004'],
    ['SALL', 'Mariama', 'F', 'EMPLOYE', '01', 'DIR007', 'DEP010', 'SRV005'],
    ['GUEYE', 'Abdoulaye', 'M', 'CADRE', '02', 'DIR002', 'DEP001', 'SRV014'],
    ['SECK', 'Ndeye', 'F', 'EMPLOYE', '01', 'DIR002', 'DEP001', 'SRV014'],
    ['FAYE', 'Mamadou', 'M', 'MAITRISE', '01', 'DIR002', 'DEP001', 'SRV015'],
    ['CISSE', 'Khady', 'F', 'EMPLOYE', '01', 'DIR002', 'DEP001', 'SRV015'],
    ['DIALLO', 'Ousmane', 'M', 'CADRE', '02', 'DIR002', 'DEP002', ''],
    ['KANE', 'Aminata', 'F', 'MAITRISE', '01', 'DIR002', 'DEP003', ''],
    ['THIAM', 'Modou', 'M', 'CADRE', '02', 'DIR003', 'DEP004', 'SRV007'],
    ['SY', 'Coumba', 'F', 'MAITRISE', '01', 'DIR003', 'DEP004', 'SRV007'],
    ['MBAYE', 'Alioune', 'M', 'EMPLOYE', '01', 'DIR003', 'DEP005', ''],
    ['NDOYE', 'Adja', 'F', 'EMPLOYE', '01', 'DIR003', 'DEP006', ''],
    ['DIENG', 'Babacar', 'M', 'CADRE', '02', 'DIR004', 'DEP007', 'SRV010'],
    ['TOURE', 'Sokhna', 'F', 'MAITRISE', '01', 'DIR004', 'DEP007', 'SRV013'],
    ['SARR', 'Serigne', 'M', 'OUVRIER', '01', 'DIR004', 'DEP007', 'SRV010'],
    ['LO', 'Papa', 'M', 'OUVRIER', '01', 'DIR004', 'DEP008', 'SRV008'],
    ['WADE', 'Souleymane', 'M', 'OUVRIER', '01', 'DIR004', 'DEP008', 'SRV009'],
    ['DIAGNE', 'Bineta', 'F', 'MAITRISE', '01', 'DIR004', 'DEP008', 'SRV008'],
    ['BADJI', 'Malick', 'M', 'OUVRIER', '01', 'DIR004', 'DEP008', 'SRV009'],
    ['GOUDIABY', 'Rokhaya', 'F', 'CADRE', '02', 'DIR004', 'DEP009', 'SRV011'],
    ['MANE', 'Amadou', 'M', 'MAITRISE', '01', 'DIR004', 'DEP009', 'SRV011'],
    ['SANE', 'Aïssatou', 'F', 'EMPLOYE', '01', 'DIR004', 'DEP009', 'SRV011'],
    ['CAMARA', 'Idrissa', 'M', 'MAITRISE', '01', 'DIR008', 'DEP012', 'SRV012'],
    ['DIATTA', 'Astou', 'F', 'EMPLOYE', '01', 'DIR008', 'DEP012', 'SRV012'],
    ['NIANG', 'Lamine', 'M', 'OUVRIER', '01', 'DIR008', 'DEP011', ''],
    ['SAMB', 'Maimouna', 'F', 'CADRE', '02', 'DIR008', 'DEP011', ''],
    ['DIOUF', 'Assane', 'M', 'CADRE', '02', 'DIR001', 'DEP015', ''],
    ['TALL', 'Seynabou', 'F', 'EMPLOYE', '03', 'DIR001', 'DEP015', ''],
    ['DRAME', 'Moussa', 'M', 'MAITRISE', '01', 'DIR006', 'DEP013', ''],
    ['KEITA', 'Yacine', 'F', 'EMPLOYE', '01', 'DIR006', 'DEP014', ''],
    ['BALDE', 'Pape', 'M', 'CADRE', '02', 'DIR009', 'DEP016', ''],
    ['BARRY', 'Dieynaba', 'F', 'MAITRISE', '03', 'DIR005', '', ''],
    ['SOUMARE', 'Saliou', 'M', 'EMPLOYE', '01', 'DIR005', '', ''],
    ['TRAORE', 'Oumou', 'F', 'CADRE', '02', 'DIR010', '', ''],
  ].map(([nom, prenoms, sexe, categorie, adherent, direction, departement, service], i) => {
    // Une poignée de dossiers fermés et radiés : sans eux, le sélecteur d'état
    // n'aurait jamais rien à montrer.
    const etatContrat = i % 17 === 5 ? 'Fermeture' : i % 23 === 7 ? 'Radiation' : 'Ouverture'
    const annee = 1968 + ((i * 7) % 32)
    const mois = String(1 + (i % 12)).padStart(2, '0')
    const jour = String(1 + ((i * 3) % 28)).padStart(2, '0')

    // État administratif du dossier (distinct de l'état du contrat) : c'est lui
    // que filtre la liste. Radié/Résilié suivent l'état du contrat ; le reste
    // se répartit entre En Attente, Actif et Suspendu.
    const etat =
      etatContrat === 'Radiation'
        ? 'Radié'
        : etatContrat === 'Fermeture'
          ? 'Résilié'
          : ['Actif', 'Actif', 'Actif', 'Actif', 'En Attente', 'Suspendu'][i % 6]

    // Un cinquième environ des dossiers sont des retraités (onglet dédié).
    const retraite = i % 5 === 2

    return {
      matricule: `SAR${String(1204 + i * 3).padStart(5, '0')}`,
      nom,
      prenoms,
      sexe,
      categorie,
      adherent,
      direction,
      departement,
      service,
      nationalite: 'SEN',
      typePiece: 'CIN',
      numeroPiece: String(1_750_000_000_000 + i * 97_531).slice(0, 13),
      situationFamiliale: ['CELIBATAIRE', 'MARIE', 'MARIE', 'DIVORCE', 'VEUF'][i % 5],
      dateNaissance: `${annee}-${mois}-${jour}`,
      lieuNaissance: ['DAKAR', 'THIES', 'SAINT-LOUIS', 'KAOLACK', 'ZIGUINCHOR', 'RUFISQUE'][i % 6],
      adresse: ['PARCELLES ASSAINIES', 'GRAND YOFF', 'MBAO', 'RUFISQUE', 'GUEDIAWAYE', 'YOFF'][
        i % 6
      ],
      ville: 'DAKAR',
      region: ['Dakar', 'Dakar', 'Dakar', 'Thiès', 'Saint-Louis'][i % 5],
      telephone: '',
      mobile: `7${[7, 6, 8][i % 3]} ${100 + ((i * 41) % 899)} ${10 + ((i * 19) % 89)} ${10 + ((i * 29) % 89)}`,
      email: `${prenoms.toLowerCase().replace(/[^a-z]/g, '')}.${nom.toLowerCase().replace(/[^a-z]/g, '')}@sar.sn`,
      dateEmbauche: `${1998 + ((i * 5) % 26)}-${mois}-${jour}`,
      typeContrat: i % 9 === 4 ? 'CDD' : 'CDI',
      numeroFiche: String(1001 + i),
      numeroContrat: `IPM-${2015 + (i % 10)}-${String(100 + i).padStart(4, '0')}`,
      dateSouscription: `${2015 + (i % 10)}-${mois}-${jour}`,
      etatContrat,
      dateResiliation: etatContrat === 'Fermeture' ? `${2024}-${mois}-${jour}` : '',
      dateRadiation: etatContrat === 'Radiation' ? `${2023}-${mois}-${jour}` : '',
      etat,
      retraite,
    }
  })

/**
 * Bénéficiaires (familles) rattachés aux participants.
 *
 * Chaque participant marié porte un ou deux conjoints et quelques enfants ;
 * certains, un ascendant. Données fictives, déterministes, le temps que le
 * back existe : c'est ce jeu qui peuple l'onglet « Familles » et alimente les
 * compteurs Nb. Ép. / Nb. En. de la liste des participants.
 */
const PRENOMS_F = [
  'Awa',
  'Fatou',
  'Mariama',
  'Aïssatou',
  'Khady',
  'Ndeye',
  'Sokhna',
  'Adja',
  'Bineta',
  'Coumba',
  'Rokhaya',
  'Maimouna',
  'Seynabou',
  'Yacine',
  'Dieynaba',
  'Oumou',
  'Astou',
  'Aminata',
]
const PRENOMS_M = [
  'Moustapha',
  'Ibrahima',
  'Cheikh',
  'Abdoulaye',
  'Mamadou',
  'Ousmane',
  'Modou',
  'Alioune',
  'Babacar',
  'Serigne',
  'Papa',
  'Souleymane',
  'Malick',
  'Amadou',
  'Idrissa',
  'Lamine',
  'Assane',
  'Moussa',
]

const beneficiaires = () =>
  participants().flatMap((p, i) => {
    const membres = []
    const dateNaiss = (an) =>
      `${an}-${String(1 + ((i + membres.length) % 12)).padStart(2, '0')}-${String(1 + ((i * 3 + membres.length) % 28)).padStart(2, '0')}`
    const ajouter = (typeBenef, prenomsB, sexeB, annee) => {
      const rang = membres.length + 1
      membres.push({
        matriculeBenef: `${p.matricule}/${String(rang).padStart(2, '0')}`,
        typeBenef,
        prenoms: prenomsB,
        nom: p.nom,
        matriculePart: p.matricule,
        participant: `${p.prenoms} ${p.nom}`,
        codeSoc: p.adherent,
        adresse: p.adresse,
        dateNaissance: dateNaiss(annee),
        lieuNaissance: p.lieuNaissance,
        sexe: sexeB,
        etat: p.etat === 'Radié' ? 'Radié' : 'Actif',
      })
    }

    // Conjoint(s) : l'épouse pour un homme marié (parfois deux), l'époux pour
    // une femme mariée.
    if (p.situationFamiliale === 'MARIE') {
      if (p.sexe === 'M') {
        ajouter('EPOUSE', PRENOMS_F[i % PRENOMS_F.length], 'F', 1975 + (i % 15))
        if (i % 7 === 0)
          ajouter('EPOUSE', PRENOMS_F[(i + 5) % PRENOMS_F.length], 'F', 1980 + (i % 12))
      } else {
        ajouter('EPOUX', PRENOMS_M[i % PRENOMS_M.length], 'M', 1970 + (i % 15))
      }
    }

    // Enfants : 0 à 4 selon le dossier.
    const nbEnfants = p.situationFamiliale === 'CELIBATAIRE' ? (i % 3 === 0 ? 1 : 0) : i % 5
    for (let e = 0; e < nbEnfants; e += 1) {
      const sexeE = e % 2 ? 'F' : 'M'
      const prenomE = (sexeE === 'F' ? PRENOMS_F : PRENOMS_M)[(i + e) % PRENOMS_F.length]
      ajouter('ENFANT', prenomE, sexeE, 2005 + ((i + e) % 18))
    }

    // Un ascendant, ou un autre ayant droit, de temps en temps.
    if (i % 6 === 0)
      ajouter('ASCENDANT', PRENOMS_F[(i + 3) % PRENOMS_F.length], 'F', 1945 + (i % 20))
    if (i % 11 === 0) ajouter('AUTRE', PRENOMS_M[(i + 2) % PRENOMS_M.length], 'M', 1992 + (i % 8))

    return membres
  })

/**
 * Codes des types de bénéficiaire, tels que le backend les sème
 * (cf. seed_donnees_de_base). Le référentiel fait foi : cette table ne sert
 * qu'à engendrer le jeu de démonstration et à retrouver l'intitulé d'un code
 * quand le référentiel n'est pas encore chargé.
 */
export const CODES_TYPE_BENEFICIAIRE = {
  PARTICIPANT: '1',
  EPOUSE: '2',
  ENFANT: '3',
  EPOUX: '4',
  ASCENDANT: '5',
  AUTRE: '7',
}

/**
 * Bons de pharmacie de démonstration.
 *
 * Engendrés à partir des bénéficiaires et des pharmacies déjà déclarés, de
 * sorte que chaque bon désigne des personnes et un fournisseur qui existent
 * réellement ailleurs dans l'application — un bon dont le participant serait
 * introuvable dans la section Participants se verrait tout de suite.
 *
 * Deux exercices sont couverts pour que le filtre correspondant ait un effet
 * visible, et un bon sur trois est déjà traité.
 */
const bonsPharmacie = () => {
  const benefs = beneficiaires()
  const pharmacies = fournisseursDeSoins().filter((f) => f.specialite === '06')

  return Array.from({ length: 48 }, (_, i) => {
    // Pas séquentiel : deux bons voisins ne doivent pas porter sur la même
    // famille, sinon la liste donne l'illusion d'un doublon.
    const b = benefs[(i * 7) % benefs.length]
    const pharmacie = pharmacies[i % pharmacies.length]
    const exercice = i % 6 === 5 ? 2025 : 2026
    const mois = String(1 + (i % 12)).padStart(2, '0')
    const jour = String(1 + ((i * 3) % 28)).padStart(2, '0')

    return {
      // « code » et non « numero » : c'est le nom que <Referentiel /> attend
      // du champ clé, ici comme dans tous les autres référentiels.
      code: `BPI${String(43900 + i * 13).padStart(6, '0')}`,
      date: `${exercice}-${mois}-${jour}`,
      // En chaîne : le filtre du tableau compare à la valeur d'un <option>.
      exercice: String(exercice),
      codeSoc: b.codeSoc,
      matriculePart: b.matriculePart,
      participant: b.participant,
      typeBenef: CODES_TYPE_BENEFICIAIRE[b.typeBenef] || '',
      beneficiaire: `${b.prenoms} ${b.nom}`,
      matriculeBenef: b.matriculeBenef,
      codeFournisseur: pharmacie.code,
      pharmacie: pharmacie.libelle,
      // Un bon sur quatre attend encore sa facture : le numéro n'arrive qu'au
      // retour de la pharmacie.
      numeroFacture: i % 4 === 3 ? '' : `FAC${String(20250 + i * 7).padStart(6, '0')}`,
      specialite: '',
      prescripteur: '',
      nbArticles: 1 + (i % 5),
      dateOrdonnance: `${exercice}-${mois}-${jour}`,
      remboursementIntegral: i % 9 === 0,
      traite: i % 3 === 0,
    }
  })
}

/** Jeu de départ, dimensionné pour éprouver la pagination. */
const DONNEES_INITIALES = {
  participants: participants(),

  'bons-pharmacie': bonsPharmacie(),

  beneficiaires: beneficiaires(),

  // « adherents » n'est plus ici : servi par le backend (cf. ENDPOINTS_API).

  // « medicaments » n'est plus ici : servi par le backend (cf. ENDPOINTS_API).

  // « structure » n'est plus ici : servie par le backend (cf. ENDPOINTS_API).
  // C'est le référentiel lu de façon synchrone par la cascade participant ;
  // le store mémoire préchargé assure cette lecture sans attendre le réseau.

  // « types-beneficiaires » n'est plus ici : il est servi par le backend
  // (cf. ENDPOINTS_API en tête de fichier).

  // « types-prestations » et « specialites » ne sont plus ici : ils sont servis
  // par le backend (cf. ENDPOINTS_API en tête de fichier). La constante
  // SPECIALITES, elle, reste déclarée en tête : le filtre des fournisseurs de
  // soins s'en sert encore.

  // « fournisseurs-de-soins » n'est plus ici : servi par le backend
  // (cf. ENDPOINTS_API en tête de fichier). La fonction fournisseursDeSoins()
  // reste néanmoins déclarée plus haut : les bons de pharmacie, encore locaux,
  // s'en servent pour désigner une pharmacie qui existe ailleurs.

  // « articles-achat » n'est plus ici : il est servi par le backend
  // (cf. ENDPOINTS_API en tête de fichier).

  // « journaux-comptables » n'est plus ici : servi par le backend
  // (cf. ENDPOINTS_API en tête de fichier).

  // « fournisseurs-divers » n'est plus ici : servi par le backend
  // (cf. ENDPOINTS_API en tête de fichier).
}

let compteurId = 1
const nouvelId = () => `r${Date.now().toString(36)}${(compteurId++).toString(36)}`

/**
 * Copie en mémoire du stockage. Sans elle, chaque cellule d'un tableau qui
 * résout un code vers son intitulé relirait et réanalyserait tout le contenu —
 * catalogue pharmaceutique compris — soit des dizaines de fois par rendu.
 *
 * Elle est tenue à jour par `enregistrerTout`, seul point d'écriture. Un
 * second onglet ne la verrait pas changer, ce qui est sans conséquence tant
 * que les données vivent dans le navigateur.
 */
let cache = null

function chargerTout() {
  if (cache) return cache
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (brut) {
      cache = JSON.parse(brut)
      return cache
    }
  } catch {
    // stockage illisible : on repart du jeu initial
  }
  const initial = {}
  Object.entries(DONNEES_INITIALES).forEach(([cle, lignes]) => {
    // `actif` d'abord, pour qu'une ligne qui le déclare — une convention
    // dénoncée, par exemple — garde sa valeur au lieu d'être réactivée.
    initial[cle] = lignes.map((l) => ({ actif: true, ...l, id: nouvelId() }))
  })
  enregistrerTout(initial)
  return initial
}

function enregistrerTout(tout) {
  cache = tout
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(tout))
  } catch {
    // quota dépassé ou mode privé : on continue en mémoire
  }
}

/**
 * Lecture synchrone d'un référentiel.
 *
 * Les listes déroulantes en cascade — Direction, puis Département, puis
 * Service — se calculent pendant le rendu et ne peuvent donc pas attendre une
 * promesse. C'est le seul cas : partout ailleurs, on passe par `listerEntrees`.
 */
export function listerEntreesSync(cleReferentiel) {
  // Référentiels en base : lus dans le store préchargé. Les autres restent en
  // localStorage, dont la lecture est déjà synchrone.
  if (servrParApi(cleReferentiel)) return magasin[cleReferentiel] || []
  return chargerTout()[cleReferentiel] || []
}

/** Petite latence pour que les états de chargement soient réalistes. */
const differer = (valeur) => new Promise((resolve) => setTimeout(() => resolve(valeur), 120))

export async function listerEntrees(cleReferentiel) {
  if (servrParApi(cleReferentiel)) {
    // On rafraîchit le store au passage : l'écran affiche des données fraîches
    // et les lectures synchrones profitent de la même mise à jour.
    magasin[cleReferentiel] = await request(`${ENDPOINTS_API[cleReferentiel]}/`)
    return [...magasin[cleReferentiel]]
  }
  const tout = chargerTout()
  return differer([...(tout[cleReferentiel] || [])])
}

export async function creerEntree(cleReferentiel, valeurs) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/`, {
      method: 'POST',
      body: JSON.stringify(valeurs),
    })
    magasin[cleReferentiel] = [...(magasin[cleReferentiel] || []), entree]
    return entree
  }
  const tout = chargerTout()
  const entree = { ...valeurs, id: nouvelId(), actif: true }
  tout[cleReferentiel] = [...(tout[cleReferentiel] || []), entree]
  enregistrerTout(tout)
  return differer(entree)
}

export async function modifierEntree(cleReferentiel, id, valeurs) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(valeurs),
    })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      e.id === entree.id ? entree : e,
    )
    return entree
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    e.id === id ? { ...e, ...valeurs } : e,
  )
  enregistrerTout(tout)
  return differer(tout[cleReferentiel].find((e) => e.id === id))
}

/**
 * Applique les mêmes champs à plusieurs entrées d'un coup — exclure une
 * sélection de médicaments, en désactiver un lot. Un seul enregistrement du
 * stockage, donc pas d'état intermédiaire visible.
 */
export async function modifierEnLot(cleReferentiel, ids, champs) {
  if (servrParApi(cleReferentiel)) {
    const { modifies } = await request(`${ENDPOINTS_API[cleReferentiel]}/modifier-en-lot/`, {
      method: 'POST',
      body: JSON.stringify({ ids, champs }),
    })
    // Le backend ne renvoie qu'un compte : on applique les mêmes champs aux
    // entrées visées du store pour le garder aligné sur la base.
    const cibles = new Set(ids)
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      cibles.has(e.id) ? { ...e, ...champs } : e,
    )
    return modifies
  }
  const tout = chargerTout()
  const cibles = new Set(ids)
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    cibles.has(e.id) ? { ...e, ...champs } : e,
  )
  enregistrerTout(tout)
  return differer(cibles.size)
}

/**
 * Désactive (ou réactive) une entrée.
 * On ne supprime jamais : les dossiers déjà saisis continuent de référencer
 * ce code, et un historique amputé de ses libellés devient illisible.
 */
export async function basculerActivation(cleReferentiel, id) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/basculer-activation/`, {
      method: 'POST',
    })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      e.id === entree.id ? entree : e,
    )
    return entree
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    e.id === id ? { ...e, actif: !e.actif } : e,
  )
  enregistrerTout(tout)
  return differer(tout[cleReferentiel].find((e) => e.id === id))
}

/**
 * Supprime définitivement une entrée.
 * Contrairement à la désactivation, la ligne disparaît : à réserver aux codes
 * jamais référencés ailleurs, car un dossier qui pointe vers un code supprimé
 * n'affichera plus son intitulé.
 */
export async function supprimerEntree(cleReferentiel, id) {
  if (servrParApi(cleReferentiel)) {
    await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/`, { method: 'DELETE' })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).filter((e) => e.id !== id)
    return
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).filter((e) => e.id !== id)
  enregistrerTout(tout)
  return differer(undefined)
}

/**
 * Déclenche une action métier sur une entrée — une route dédiée du backend,
 * au-delà de la simple saisie : valider une demande d'agrément, par exemple.
 * Renvoie la réponse du serveur.
 *
 * Réservée aux référentiels servis par l'API : une action métier n'a pas
 * d'équivalent dans le stockage du navigateur.
 */
export async function executerAction(cleReferentiel, id, action) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  return request(`${ENDPOINTS_API[cleReferentiel]}/${id}/${action}/`, { method: 'POST' })
}

/**
 * Importe un lot de lignes dans un référentiel servi par l'API : chaque ligne
 * met à jour la fiche dont elle porte le numéro, ou en crée une. Le serveur
 * valide tout avant d'écrire quoi que ce soit — une seule ligne en erreur et
 * rien n'est enregistré.
 *
 * `simulation` : le serveur valide et compte sans rien écrire, pour annoncer
 * le bilan avant de demander confirmation.
 */
export async function importerEntrees(cleReferentiel, lignes, { simulation = false } = {}) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  return request(`${ENDPOINTS_API[cleReferentiel]}/importer/`, {
    method: 'POST',
    body: JSON.stringify({ lignes, simulation }),
  })
}
