/**
 * Description du référentiel « Participants ».
 *
 * Un participant est un salarié couvert par l'IPM. Il se distingue de
 * l'adhérent, qui est la collectivité cotisante : plusieurs centaines de
 * participants se rattachent aux quatre adhérents de la SAR.
 *
 * Comme les autres sections, la page décrit ses champs et laisse
 * <Referentiel /> lister, chercher, filtrer, paginer et saisir. Elle ne
 * reprend pas la mise en page de la maquette d'origine — champs cernés de
 * rouge, boutons radio, onglets à picto — mais seulement les informations
 * qu'elle porte, réécrites dans le vocabulaire de l'application.
 */

import { listerEntreesSync } from '../../services/referentiels'

/** Options d'un référentiel tiers, filtrées et rendues au format attendu. */
const depuisReferentiel = (cle, predicat = () => true) =>
  listerEntreesSync(cle)
    .filter((e) => e.actif && predicat(e))
    .map((e) => ({ valeur: e.code, libelle: e.libelle }))

export const TYPES_PIECE = ['CIN', 'PASSEPORT', 'CARTE CONSULAIRE']

export const SITUATIONS_FAMILIALES = [
  { valeur: 'CELIBATAIRE', libelle: 'Célibataire' },
  { valeur: 'MARIE', libelle: 'Marié(e)' },
  { valeur: 'DIVORCE', libelle: 'Divorcé(e)' },
  { valeur: 'VEUF', libelle: 'Veuf(ve)' },
]

/**
 * Catégories professionnelles de la SAR. Elles recoupent les deux adhérents
 * « PERSONNEL CADRES » et « PERSONNEL MOO » — maîtrise, ouvriers, employés —
 * ce qui explique qu'un participant ait à la fois une catégorie et un adhérent.
 */
export const CATEGORIES = [
  { valeur: 'CADRE', libelle: 'Cadre' },
  { valeur: 'MAITRISE', libelle: 'Agent de maîtrise' },
  { valeur: 'EMPLOYE', libelle: 'Employé' },
  { valeur: 'OUVRIER', libelle: 'Ouvrier' },
]

export const ETATS_CONTRAT = ['Ouverture', 'Fermeture', 'Radiation']

/** Nationalité, au format « code - pays ». Le Sénégal par défaut. */
export const PAYS = [
  { valeur: 'SEN', libelle: 'SEN - Sénégal' },
  { valeur: 'MLI', libelle: 'MLI - Mali' },
  { valeur: 'MRT', libelle: 'MRT - Mauritanie' },
  { valeur: 'GIN', libelle: 'GIN - Guinée' },
  { valeur: 'CIV', libelle: 'CIV - Côte d’Ivoire' },
  { valeur: 'FRA', libelle: 'FRA - France' },
]

/** Régions du Sénégal, pour l'adresse. Dakar par défaut. */
export const REGIONS = [
  'Dakar',
  'Thiès',
  'Saint-Louis',
  'Diourbel',
  'Louga',
  'Fatick',
  'Kaolack',
  'Kaffrine',
  'Tambacounda',
  'Kédougou',
  'Kolda',
  'Sédhiou',
  'Ziguinchor',
  'Matam',
]

