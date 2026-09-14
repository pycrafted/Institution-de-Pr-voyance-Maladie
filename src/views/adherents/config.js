/**
 * Description du référentiel « Adhérents ».
 *
 * Même grammaire que les référentiels de « Données de base » — le fichier
 * config.js de cette section-là documente chaque option en détail. La page ne
 * réécrit donc aucun composant : elle décrit ses champs et laisse
 * <Referentiel /> faire le reste, ce qui garantit qu'elle se comporte et
 * s'affiche exactement comme le reste de l'application.
 *
 * Un « adhérent » n'est pas une personne mais la collectivité qui cotise : une
 * catégorie de personnel de la SAR, ou une mutuelle. Les personnes couvertes,
 * elles, sont les « participants » et vivent dans leur propre section.
 */

/**
 * Les deux régimes en présence : l'IPM et la mutuelle (CMM). La cotisation IPM
 * se partage entre part SAR et part participant ; la cotisation Mutuelle est
 * unique.
 *
 * Codes de l'application d'origine : la mutuelle y est enregistrée « MSS » et
 * affichée « CMM ». On garde ce code — nos données restent compatibles avec
 * l'ancienne base — mais l'écran ne montre que le libellé, partout : l'original
 * affichait « MSS » dans son tableau et « CMM » dans sa liste, deux noms pour
 * une même chose.
 */
export const TYPES_ADHERENT = [
  { valeur: 'IPM', libelle: 'IPM' },
  { valeur: 'MSS', libelle: 'CMM' },
]

/** Le compte suit le code : adhérent 05 → compte 463005. */
const compteDuCode = (code) => (code ? `463${String(code).padStart(3, '0')}` : '')

