/**
 * Jeu de démonstration du tableau de bord.
 *
 * Aucune donnée réelle ici : la page est une maquette de mise en page et de
 * couleurs. Le jour où le back-end expose les agrégats, on remplace ce
 * fichier par un appel à `services/api.js` — la vue, elle, ne bouge pas.
 *
 * Les chiffres sont plausibles pour une IPM sénégalaise de taille moyenne :
 * ordres de grandeur, saisonnalité et écarts réalistes, pour que la maquette
 * se lise comme l'écran final et pas comme un gabarit rempli au hasard.
 */

// -----------------------------------------------------------------------------
// Formats
// -----------------------------------------------------------------------------
const fmtEntier = new Intl.NumberFormat('fr-FR')
const fmtDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formaterEntier = (v) => fmtEntier.format(v)

/** Montants en francs CFA, abrégés dès le million : 68,4 M au lieu de 68 400 000. */
export const formaterMontant = (v) => {
  if (Math.abs(v) >= 1_000_000) return `${fmtDecimal.format(v / 1_000_000)} M`
  if (Math.abs(v) >= 1_000) return `${fmtEntier.format(Math.round(v / 1_000))} k`
  return fmtEntier.format(v)
}

export const formaterPourcent = (v) => `${fmtDecimal.format(v)} %`

/** Écart signé : le signe fait partie de la valeur, il n'est pas déduit du sens. */
export const formaterEcart = (v) => `${v > 0 ? '+' : '−'} ${fmtDecimal.format(Math.abs(v))} %`

// -----------------------------------------------------------------------------
// Filtre de période — une seule barre, au-dessus de tout ce qu'elle cadre
// -----------------------------------------------------------------------------
export const PERIODES = [
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'trimestre', libelle: 'Trimestre' },
  { cle: 'exercice', libelle: 'Exercice' },
]

/**
 * Repère de comparaison des écarts. Il n'est plus écrit dans la tuile — la
 * période est déjà annoncée par le sélecteur en haut de page, et quatre fois
 * la même mention faisait une rangée bavarde — mais il reste attaché à
 * l'écart, où il s'affiche au survol.
 */
const COMPARAISON = {
  mois: 'vs mois préc.',
  trimestre: 'vs trim. préc.',
  exercice: 'vs exercice préc.',
}

