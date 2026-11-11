/**
 * Description du référentiel « Participants ».
 *
 * Un participant est un salarié couvert par l'IPM. Il se distingue de
 * l'adhérent, qui est la collectivité cotisante : plusieurs centaines de
 * participants se rattachent aux quatre adhérents de la SAR.
 *
 * Comme les autres sections, la page décrit ses champs et laisse
 * <Referentiel /> lister, chercher, filtrer, paginer et saisir. Elle reprend
 * les informations de la maquette d'origine et ses champs obligatoires -
 * astérisque et trait rouge tant qu'ils sont vides -, réécrits dans le
 * vocabulaire de l'application.
 */

import { listerEntreesSync } from '../../services/referentiels'

/** Options d'un référentiel tiers, filtrées et rendues au format attendu. */
const depuisReferentiel = (cle, predicat = () => true) =>
  listerEntreesSync(cle)
    .filter((e) => e.actif && predicat(e))
    .map((e) => ({ valeur: e.code, libelle: e.libelle }))

/**
 * Régimes des adhérents. L'IPM couvre les salariés en activité ; à leur
 * départ, les anciens salariés passent aux deux mutuelles - « CMM CR-SAR » et
 * « CMM NCR-SAR », régime MSS. C'est ce qui sépare les deux premiers onglets
 * de la page, et le serveur en déduit `retraite` (cf. Participant.retraite).
 */
export const REGIME_IPM = 'IPM'
export const REGIME_MUTUELLE = 'MSS'

/** Sociétés d'un régime donné, pour le filtre d'une liste. */
const societesDuRegime = (regime) => () => depuisReferentiel('adherents', (a) => a.type === regime)

/** « EPOUSE » → « Epouse » : les référentiels crient, pas les onglets. */
const capitaliser = (mot) => mot.charAt(0) + mot.slice(1).toLowerCase()

/** Libellé du type « le participant lui-même » dans le référentiel. */
const TYPE_PARTICIPANT = 'PARTICIPANT'

/**
 * Types de bénéficiaire, lus dans les données de base - sauf PARTICIPANT :
 * le participant n'est pas membre de sa propre famille.
 */
const typesBeneficiaire = () =>
  listerEntreesSync('types-beneficiaires').filter((t) => t.libelle !== TYPE_PARTICIPANT)

/** Conjoints, tous sexes : « Nb. Ep. » compte les épouses **et** les époux. */
const CONJOINTS = ['EPOUSE', 'EPOUX']

export const TYPES_PIECE = ['CIN', 'PASSEPORT', 'CARTE CONSULAIRE']

export const SITUATIONS_FAMILIALES = [
  { valeur: 'CELIBATAIRE', libelle: 'Célibataire' },
  { valeur: 'MARIE', libelle: 'Marié(e)' },
  { valeur: 'DIVORCE', libelle: 'Divorcé(e)' },
  { valeur: 'VEUF', libelle: 'Veuf(ve)' },
]

/**
 * Collège professionnel, à l'identique de l'application d'origine : **deux**
 * valeurs seulement - « Cadre » et « Non Cadre » (le `categprof` de LAMPS, où
 * les 664 participants réels ne portent que ces deux-là). C'est ce collège qui,
 * croisé au régime, forme les quatre adhérents.
 */
export const CATEGORIES = [
  { valeur: 'Cadre', libelle: 'Cadre' },
  { valeur: 'Non Cadre', libelle: 'Non Cadre' },
]

export const ETATS_CONTRAT = ['Ouverture', 'Fermeture', 'Radiation']

/**
 * Sortie d'un dossier : à chaque état terminal du participant répond l'état
 * de son contrat. Le serveur applique la même correspondance à
 * l'enregistrement - ici, elle sert à montrer le résultat dans la fiche au
 * moment où l'état change.
 */