export const ADHERENTS = {
  cle: 'adherents',
  libelle: 'Adhérents',
  nouveau: 'Nouvel adhérent',
  modifier: 'Modifier l’adhérent',

  // La maquette de cette page-ci ne montre que l'export, contrairement à celle
  // des fournisseurs de soins qui porte aussi l'import.
  outils: ['export'],

  // Recherche soulignée, sans cadre ni loupe, comme sur les fournisseurs.
  champsSoulignes: true,

  // Cases à cocher, comme pour les fournisseurs de soins : suspendre ou
  // réactiver d'un geste une sélection d'adhérents — un, deux ou tous, par la
  // case d'en-tête.
  selection: true,
  actionsLot: [
    { libelle: 'Réactiver', champs: { actif: true }, message: 'réactivés' },
    {
      libelle: 'Suspendre',
      champs: { actif: false },
      message: 'suspendus',
      danger: true,
      // Suspendre un adhérent le met hors circuit : sur plusieurs à la fois,
      // on confirme.
      confirmer: (n) => `Suspendre ${n} adhérent${n > 1 ? 's' : ''} ?`,
    },
  ],

  // Quatre colonnes seulement : de quoi identifier la collectivité et
  // retrouver son compte. Cotisations, seuils et point focal se lisent dans la
  // fiche — quinze colonnes défilant à l'horizontale ne se lisent pas.
  colonnesTableau: ['code', 'type', 'libelle', 'compte', 'actif'],

  // Le code est séquentiel et attribué par l'application, comme les codes de
  // la structure : deux adhérents créés le même jour ne peuvent pas entrer en
  // collision, et personne n'a à deviner le prochain numéro libre.
  genererCode: (valeurs, entrees) =>
    String(entrees.reduce((max, e) => Math.max(max, Number(e.code) || 0), 0) + 1).padStart(2, '0'),

  colonnes: [
    {
      // Proposé par l'application — le numéro suivant — et prérempli dès
      // l'ouverture d'un « Nouvel adhérent », comme dans l'application
      // d'origine ; mais modifiable, comme le compte qui en découle.
      nom: 'code',
      libelle: 'Code',
      libelleForm: 'Code adhérent',
      largeur: '80px',
      mono: true,
      requis: true,
      unique: true,
      // Deux caractères : la taille du code en base.
      maxLength: 2,
      valeurProposee: (valeurs, entrees) => ADHERENTS.genererCode(valeurs, entrees),
    },
    {
      nom: 'type',
      libelle: 'Type',
      libelleForm: 'Type',
      largeur: '90px',
      options: TYPES_ADHERENT,
      // Comme l'application d'origine : le tableau montre le code enregistré
      // (« MSS »), la liste déroulante le libellé (« CMM »), sans « MSS - CMM ».
      afficherCode: true,
      libelleSeul: true,
      requis: true,
    },
    {
      nom: 'libelle',
      libelle: 'Libellé',
      libelleForm: 'Libellé adhérent',
      requis: true,
      majuscules: true,
    },
    {
      // Proposé d'après le code (05 → 463005) et prérempli dès la création,
      // comme dans l'application d'origine — mais modifiable : la comptabilité
      // peut avoir à le corriger.
      nom: 'compte',
      libelle: 'Compte',
      libelleForm: 'Compte',
      largeur: '110px',
      mono: true,
      requis: true,
      unique: true,
      maxLength: 6,
      valeurProposee: (valeurs) => compteDuCode(valeurs.code),
    },
    {
      // État de l'adhérent : Actif ou Suspendu. Un adhérent suspendu reste
      // enregistré, simplement mis hors circuit. Affiché en colonne dans le
      // tableau ; dans le formulaire, seulement en modification — un nouvel
      // adhérent est forcément actif, la bascule n'y aurait aucun sens. La
      // modification se reconnaît à l'identifiant de la fiche en base, et non
      // au code, désormais présent dès la création.
      nom: 'actif',
      libelle: 'Etat',
      libelleForm: 'Etat',
      type: 'etat',
      defaut: true,
      largeur: '110px',
      visible: (valeurs) => Boolean(valeurs.id),
    },
    {
      nom: 'adresse',
      libelle: 'Adresse',
      libelleForm: 'Adresse adhérent',
    },
    {
      nom: 'telephone',
      libelle: 'Téléphone',
      libelleForm: 'Téléphone fixe',
      mono: true,
      type: 'tel',
      prefixe: '+221',
    },
    {
      // La case porte son propre libellé : l'abréviation de la maquette
      // d'origine — « Régul. Systèmatique (Frais Mdcx.) » — est écrite en
      // toutes lettres, une case à cocher se lisant une fois et devant se
      // comprendre sans décodage.
      nom: 'regulSystematique',
      libelle: 'Régularisation',
      libelleForm: 'Régularisation systématique des frais médicaux',
      type: 'booleen',
    },

    // --- Cotisations, en francs CFA ---------------------------------------
    // La part « salariale » est celle du participant, la part « patronale »
    // celle de la SAR : les libellés le disent en clair, sur le bon champ.
    {
      nom: 'cotisationIpmSalariale',
      libelle: 'Cot. IPM Participant',
      libelleForm: 'Cotisation IPM Participant',
      type: 'number',
    },
    {
      nom: 'cotisationIpmPatronale',
      libelle: 'Cot. IPM SAR',
      libelleForm: 'Cotisation IPM SAR',
      type: 'number',
    },
    {
      nom: 'cotisationMss',
      libelle: 'Cot. Mutuelle',
      libelleForm: 'Cotisation Mutuelle',
      type: 'number',
    },

    // --- Plafonds de gestion ----------------------------------------------
    {
      nom: 'seuilEndettement',
      libelle: 'Seuil endettement',
      libelleForm: 'Seuil endettement (FCFA)',
      type: 'number',
    },
    {
      nom: 'seuilConsommation',
      libelle: 'Seuil consommation',
      libelleForm: 'Seuil consommation (FCFA)',
      type: 'number',
    },

    // --- Point focal : l'interlocuteur de l'IPM chez l'adhérent ------------
    {
      nom: 'focalNom',
      libelle: 'Point focal',
      libelleForm: 'Prénom & nom',
    },
    {
      nom: 'focalTelephone',
      libelle: 'Téléphone point focal',
      libelleForm: 'Téléphone',
      mono: true,
      type: 'tel',
      prefixe: '+221',
    },
    {
      nom: 'focalEmail',
      libelle: 'Email point focal',
      libelleForm: 'Email',
      type: 'email',
    },
  ],

  // Un seul onglet, disposé comme l'application d'origine : identité et
  // coordonnées, puis les trois cotisations et les deux seuils en rangées, et
  // le point focal pour finir.
  formulaire: [
    {
      libelle: 'Adhérent',
      sections: [
        {
          lignes: [
            ['code', 'compte', 'type', 'actif'],
            ['libelle'],
            ['adresse'],
            ['telephone', 'regulSystematique'],
            // Mutuelle, puis part participant (salariale), puis part SAR
            // (patronale) : l'ordre de l'application d'origine.
            ['cotisationMss', 'cotisationIpmSalariale', 'cotisationIpmPatronale'],
            ['seuilEndettement', 'seuilConsommation'],
          ],
        },
        {
          titre: 'Point focal',
          lignes: [['focalNom'], ['focalTelephone', 'focalEmail']],
        },
      ],
    },
  ],
}