// -----------------------------------------------------------------------------
// Indicateurs de tête
// -----------------------------------------------------------------------------
// Chaque indicateur déclare le sens dans lequel une hausse est une bonne
// nouvelle (`hausseFavorable`) : sur un délai de règlement, monter est une
// mauvaise nouvelle. C'est la seule chose que la couleur code encore ici.
const KPIS = {
  mois: [
    {
      cle: 'adherents',
      libelle: 'Adhérents actifs',
      valeur: 1284,
      format: 'entier',
      ecart: 3.4,
      hausseFavorable: true,
      tendance: [1180, 1195, 1188, 1210, 1224, 1219, 1236, 1248, 1241, 1262, 1271, 1284],
    },
    {
      cle: 'participants',
      libelle: 'Participants couverts',
      valeur: 4962,
      format: 'entier',
      ecart: 5.1,
      hausseFavorable: true,
      tendance: [4402, 4468, 4501, 4530, 4588, 4612, 4671, 4720, 4744, 4818, 4890, 4962],
    },
    {
      cle: 'depenses',
      libelle: 'Dépenses engagées',
      valeur: 68_400_000,
      format: 'montant',
      unite: 'FCFA',
      ecart: 8.7,
      hausseFavorable: false,
      tendance: [
        51_200_000, 54_800_000, 52_100_000, 57_600_000, 60_300_000, 58_900_000, 61_400_000,
        59_700_000, 63_200_000, 62_100_000, 65_800_000, 68_400_000,
      ],
    },
    {
      cle: 'delai',
      libelle: 'Délai moyen de règlement',
      valeur: 11.4,
      format: 'jours',
      ecart: -12.3,
      hausseFavorable: false,
      tendance: [17.2, 16.8, 16.1, 15.4, 15.9, 14.7, 14.2, 13.8, 13.1, 12.6, 13.0, 11.4],
    },
  ],
  trimestre: [
    {
      cle: 'adherents',
      libelle: 'Adhérents actifs',
      valeur: 1284,
      format: 'entier',
      ecart: 6.9,
      hausseFavorable: true,
      tendance: [1102, 1131, 1148, 1166, 1180, 1199, 1214, 1228, 1241, 1258, 1270, 1284],
    },
    {
      cle: 'participants',
      libelle: 'Participants couverts',
      valeur: 4962,
      format: 'entier',
      ecart: 9.8,
      hausseFavorable: true,
      tendance: [4106, 4188, 4241, 4310, 4372, 4441, 4508, 4602, 4684, 4771, 4866, 4962],
    },
    {
      cle: 'depenses',
      libelle: 'Dépenses engagées',
      valeur: 191_700_000,
      format: 'montant',
      unite: 'FCFA',
      ecart: 4.2,
      hausseFavorable: false,
      tendance: [
        160_400_000, 164_800_000, 158_200_000, 171_600_000, 176_300_000, 169_900_000, 178_400_000,
        174_700_000, 183_200_000, 180_100_000, 187_800_000, 191_700_000,
      ],
    },
    {
      cle: 'delai',
      libelle: 'Délai moyen de règlement',
      valeur: 12.6,
      format: 'jours',
      ecart: -7.8,
      hausseFavorable: false,
      tendance: [16.4, 16.0, 15.7, 15.1, 15.4, 14.6, 14.1, 13.7, 13.4, 13.0, 12.9, 12.6],
    },
  ],
  exercice: [
    {
      cle: 'adherents',
      libelle: 'Adhérents actifs',
      valeur: 1284,
      format: 'entier',
      ecart: 14.6,
      hausseFavorable: true,
      tendance: [988, 1020, 1052, 1074, 1101, 1128, 1156, 1181, 1204, 1232, 1258, 1284],
    },
    {
      cle: 'participants',
      libelle: 'Participants couverts',
      valeur: 4962,
      format: 'entier',
      ecart: 18.2,
      hausseFavorable: true,
      tendance: [3808, 3902, 4014, 4108, 4196, 4288, 4390, 4488, 4602, 4718, 4840, 4962],
    },
    {
      cle: 'depenses',
      libelle: 'Dépenses engagées',
      // Somme exacte de la série ACTIVITE.exercice.engage : un chiffre de tête
      // qui ne retomberait pas sur la courbe juste en dessous décrédibilise
      // l'écran entier.
      valeur: 710_900_000,
      format: 'montant',
      unite: 'FCFA',
      ecart: 11.5,
      hausseFavorable: false,
      tendance: [
        524_000_000, 548_000_000, 571_000_000, 592_000_000, 614_000_000, 633_000_000, 651_000_000,
        665_000_000, 679_000_000, 691_000_000, 701_000_000, 710_900_000,
      ],
    },
    {
      cle: 'delai',
      libelle: 'Délai moyen de règlement',
      valeur: 13.2,
      format: 'jours',
      ecart: -21.4,
      hausseFavorable: false,
      tendance: [18.8, 18.1, 17.6, 17.0, 16.4, 15.9, 15.3, 14.8, 14.4, 13.9, 13.6, 13.2],
    },
  ],
}

// -----------------------------------------------------------------------------
// Graphique principal — engagé vs remboursé
// -----------------------------------------------------------------------------
// Deux séries, même unité, un seul axe. Comparer un nombre de dossiers à un
// montant sur deux échelles superposées inventerait une corrélation qui
// n'existe pas : les deux courbes sont donc des montants.
const ACTIVITE = {
  mois: {
    intitule: 'Juillet 2026',
    axes: ['S 27', 'S 28', 'S 29', 'S 30', 'S 31'],
    engage: [14.8, 16.2, 15.1, 12.4, 9.9],
    rembourse: [13.1, 14.9, 13.8, 10.2, 6.4],
  },
  trimestre: {
    intitule: 'Mai – juillet 2026',
    axes: ['Mai', 'Juin', 'Juillet'],
    engage: [62.1, 61.2, 68.4],
    rembourse: [59.8, 58.4, 58.6],
  },
  exercice: {
    intitule: 'Août 2025 – juillet 2026',
    axes: [
      'Août',
      'Sept.',
      'Oct.',
      'Nov.',
      'Déc.',
      'Janv.',
      'Févr.',
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
    ],
    engage: [51.2, 54.8, 52.1, 57.6, 60.3, 58.9, 61.4, 59.7, 63.2, 62.1, 61.2, 68.4],
    rembourse: [48.9, 52.4, 50.6, 54.1, 57.8, 55.2, 58.9, 57.1, 60.4, 59.8, 58.4, 58.6],
  },
}

