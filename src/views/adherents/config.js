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
 * Déclarés comme de simples chaînes, donc affichés tels quels.
 */
export const TYPES_ADHERENT = ['IPM', 'CMM']

export const ADHERENTS = {
  cle: 'adherents',
  libelle: 'Adhérents',
  nouveau: 'Nouvel adhérent',
  modifier: 'Modifier l’adhérent',

  // La maquette de cette page-ci ne montre que l'export, contrairement à celle
  // des fournisseurs de soins qui porte aussi l'import.
  outils: ['export'],

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
      nom: 'code',
      libelle: 'Code',
      libelleForm: 'Code adhérent',
      largeur: '80px',
      mono: true,
      // Engendré à la création, jamais saisi : montré en lecture seule à la
      // modification (le code existe alors), masqué à la création où il n'a pas
      // encore de valeur — un champ vide et non saisissable n'aurait aucun sens.
      lectureSeule: true,
      visible: (valeurs) => Boolean(valeurs.code),
    },
    {
      nom: 'type',
      libelle: 'Type',
      libelleForm: 'Régime',
      largeur: '90px',
      options: TYPES_ADHERENT,
      requis: true,
    },
    {
      nom: 'libelle',
      libelle: 'Libellé',
      libelleForm: 'Libellé adhérent',
      placeholder: 'IPM SAR PERSONNEL MOO',
      requis: true,
      majuscules: true,
    },
    {
      nom: 'compte',
      libelle: 'Compte',
      libelleForm: 'Compte',
      placeholder: '463005',
      largeur: '110px',
      mono: true,
      requis: true,
      unique: true,
      maxLength: 6,
    },
    {
      // État de l'adhérent : Actif ou Suspendu. Un adhérent suspendu reste
      // enregistré, simplement mis hors circuit. Affiché en colonne dans le
      // tableau ; dans le formulaire, seulement en modification — un nouvel
      // adhérent est forcément actif, la bascule n'y aurait aucun sens.
      nom: 'actif',
      libelle: 'Etat',
      libelleForm: 'Etat',
      type: 'etat',
      defaut: true,
      largeur: '110px',
      visible: (valeurs) => Boolean(valeurs.code),
    },
    {
      nom: 'adresse',
      libelle: 'Adresse',
      libelleForm: 'Adresse adhérent',
      placeholder: 'KM 18, ROUTE DE RUFISQUE — MBAO, DAKAR',
    },
    {
      nom: 'telephone',
      libelle: 'Téléphone',
      libelleForm: 'Téléphone fixe',
      mono: true,
      type: 'tel',
      prefixe: '+221',
      placeholder: '33 839 61 00',
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
      placeholder: '8500',
    },
    {
      nom: 'cotisationIpmPatronale',
      libelle: 'Cot. IPM SAR',
      libelleForm: 'Cotisation IPM SAR',
      type: 'number',
      placeholder: '8500',
    },
    {
      nom: 'cotisationMss',
      libelle: 'Cot. Mutuelle',
      libelleForm: 'Cotisation Mutuelle',
      type: 'number',
      placeholder: '5000',
    },

    // --- Plafonds de gestion ----------------------------------------------
    {
      nom: 'seuilEndettement',
      libelle: 'Seuil endettement',
      libelleForm: 'Seuil endettement (FCFA)',
      type: 'number',
      placeholder: '250000',
    },
    {
      nom: 'seuilConsommation',
      libelle: 'Seuil consommation',
      libelleForm: 'Seuil consommation (FCFA)',
      type: 'number',
      placeholder: '1500000',
    },

    // --- Point focal : l'interlocuteur de l'IPM chez l'adhérent ------------
    {
      nom: 'focalNom',
      libelle: 'Point focal',
      libelleForm: 'Prénom & nom',
      placeholder: 'Awa NDIAYE',
    },
    {
      nom: 'focalTelephone',
      libelle: 'Téléphone point focal',
      libelleForm: 'Téléphone',
      mono: true,
      type: 'tel',
      prefixe: '+221',
      placeholder: '77 512 40 18',
    },
    {
      nom: 'focalEmail',
      libelle: 'Email point focal',
      libelleForm: 'Email',
      type: 'email',
      placeholder: 'a.ndiaye@sar.sn',
    },
  ],

  // Un seul onglet, quatre sections : la fiche tient sur une colonne, la
  // découper en onglets obligerait à naviguer pour saisir quinze champs.
  formulaire: [
    {
      libelle: 'Adhérent',
      sections: [
        {
          lignes: [
            ['code', 'compte', 'type', 'actif'],
            ['libelle'],
            ['adresse'],
            ['telephone'],
            ['regulSystematique'],
          ],
        },
        {
          titre: 'Cotisations',
          // SAR (part patronale) puis Participant (part salariale).
          lignes: [['cotisationIpmPatronale', 'cotisationIpmSalariale'], ['cotisationMss']],
        },
        {
          titre: 'Seuils',
          lignes: [['seuilEndettement', 'seuilConsommation']],
        },
        {
          titre: 'Point focal',
          lignes: [['focalNom'], ['focalTelephone'], ['focalEmail']],
        },
      ],
    },
  ],
}