const CONTRAT_DE_L_ETAT = { Résilié: 'Fermeture', Radié: 'Radiation' }

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
  vide: 'Aucun participant',
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
   * de la fiche - un dossier radié reste consultable - d'où l'absence de
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
      // à reconnaître le porteur au guichet - d'où sa place en tête de
      // l'identité, avant même le matricule.
      nom: 'photo',
      libelle: 'Photo',
      libelleForm: 'Photo d’identité',
      type: 'photo',
      // Posée depuis le mobile par le titulaire ; l'IPM ne fait que la
      // réinitialiser (cf. demandesPhoto.js).
      reinitialisable: true,
    },
    {
      nom: 'matricule',
      requis: true,
      libelle: 'Matricule',
      libelleForm: 'Matricule',
      largeur: '110px',
      mono: true,
      unique: true,
      // Quatre chiffres, comme l'application d'origine (« 0949 ») : le
      // serveur refuse tout autre format.
      maxLength: 4,
      majuscules: true,
    },
    {
      nom: 'nom',
      requis: true,
      libelle: 'Nom',
      libelleForm: 'Nom',
      largeur: '150px',
      majuscules: true,
    },
    {
      nom: 'prenoms',
      requis: true,
      libelle: 'Prénom',
      libelleForm: 'Prénom(s)',
    },
    {
      // Une liste plutôt que deux boutons radio : c'est le contrôle que
      // l'application emploie partout ailleurs pour un choix fermé.
      nom: 'sexe',
      requis: true,
      libelle: 'Sexe',
      libelleForm: 'Sexe',
      type: 'radio',
      options: [
        { valeur: 'M', libelle: 'Homme' },
        { valeur: 'F', libelle: 'Femme' },
      ],
      // Le tableau affiche « M » / « F » ; le formulaire propose des radios.
      afficherCode: true,
    },
    {
      nom: 'nationalite',
      requis: true,
      libelle: 'Nationalité',
      libelleForm: 'Pays (Nationalité)',
      options: PAYS,
      defaut: 'SEN',
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
    },
    {
      nom: 'situationFamiliale',
      requis: true,
      libelle: 'Situation familiale',
      libelleForm: 'Situation familiale',
      options: SITUATIONS_FAMILIALES,
    },
    {
      nom: 'dateNaissance',
      requis: true,
      libelle: 'D. naiss',
      libelleForm: 'Date de naissance',
      type: 'date',
    },
    {
      nom: 'lieuNaissance',
      requis: true,
      libelle: 'Lieu de naissance',
      libelleForm: 'Lieu de naissance',
      majuscules: true,
    },

    // --- Coordonnées -------------------------------------------------------
    {
      nom: 'adresse',
      requis: true,
      libelle: 'Adresse',
      libelleForm: 'Adresse',
    },
    {
      nom: 'mobile',
      requis: true,
      libelle: 'Portable',
      libelleForm: 'Tel. portable',
      largeur: '150px',
      mono: true,
      type: 'tel',
      // Indicatif prérempli dans le champ et non plus figé devant : il se
      // corrige pour un numéro étranger, comme chez les adhérents et les
      // fournisseurs de soins. Laissé seul, il n'est pas enregistré.
      amorce: '+221 ',
    },
    {
      nom: 'region',
      requis: true,
      libelle: 'Région',
      libelleForm: 'Région',
      options: REGIONS,
      defaut: 'Dakar',
    },
    {
      nom: 'email',
      requis: true,
      libelle: 'Email',
      libelleForm: 'Email',
      type: 'email',
    },

    // --- Situation professionnelle ----------------------------------------
    {
      nom: 'dateEmbauche',
      requis: true,
      libelle: 'Date d’embauche',
      libelleForm: 'Date d’embauche',
      type: 'date',
    },
    {
      nom: 'typeContrat',
      requis: true,
      libelle: 'Contrat',
      libelleForm: 'Type de contrat',
      type: 'radio',
      options: ['CDD', 'CDI'],
      // CDD et CDI côte à côte, sur une ligne, comme l'application d'origine.
      enLigne: true,
      defaut: 'CDI',
    },
    {
      nom: 'categorie',
      libelle: 'Catégorie',
      libelleForm: 'Catégorie professionnelle',
      largeur: '150px',
      options: CATEGORIES,
    },

    /**
     * Direction, département et service en cascade : chaque liste ne propose
     * que les entités rattachées à celle du dessus, lues dans le référentiel
     * « Structure ». Changer la direction vide les deux suivantes - sans quoi
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
      requis: true,
      libelle: 'Adhérent',
      libelleForm: 'Société',
      // Assez large pour « IPM SAR PERSONNEL CADRES » d'un seul tenant :
      // replié sur deux lignes, il faisait respirer une ligne sur trois.
      largeur: '225px',
      options: () => depuisReferentiel('adherents'),
    },
    {
      nom: 'numeroFiche',
      libelle: 'N° fiche',
      libelleForm: 'N° fiche',
      mono: true,
    },
    {
      nom: 'numeroContrat',
      libelle: 'N° contrat',
      libelleForm: 'N° contrat',
      mono: true,
    },
    {
      nom: 'dateSouscription',
      libelle: 'Souscription',
      libelleForm: 'Date de souscription',
      type: 'date',
    },
    {
      // Déduit de l'état du dossier, et non saisi à côté : un participant
      // radié a son contrat radié, un participant résilié son contrat fermé,
      // et tous les autres un contrat ouvert. Saisissable, il aurait fini par
      // dire l'inverse de la colonne « Etat » - et le changement d'état en
      // lot, qui n'envoie que l'état, l'aurait laissé en arrière. Le serveur
      // l'accorde à l'enregistrement (cf. ParticipantSerializer).
      nom: 'etatContrat',
      libelle: 'État',
      libelleForm: 'Etat Contrat',
      largeur: '120px',
      options: ETATS_CONTRAT,
      defaut: 'Ouverture',
      lectureSeule: true,
      valeur: (v) => CONTRAT_DE_L_ETAT[v.etat] || 'Ouverture',
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
   * haut (formulaireEnTete), puis trois sous-onglets. Le tout s'affiche dans le
   * panneau glissant ouvert par l'onglet « Nouveau Participant IPM », comme les
   * autres pages (fournisseurs de soins…).
   */
  formulaireEnTete: [
    {
      lignes: [
        // L'état tout en haut (visible seulement en modification : la colonne
        // des listes, absente de la création comme dans l'original).
        ['etat'],
        // Photo d'identité.
        ['photo'],
        // Deux colonnes régulières ; les libellés longs (société) en pleine
        // largeur.
        ['prenoms', 'nom'],
        ['sexe', 'situationFamiliale'],
        ['dateNaissance', 'lieuNaissance'],
        ['typePiece', 'numeroPiece'],
        ['matricule', 'nationalite'],
        ['adherent'],
      ],
    },
  ],

  formulaire: [
    {
      libelle: 'Coordonnées',
      sections: [{ lignes: [['adresse'], ['mobile', 'email'], ['region']] }],
    },
    {
      libelle: 'Infos professionnelles',
      sections: [
        {
          lignes: [
            ['dateEmbauche', 'typeContrat'],
            ['categorie', 'direction'],
            ['departement', 'service'],
          ],
        },
      ],
    },
    {
      libelle: 'Infos contrat IPM',
      sections: [
        {
          lignes: [
            ['numeroFiche', 'numeroContrat'],
            ['dateSouscription', 'etatContrat'],
            ['dateResiliation', 'dateRadiation'],
          ],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Vues « liste » : IPM, Retraités et Familles
// ---------------------------------------------------------------------------

/**
 * Âge en années révolues à partir d'une date ISO (AAAA-MM-JJ).
 *
 * Comptées de date à date, et non en divisant par 365,25 : la moyenne se
 * trompait d'un an pendant les quelques jours qui précèdent l'anniversaire,
 * et l'âge est ce qui ouvre ou ferme la couverture d'un enfant.
 */
const calculerAge = (dateISO) => {
  if (!dateISO) return ''
  const naissance = new Date(dateISO)
  if (Number.isNaN(naissance.getTime())) return ''
  const aujourdhui = new Date()
  const age = aujourdhui.getFullYear() - naissance.getFullYear()
  const avantAnniversaire =
    aujourdhui.getMonth() < naissance.getMonth() ||
    (aujourdhui.getMonth() === naissance.getMonth() && aujourdhui.getDate() < naissance.getDate())
  return avantAnniversaire ? age - 1 : age
}

/** Nombre de bénéficiaires d'un ou plusieurs types rattachés à un participant. */
const compterBeneficiaires = (matricule, ...types) =>
  listerEntreesSync('beneficiaires').filter(
    (b) => b.matriculePart === matricule && types.includes(b.typeBenef),
  ).length

/**
 * Ventilation des ayants droit rattachés aux participants donnés (par leur
 * matricule) : alimente la ligne de total sous le titre, comme l'application
 * d'origine (« Total Participants : N - Epoux(se) : N - Enfant : N »).
 */
const statsBeneficiaires = (matricules) => {
  const cibles = new Set(matricules)
  const compte = { EPOUSE: 0, EPOUX: 0, ENFANT: 0, AUTRE: 0, ASCENDANT: 0 }
  listerEntreesSync('beneficiaires').forEach((b) => {
    if (cibles.has(b.matriculePart) && compte[b.typeBenef] !== undefined) compte[b.typeBenef] += 1
  })
  return compte
}

/**
 * États d'un participant, du dossier déposé au dossier radié. Une seule liste
 * pour le filtre des listes et le champ de la fiche : ils ne peuvent diverger.
 */
export const ETATS_PARTICIPANT = ['En Attente', 'Actif', 'Suspendu', 'Résilié', 'Radié']

/**
 * Actions de lot communes aux listes de la page : faire passer d'un geste les
 * lignes cochées à un autre état. Chaque passage se confirme ; résilier et
 * radier, qui mettent fin à la couverture, se disent en rouge.
 */
const actionsChangementEtat = (quoi) =>
  ETATS_PARTICIPANT.map((etat) => ({
    libelle: etat,
    champs: { etat },
    message: `${quoi}(s) passé(s) à l’état « ${etat} »`,
    danger: etat === 'Résilié' || etat === 'Radié',
    titreConfirmation: 'Changer l’état',
    boutonConfirmation: `Passer à « ${etat} »`,
    confirmer: (n) => `Passer ${n} ${quoi}${n > 1 ? 's' : ''} à l’état « ${etat} » ?`,
  }))

/** Filtre d'état, commun aux deux listes de participants. */
const SEGMENTS_ETAT = {
  valeurs: [
    { valeur: 'tous', libelle: 'Tous', filtre: () => true },
    ...ETATS_PARTICIPANT.map((e) => ({
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
  {
    // Pastille dans le tableau ; liste déroulante dans la fiche, pour changer
    // l'état d'un participant depuis sa fenêtre de modification.
    nom: 'etat',
    libelle: 'Etat',
    libelleForm: 'Etat',
    type: 'statut',
    largeur: '110px',
    options: ETATS_PARTICIPANT,
  },
  {
    // Les conjoints, quel que soit leur sexe : une participante déclare un
    // époux, et la colonne affichait 0 pour elle alors que le total sous le
    // titre, lui, le comptait.
    nom: 'nbEpouses',
    libelle: 'Nb. Ep.',
    largeur: '70px',
    aligne: 'droite',
    valeurTableau: (e) => compterBeneficiaires(e.matricule, ...CONJOINTS),
  },
  {
    nom: 'nbEnfants',
    libelle: 'Nb. En.',
    largeur: '70px',
    aligne: 'droite',
    valeurTableau: (e) => compterBeneficiaires(e.matricule, 'ENFANT'),
  },
]

/** Fabrique une vue liste des participants (mêmes colonnes, source partagée). */
const listeParticipants = (extra) => ({
  ...PARTICIPANTS,
  ...extra,
  // La création se fait par l'onglet dédié, pas par un bouton de la liste.
  sansCreation: true,
  // On modifie en cliquant la ligne (le panneau s'ouvre) : pas de crayon, et la
  // ligne en cours d'édition se colore en rouge. Comme données de base.
  modificationParLigne: true,
  // Pas de titre en gras au-dessus de la liste : le nom de la liste - ou de
  // la société filtrée - se lit déjà dans la légende du total (`legendeStats`).
  sansTitre: true,
  // Cases à cocher : changer d'un geste l'état des participants cochés - un,
  // deux, ou tous par l'en-tête.
  // Export partiel d'abord - seules les lignes cochées partent dans le
  // fichier -, puis les changements d'état.
  actionsLot: [
    { libelle: 'Export Excel', type: 'export' },
    ...actionsChangementEtat('participant'),
  ],
  // Seul le sélecteur Société, comme la maquette (pas de filtre catégorie).
  // Son étiquette se pose au-dessus, comme « Spécialité » chez les fournisseurs.
  // Il ne propose que les sociétés du régime de la liste : les mutuelles n'ont
  // rien à faire au-dessus des salariés en activité, et réciproquement - le
  // choix n'aurait ramené aucune ligne.
  filtres: [
    {
      champ: 'adherent',
      etiquette: 'Société',
      libelle: 'Toutes les sociétés',
      options: societesDuRegime(extra.regime),
    },
  ],
  // Recherche et filtre soulignés, sans cadre ni loupe, comme sur les
  // fournisseurs de soins.
  champsSoulignes: true,
  // Recherche et Société à gauche ; les états (Tous, En Attente, Actif…)
  // rejoignent l'Export Excel, tout à droite - comme les autres pages.
  segmentsADroite: true,
  // Légende de la vue : la société filtrée, comme l'original (« IPM SAR
  // PERSONNEL MOO »). Rien tant qu'aucune société n'est choisie (« Toutes »).
  legendeStats: (filtres) => {
    if (!filtres.adherent) return ''
    const soc = listerEntreesSync('adherents').find((a) => a.code === filtres.adherent)
    return soc ? soc.libelle : ''
  },
  // Total et ventilation des ayants droit de la vue. Le libellé du total
  // distingue la liste (« Total Participants IPM » / « Total Retraités »).
  stats: (entrees) => {
    const c = statsBeneficiaires(entrees.map((e) => e.matricule))
    const total = extra.totalLibelle || 'Total Participants'
    return `${total}: ${entrees.length} - Epoux(se): ${c.EPOUSE + c.EPOUX} - Enfant: ${c.ENFANT}`
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
  totalLibelle: 'Total Participants IPM',
  regime: REGIME_IPM,
  filtreBase: (e) => !e.retraite,
})

export const PARTICIPANTS_RETRAITES = listeParticipants({
  libelle: 'Participants Retraités',
  totalLibelle: 'Total Retraités',
  regime: REGIME_MUTUELLE,
  filtreBase: (e) => e.retraite,
})

/** Onglet Familles : les bénéficiaires rattachés aux participants. */
export const FAMILLES = {
  cle: 'beneficiaires',
  vide: 'Aucun bénéficiaire',
  libelle: 'Familles',
  sansCreation: true,
  // Modification au clic sur la ligne (panneau + ligne en rouge), comme les
  // listes de participants.
  modificationParLigne: true,
  // Pas de titre en gras au-dessus du total : l'onglet « Familles » le dit
  // déjà, comme sur les listes de participants.
  sansTitre: true,
  outils: ['export'],
  // Recherche soulignée, comme les autres onglets de la page.
  champsSoulignes: true,
  // Recherche à gauche ; les types (Tous, Epouse…) et l'export à droite,
  // comme sur les listes de participants.
  segmentsADroite: true,
  // Cases à cocher, comme sur les listes de participants : changer d'un geste
  // l'état des bénéficiaires cochés.
  // Export partiel d'abord, puis les changements d'état.
  actionsLot: [
    { libelle: 'Export Excel', type: 'export' },
    ...actionsChangementEtat('bénéficiaire'),
  ],
  taillePage: 12,
  nommer: (e) => `${e.prenoms || ''} ${e.nom || ''}`.trim(),

  // Ventilation des ayants droit affichés, comme l'application d'origine :
  // « Epoux : N / Epouses : N / Enfants : N / Autres : N ».
  stats: (entrees) => {
    const c = { EPOUX: 0, EPOUSE: 0, ENFANT: 0, ASCENDANT: 0, AUTRE: 0 }
    entrees.forEach((b) => {
      if (c[b.typeBenef] !== undefined) c[b.typeBenef] += 1
    })
    return `Epoux: ${c.EPOUX} - Epouses: ${c.EPOUSE} - Enfants: ${c.ENFANT} - Autres: ${c.ASCENDANT + c.AUTRE}`
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

  // Un onglet par type de bénéficiaire des données de base, dans l'ordre du
  // référentiel : la liste recopiée qui tenait ici ignorait « AUTRES », qui
  // n'avait donc aucun onglet - et en aurait manqué un de plus à chaque type
  // ajouté.
  segments: {
    valeurs: () => [
      { valeur: 'tous', libelle: 'Tous', filtre: () => true },
      ...typesBeneficiaire().map((t) => ({
        valeur: t.libelle,
        libelle: capitaliser(t.libelle),
        filtre: (b) => b.typeBenef === t.libelle,
      })),
    ],
  },

  colonnes: [
    {
      // Portrait de la carte d'ayant droit, comme la photo du participant et
      // à la même place : en tête de l'identité. Le participant la pose le
      // plus souvent depuis l'application mobile, pour les siens ; le
      // gestionnaire la voit alors ici, et peut la poser lui aussi.
      nom: 'photo',
      libelle: 'Photo',
      libelleForm: 'Photo d’identité',
      type: 'photo',
      // Posée depuis le mobile par le titulaire ; l'IPM ne fait que la
      // réinitialiser (cf. demandesPhoto.js).
      reinitialisable: true,
    },
    {
      // Composé par le serveur : société, matricule du participant, code du
      // type et rang dans ce type (« 02-0949-21 »). Modifiable, il aurait fini
      // par désigner quelqu'un d'autre que la fiche qui le porte.
      nom: 'matriculeBenef',
      libelle: 'Matri. benef.',
      libelleForm: 'Matricule bénéficiaire',
      mono: true,
      largeur: '130px',
      lectureSeule: true,
    },
    {
      // Lus dans le référentiel « Types de bénéficiaire » des données de
      // base - sauf PARTICIPANT : le participant n'est pas membre de sa
      // propre famille. Le libellé circule (« EPOUSE ») ; le serveur en tire
      // le code du matricule (« 02-0949-21 »).
      nom: 'typeBenef',
      libelle: 'Type benef',
      libelleForm: 'Type de bénéficiaire',
      largeur: '110px',
      options: () => typesBeneficiaire().map((t) => ({ valeur: t.libelle, libelle: t.libelle })),
      libelleSeul: true,
    },
    { nom: 'prenoms', libelle: 'Prénom(s)', libelleForm: 'Prénom(s)' },
    { nom: 'nom', libelle: 'Nom', libelleForm: 'Nom' },
    {
      // Le porteur ne change pas : son matricule est au milieu de celui du
      // bénéficiaire, et le rang à la fin compte les frères et sœurs de cette
      // famille-là. Rattacher la fiche ailleurs l'aurait laissée désigner la
      // première.
      nom: 'matriculePart',
      libelle: 'Matri. Part.',
      libelleForm: 'Matricule participant',
      mono: true,
      largeur: '120px',
      lectureSeule: true,
    },
    // Nom et société du participant : lus sur sa fiche par le serveur, ils se
    // montrent dans le formulaire sans se saisir.
    {
      nom: 'participant',
      libelle: 'Participant',
      libelleForm: 'Participant',
      largeur: '160px',
      lectureSeule: true,
    },
    {
      nom: 'codeSoc',
      libelle: 'Code soc.',
      libelleForm: 'Code société',
      mono: true,
      largeur: '80px',
      lectureSeule: true,
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
      // Calculé d'après la date de naissance : colonne du tableau seulement.
      nom: 'age',
      libelle: 'Age',
      largeur: '60px',
      calcule: true,
      valeurTableau: (e) => calculerAge(e.dateNaissance),
    },
    {
      nom: 'sexe',
      libelle: 'Sexe',
      libelleForm: 'Sexe',
      largeur: '60px',
      options: [
        { valeur: 'M', libelle: 'Homme' },
        { valeur: 'F', libelle: 'Femme' },
      ],
      afficherCode: true,
    },
    // Pastille dans le tableau ; liste déroulante dans la fiche, comme pour
    // un participant.
    {
      nom: 'etat',
      libelle: 'Etat',
      libelleForm: 'Etat',
      type: 'statut',
      largeur: '100px',
      options: ETATS_PARTICIPANT,
    },
  ],
}