/**
 * Le pied du graphique principal : quatre agrégats, jaugés sur leur cible.
 *
 * Le taux et le ticket modérateur sont les deux faces d'un même rapport et
 * se déduisent des deux courbes du dessus (remboursé ÷ engagé) : ils doivent
 * rester cohérents avec elles, sinon la carte se contredit toute seule.
 */
const SYNTHESE = {
  mois: [
    { cle: 'taux', libelle: 'Taux de remboursement', valeur: 85.4, cible: 100 },
    { cle: 'dossiers', libelle: 'Dossiers traités', valeur: 1642, cible: 2097 },
    { cle: 'ticket', libelle: 'Ticket modérateur', valeur: 14.6, cible: 100 },
    { cle: 'conventionnes', libelle: 'Actes conventionnés', valeur: 91.2, cible: 100 },
  ],
  trimestre: [
    { cle: 'taux', libelle: 'Taux de remboursement', valeur: 92.2, cible: 100 },
    { cle: 'dossiers', libelle: 'Dossiers traités', valeur: 4918, cible: 5602 },
    { cle: 'ticket', libelle: 'Ticket modérateur', valeur: 7.8, cible: 100 },
    { cle: 'conventionnes', libelle: 'Actes conventionnés', valeur: 89.6, cible: 100 },
  ],
  exercice: [
    { cle: 'taux', libelle: 'Taux de remboursement', valeur: 94.6, cible: 100 },
    { cle: 'dossiers', libelle: 'Dossiers traités', valeur: 19_284, cible: 21_460 },
    { cle: 'ticket', libelle: 'Ticket modérateur', valeur: 5.4, cible: 100 },
    { cle: 'conventionnes', libelle: 'Actes conventionnés', valeur: 88.1, cible: 100 },
  ],
}

// -----------------------------------------------------------------------------
// Cartes secondaires
// -----------------------------------------------------------------------------
// Une seule série : une seule couleur pour toutes les barres. Assombrir les
// grandes redirait en teinte ce que la hauteur dit déjà.
export const PRESTATIONS_PAR_TYPE = [
  { libelle: 'Pharmacie', valeur: 21.4 },
  { libelle: 'Consultation', valeur: 16.8 },
  { libelle: 'Hospitalisation', valeur: 12.2 },
  { libelle: 'Analyses', valeur: 8.1 },
  { libelle: 'Imagerie', valeur: 6.4 },
  { libelle: 'Dentaire', valeur: 3.5 },
]

// Part d'un tout, lisible d'un coup d'œil : quatre segments, pas davantage.
export const REPARTITION_PARTICIPANTS = [
  { libelle: 'Adhérents', valeur: 1284 },
  { libelle: 'Conjoints', valeur: 1106 },
  { libelle: 'Enfants', valeur: 2231 },
  { libelle: 'Ascendants', valeur: 341 },
]

// Radar : deux populations comparées sur les mêmes axes. La forme ne vaut que
// si les axes partagent une unité — d'où un indice de consommation ramené à
// 100, et non des montants qui écraseraient les petites spécialités.
export const PROFIL_SPECIALITES = {
  axes: ['Généraliste', 'Pédiatrie', 'Gynécologie', 'Cardiologie', 'Dentaire', 'Ophtalmologie'],
  series: [
    { libelle: 'Adhérents', valeurs: [88, 24, 41, 62, 47, 35] },
    { libelle: 'Ayants droit', valeurs: [72, 81, 58, 19, 63, 44] },
  ],
}