export const PARTICIPANTS = {
  cle: 'participants',
  libelle: 'Participants',
  nouveau: 'Nouveau participant',
  modifier: 'Modifier le participant',
  outils: ['export'],
  taillePage: 12,

  // Un participant s'appelle par deux champs : sans cette formule, les
  // messages diraient « undefined ajouté ».
  nommer: (e) => `${e.prenoms || ''} ${e.nom || ''}`.trim(),

  colonnesTableau: ['matricule', 'nom', 'prenoms', 'categorie', 'adherent', 'mobile'],

  /**
   * L'état du contrat IPM est le premier tri d'un gestionnaire : ouvert,
   * fermé, radié. Il prend donc le sélecteur segmenté. Ce n'est pas l'activité
   * de la fiche — un dossier radié reste consultable — d'où l'absence de
   * `activite: true` ici, contrairement aux fournisseurs de soins.
   */
  segments: {
    valeurs: [
      { valeur: 'tous', libelle: 'Tous', filtre: () => true },
      ...ETATS_CONTRAT.map((e) => ({ valeur: e, libelle: e, filtre: (p) => p.etatContrat === e })),
    ],
  },

  filtres: [
    { champ: 'categorie', libelle: 'Toutes les catégories', options: CATEGORIES },
    {
      champ: 'adherent',
      libelle: 'Tous les adhérents',
      options: () => depuisReferentiel('adherents'),
    },
  ],

  colonnes: [
    {
      // Choisie sur le poste, réduite puis conservée avec la fiche. Elle sert
      // à reconnaître le porteur au guichet — d'où sa place en tête de
      // l'identité, avant même le matricule.
      nom: 'photo',
      libelle: 'Photo',
      libelleForm: 'Photo d’identité',
      type: 'photo',
    },
    {
      nom: 'matricule',
      libelle: 'Matricule',
      libelleForm: 'Matricule',
      largeur: '110px',
      mono: true,
      requis: true,
      unique: true,
      majuscules: true,
      placeholder: 'SAR01204',
    },
    {
      nom: 'nom',
      libelle: 'Nom',
      libelleForm: 'Nom',
      largeur: '150px',
      requis: true,
      majuscules: true,
      placeholder: 'NDIAYE',
    },
    {
      nom: 'prenoms',
      libelle: 'Prénom',
      libelleForm: 'Prénom(s)',
      requis: true,
      placeholder: 'Moustapha',
    },
    {
      // Une liste plutôt que deux boutons radio : c'est le contrôle que
      // l'application emploie partout ailleurs pour un choix fermé.
      nom: 'sexe',
      libelle: 'Sexe',
      libelleForm: 'Sexe',
      type: 'radio',
      options: [
        { valeur: 'M', libelle: 'Homme' },
        { valeur: 'F', libelle: 'Femme' },
      ],
      // Le tableau affiche « M » / « F » ; le formulaire propose des radios.
      afficherCode: true,
      requis: true,
    },
    {
      nom: 'nationalite',
      libelle: 'Nationalité',
      libelleForm: 'Pays (Nationalité)',
      options: PAYS,
      defaut: 'SEN',
      requis: true,
    },
    {
      nom: 'typePiece',
      libelle: 'Type de pièce',
      libelleForm: 'Type de pièce',
      options: TYPES_PIECE,
      defaut: 'CIN',
    },
    {
      nom: 'numeroPiece',
      libelle: 'N° CIN',
      libelleForm: 'N° CIN',
      mono: true,
      placeholder: '1750000000000',
    },
    {
      nom: 'situationFamiliale',
      libelle: 'Situation familiale',
      libelleForm: 'Situation familiale',
      options: SITUATIONS_FAMILIALES,
      requis: true,
    },
    {
      nom: 'dateNaissance',
      libelle: 'D. naiss',
      libelleForm: 'Date de naissance',
      type: 'date',
      requis: true,
    },
    {
      nom: 'lieuNaissance',
      libelle: 'Lieu de naissance',
      libelleForm: 'Lieu de naissance',
      requis: true,
      majuscules: true,
      placeholder: 'DAKAR',
    },

    // --- Coordonnées -------------------------------------------------------
    {
      nom: 'adresse',
      libelle: 'Adresse',
      libelleForm: 'Adresse',
      placeholder: 'GRAND YOFF',
      requis: true,
    },
    {
      nom: 'mobile',
      libelle: 'Portable',
      libelleForm: 'Tel. portable',
      largeur: '150px',
      mono: true,
      type: 'tel',
      prefixe: '+221',
      placeholder: '77 512 40 18',
      requis: true,
    },
    {
      nom: 'region',
      libelle: 'Région',
      libelleForm: 'Région',
      options: REGIONS,
      defaut: 'Dakar',
      requis: true,
    },
    {
      nom: 'email',
      libelle: 'Email',
      libelleForm: 'Email',
      type: 'email',
      placeholder: 'm.ndiaye@sar.sn',
      requis: true,
    },

    // --- Situation professionnelle ----------------------------------------
    {
      nom: 'dateEmbauche',
      libelle: 'Date d’embauche',
      libelleForm: 'Date d’embauche',
      type: 'date',
      requis: true,
    },
    {
      nom: 'typeContrat',
      libelle: 'Contrat',
      libelleForm: 'Type de contrat',
      type: 'radio',
      options: ['CDD', 'CDI'],
      defaut: 'CDI',
      requis: true,
    },
    {
      nom: 'categorie',
      libelle: 'Catégorie',
      libelleForm: 'Catégorie professionnelle',
      largeur: '150px',
      options: CATEGORIES,
      requis: true,
    },

    /**
     * Direction, département et service en cascade : chaque liste ne propose
     * que les entités rattachées à celle du dessus, lues dans le référentiel
     * « Structure ». Changer la direction vide les deux suivantes — sans quoi
     * un salarié resterait au service Facturation d'une direction technique.
     */
    {
      nom: 'direction',
      libelle: 'Direction',
      libelleForm: 'Direction',
      options: () => depuisReferentiel('structure', (e) => e.type === 'DIR'),
    },
    {
      nom: 'departement',
      libelle: 'Département',
      libelleForm: 'Département',
      dependDe: 'direction',
      options: (valeurs) =>
        depuisReferentiel('structure', (e) => e.type === 'DEP' && e.parent === valeurs.direction),
    },
    {
      nom: 'service',
      libelle: 'Service',
      libelleForm: 'Service',
      dependDe: 'departement',
      options: (valeurs) =>
        depuisReferentiel('structure', (e) => e.type === 'SRV' && e.parent === valeurs.departement),
    },

    // --- Contrat IPM -------------------------------------------------------
    {
      // Le rattachement à la collectivité cotisante. Absent de la maquette,
      // mais c'est lui qui dit qui paie pour ce salarié : sans lui, la fiche
      // ne se relie à rien.
      nom: 'adherent',
      libelle: 'Adhérent',
      libelleForm: 'Société',
      // Assez large pour « IPM SAR PERSONNEL CADRES » d'un seul tenant :
      // replié sur deux lignes, il faisait respirer une ligne sur trois.
      largeur: '225px',
      options: () => depuisReferentiel('adherents'),
      requis: true,
    },
    {
      nom: 'numeroFiche',
      libelle: 'N° fiche',
      libelleForm: 'N° fiche',
      mono: true,
      placeholder: '1001',
    },
    {
      nom: 'numeroContrat',
      libelle: 'N° contrat',
      libelleForm: 'N° contrat',
      mono: true,
      placeholder: 'IPM-2019-0112',
    },
    {
      nom: 'dateSouscription',
      libelle: 'Souscription',
      libelleForm: 'Date de souscription',
      type: 'date',
    },
    {
      nom: 'etatContrat',
      libelle: 'État',
      libelleForm: 'Etat Contrat',
      largeur: '120px',
      options: ETATS_CONTRAT,
      defaut: 'Ouverture',
    },
    {
      // Comme la maquette, les deux dates de sortie restent affichées ; elles
      // ne se remplissent qu'à la fermeture ou la radiation du dossier.
      nom: 'dateResiliation',
      libelle: 'Résiliation',
      libelleForm: 'Date Résiliation',
      type: 'date',
    },
    {
      nom: 'dateRadiation',
      libelle: 'Radiation',
      libelleForm: 'Date Radiation',
      type: 'date',
    },
  ],

  /**
   * Mise en page de la maquette : une section « identité » toujours visible en
   * haut (formulaireEnTete), puis trois sous-onglets. Le tout s'affiche en
   * pleine page via l'onglet « Nouveau Participant IPM ».
   */
  formulaireEnTete: [
    {
      lignes: [
        ['adherent', 'nationalite'],
        ['typePiece', 'numeroPiece', 'matricule'],
        ['sexe', 'prenoms', 'nom'],
        ['situationFamiliale', 'dateNaissance', 'lieuNaissance'],
        ['photo'],
      ],
    },
  ],

  formulaire: [
    {
      libelle: 'Coordonnées',
      sections: [{ lignes: [['adresse', 'mobile', 'email'], ['region']] }],
    },
    {
      libelle: 'Infos professionnelles',
      sections: [
        {
          lignes: [
            ['dateEmbauche', 'typeContrat', 'categorie'],
            ['direction', 'departement', 'service'],
          ],
        },
      ],
    },
    {
      libelle: 'Infos contrat IPM',
      sections: [
        {
          lignes: [
            ['numeroFiche', 'numeroContrat', 'dateSouscription'],
            ['etatContrat', 'dateResiliation', 'dateRadiation'],
          ],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Vues « liste » : IPM, Retraités et Familles
// ---------------------------------------------------------------------------

/** Âge en années révolues à partir d'une date ISO (AAAA-MM-JJ). */
const calculerAge = (dateISO) => {
  if (!dateISO) return ''
  const naissance = new Date(dateISO)
  if (Number.isNaN(naissance.getTime())) return ''
  return Math.floor((Date.now() - naissance.getTime()) / (365.25 * 24 * 3600 * 1000))
}

/** Nombre de bénéficiaires d'un type donné rattachés à un participant. */
const compterBeneficiaires = (matricule, type) =>
  listerEntreesSync('beneficiaires').filter(
    (b) => b.matriculePart === matricule && b.typeBenef === type,
  ).length

/** Filtre d'état, commun aux deux listes de participants. */
const SEGMENTS_ETAT = {
  valeurs: [
    { valeur: 'tous', libelle: 'Tous', filtre: () => true },
    ...['En Attente', 'Actif', 'Suspendu', 'Résilié', 'Radié'].map((e) => ({
      valeur: e,
      libelle: e,
      filtre: (p) => p.etat === e,
    })),
  ],
}

/**
 * Colonnes d'affichage propres à la liste (calculées ou remappées) : elles
 * s'ajoutent aux colonnes de saisie du participant, sans les remplacer.
 */
const COLONNES_LISTE = [
  {
    nom: 'codeSoc',
    libelle: 'Code soc.',
    largeur: '80px',
    mono: true,
    valeurTableau: (e) => e.adherent,
  },
  {
    nom: 'age',
    libelle: 'Age',
    largeur: '60px',
    valeurTableau: (e) => calculerAge(e.dateNaissance),
  },
  { nom: 'etat', libelle: 'Etat', type: 'statut', largeur: '110px' },
  {
    nom: 'nbEpouses',
    libelle: 'Nb. Ep.',
    largeur: '70px',
    aligne: 'droite',
    valeurTableau: (e) => compterBeneficiaires(e.matricule, 'EPOUSE'),
  },
  {
    nom: 'nbEnfants',
    libelle: 'Nb. En.',
    largeur: '70px',
    aligne: 'droite',
    valeurTableau: (e) => compterBeneficiaires(e.matricule, 'ENFANT'),
  },
]

/** Compte les bénéficiaires par type, pour un ensemble de matricules donnés. */
const statsBeneficiaires = (matricules) => {
  const cibles = new Set(matricules)
  const compte = { EPOUSE: 0, EPOUX: 0, ENFANT: 0, AUTRE: 0, ASCENDANT: 0 }
  listerEntreesSync('beneficiaires').forEach((b) => {
    if (cibles.has(b.matriculePart) && compte[b.typeBenef] !== undefined) compte[b.typeBenef] += 1
  })
  return compte
}

/** Fabrique une vue liste des participants (mêmes colonnes, source partagée). */
const listeParticipants = (extra) => ({
  ...PARTICIPANTS,
  ...extra,
  // La création se fait par l'onglet dédié, pas par un bouton de la liste.
  sansCreation: true,
  // Seul le sélecteur Société, comme la maquette (pas de filtre catégorie).
  // Son étiquette se pose au-dessus, comme « Spécialité » chez les fournisseurs.
  filtres: [
    {
      champ: 'adherent',
      etiquette: 'Société',
      libelle: 'Toutes les sociétés',
      options: () => depuisReferentiel('adherents'),
    },
  ],
  // Recherche et filtre soulignés, sans cadre ni loupe, comme sur les
  // fournisseurs de soins.
  champsSoulignes: true,
  // Bandeau : total et nombre d'ayants droit de la vue affichée.
  stats: (entrees) => {
    const c = statsBeneficiaires(entrees.map((e) => e.matricule))
    return `Total Participants: ${entrees.length} - Époux(se): ${c.EPOUSE + c.EPOUX} - Enfant: ${c.ENFANT}`
  },
  colonnes: [...PARTICIPANTS.colonnes, ...COLONNES_LISTE],
  colonnesTableau: [
    'codeSoc',
    'matricule',
    'prenoms',
    'nom',
    'sexe',
    'dateNaissance',
    'age',
    'adresse',
    'etat',
    'nbEpouses',
    'nbEnfants',
  ],
  segments: SEGMENTS_ETAT,
})

export const PARTICIPANTS_IPM = listeParticipants({
  libelle: 'Participants IPM',
  filtreBase: (e) => !e.retraite,
})

export const PARTICIPANTS_RETRAITES = listeParticipants({
  libelle: 'Participants Retraités',
  filtreBase: (e) => e.retraite,
})

/** Onglet Familles : les bénéficiaires rattachés aux participants. */
export const FAMILLES = {
  cle: 'beneficiaires',
  libelle: 'Familles',
  sansCreation: true,
  outils: ['export'],
  // Recherche soulignée, comme les autres onglets de la page.
  champsSoulignes: true,
  taillePage: 12,
  nommer: (e) => `${e.prenoms || ''} ${e.nom || ''}`.trim(),

  stats: (entrees) => {
    const c = { EPOUX: 0, EPOUSE: 0, ENFANT: 0, ASCENDANT: 0, AUTRE: 0 }
    entrees.forEach((b) => {
      if (c[b.typeBenef] !== undefined) c[b.typeBenef] += 1
    })
    return `Époux : ${c.EPOUX} / Épouses : ${c.EPOUSE} / Enfants : ${c.ENFANT} / Autres : ${c.ASCENDANT + c.AUTRE}`
  },

  colonnesTableau: [
    'matriculeBenef',
    'typeBenef',
    'prenoms',
    'nom',
    'matriculePart',
    'participant',
    'codeSoc',
    'adresse',
    'dateNaissance',
    'lieuNaissance',
    'age',
    'sexe',
    'etat',
  ],

  segments: {
    valeurs: [
      { valeur: 'tous', libelle: 'Tous', filtre: () => true },
      ...[
        ['EPOUSE', 'Epouse'],
        ['ENFANT', 'Enfant'],
        ['EPOUX', 'Epoux'],
        ['ASCENDANT', 'Ascendant'],
        ['AUTRE', 'Autre'],
      ].map(([valeur, libelle]) => ({ valeur, libelle, filtre: (b) => b.typeBenef === valeur })),
    ],
  },

  colonnes: [
    {
      nom: 'matriculeBenef',
      libelle: 'Matri. benef.',
      libelleForm: 'Matricule bénéficiaire',
      mono: true,
      largeur: '130px',
    },
    {
      nom: 'typeBenef',
      libelle: 'Type benef',
      libelleForm: 'Type de bénéficiaire',
      largeur: '110px',
    },
    { nom: 'prenoms', libelle: 'Prénom(s)', libelleForm: 'Prénom(s)' },
    { nom: 'nom', libelle: 'Nom', libelleForm: 'Nom' },
    {
      nom: 'matriculePart',
      libelle: 'Matri. Part.',
      libelleForm: 'Matricule participant',
      mono: true,
      largeur: '120px',
    },
    { nom: 'participant', libelle: 'Participant', libelleForm: 'Participant', largeur: '160px' },
    {
      nom: 'codeSoc',
      libelle: 'Code soc.',
      libelleForm: 'Code société',
      mono: true,
      largeur: '80px',
    },
    { nom: 'adresse', libelle: 'Adresse', libelleForm: 'Adresse' },
    {
      nom: 'dateNaissance',
      libelle: 'Date Naiss.',
      libelleForm: 'Date de naissance',
      type: 'date',
      largeur: '110px',
    },
    { nom: 'lieuNaissance', libelle: 'Lieu naissance', libelleForm: 'Lieu de naissance' },
    {
      nom: 'age',
      libelle: 'Age',
      largeur: '60px',
      valeurTableau: (e) => calculerAge(e.dateNaissance),
    },
    { nom: 'sexe', libelle: 'Sexe', largeur: '60px' },
    { nom: 'etat', libelle: 'Etat', type: 'statut', largeur: '100px' },
  ],
}