// Part d'un tout, quatre secteurs : lisible d'un coup d'œil, sous la limite
// des six segments au-delà de laquelle un camembert cesse de se lire.
export const DEPENSES_PAR_SECTEUR = [
  { libelle: 'Privé conventionné', valeur: 312_400_000 },
  { libelle: 'Public', valeur: 208_700_000 },
  { libelle: 'Pharmacie', valeur: 147_200_000 },
  { libelle: 'Optique & dentaire', valeur: 42_600_000 },
]

// Aire polaire : angle constant, rayon proportionnel. Les tranches d'âge sont
// ordonnées, ce que la disposition circulaire respecte en tournant.
export const CONSOMMATION_PAR_AGE = [
  { libelle: '0 – 14 ans', valeur: 18.4 },
  { libelle: '15 – 29 ans', valeur: 11.2 },
  { libelle: '30 – 44 ans', valeur: 24.8 },
  { libelle: '45 – 59 ans', valeur: 31.6 },
  { libelle: '60 ans et +', valeur: 42.1 },
]

export const TOP_FOURNISSEURS = [
  { libelle: 'Clinique du Cap', valeur: 14_820_000 },
  { libelle: 'Pharmacie Guigon', valeur: 11_240_000 },
  { libelle: 'Hôpital Principal', valeur: 9_680_000 },
  { libelle: 'Institut Pasteur', valeur: 6_310_000 },
  { libelle: 'Cabinet Médina', valeur: 4_150_000 },
]

// Un état, pas une série : couleur réservée, toujours doublée du libellé.
// Portée : le mois en cours — le filtre de période ne cadre pas cette carte.
export const ETAT_DOSSIERS = [
  { cle: 'valide', libelle: 'Validés', valeur: 1642 },
  { cle: 'encours', libelle: 'En cours d’instruction', valeur: 318 },
  { cle: 'attente', libelle: 'En attente de pièces', valeur: 96 },
  { cle: 'rejete', libelle: 'Rejetés', valeur: 41 },
]

export const DERNIERS_REMBOURSEMENTS = [
  {
    dossier: 'RB-2026-04812',
    participant: 'Aïssatou Ndiaye',
    fournisseur: 'Clinique du Cap',
    type: 'Hospitalisation',
    montant: 428_500,
    etat: 'valide',
  },
  {
    dossier: 'RB-2026-04811',
    participant: 'Moussa Diallo',
    fournisseur: 'Pharmacie Guigon',
    type: 'Pharmacie',
    montant: 36_200,
    etat: 'valide',
  },
  {
    dossier: 'RB-2026-04810',
    participant: 'Fatou Sow',
    fournisseur: 'Institut Pasteur',
    type: 'Analyses',
    montant: 74_000,
    etat: 'encours',
  },
  {
    dossier: 'RB-2026-04809',
    participant: 'Ibrahima Fall',
    fournisseur: 'Hôpital Principal',
    type: 'Imagerie',
    montant: 152_800,
    etat: 'attente',
  },
  {
    dossier: 'RB-2026-04808',
    participant: 'Coumba Bâ',
    fournisseur: 'Cabinet Médina',
    type: 'Consultation',
    montant: 18_000,
    etat: 'valide',
  },
  {
    dossier: 'RB-2026-04807',
    participant: 'Ousmane Sarr',
    fournisseur: 'Clinique du Cap',
    type: 'Dentaire',
    montant: 96_500,
    etat: 'rejete',
  },
]

export const LIBELLES_ETAT = {
  valide: 'Validé',
  encours: 'En cours',
  attente: 'Attente pièces',
  rejete: 'Rejeté',
}

/**
 * Rend tout ce que la période sélectionnée fait varier.
 * Les cartes qui n'en dépendent pas sont signalées à leur déclaration.
 *
 * @param {string} periode clé d'une entrée de PERIODES
 */
export const jeuPour = (periode) => ({
  kpis: KPIS[periode],
  comparaison: COMPARAISON[periode],
  activite: ACTIVITE[periode],
  synthese: SYNTHESE[periode],
})
