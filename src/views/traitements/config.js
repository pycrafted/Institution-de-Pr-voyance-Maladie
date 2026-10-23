/**
 * Description du module « Traitements → Factures ».
 *
 * Une facture est émise par un prestataire, réceptionnée par l'IPM, puis
 * traitée (rattachement des bons, liquidation), validée et comptabilisée.
 * Repris de l'écran « Traitements → Factures » de l'application d'origine
 * (captures 36 à 39).
 *
 * Tranche 1 : la **liste** (deux sous-onglets Fournisseurs de Soins /
 * Fournisseurs Divers) et la **réception** d'une facture. Le traitement et la
 * comptabilisation viendront aux tranches suivantes.
 *
 * Même grammaire que les référentiels : la page décrit ses champs et laisse
 * <Referentiel /> lister, filtrer, paginer et saisir. Servi par le backend
 * (/api/factures/) : N° interne et montant net posés/calculés par le serveur.
 */

import { EXERCICES, actifs, dateFr } from '../documents/commun'

/** États du cycle de vie, dans l'ordre (cf. filtre « État »). */
export const ETATS_FACTURE = [
  'Reçue',
  'En cours de traitement',
  'Traitée',
  'Comptabilisée',
  'Payée',
]

/** États du règlement (§17), dans l'ordre du filtre de la page Règlements. */
export const ETATS_REGLEMENT = ['Non Echue', 'Echue', 'Reglée', 'Comptabilisée', 'Annulée']

const entier = (valeur) => {
  const n = Number.parseInt(valeur, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Montant en francs CFA : « 50 000 ». */
const montantFr = (n) => entier(n).toLocaleString('fr-FR')

/** Montant net : F.réel − Remise − Ristourne − QP.Agent, jamais négatif. */
const montantNetDe = (v) =>
  Math.max(0, entier(v.fraisReel) - entier(v.remise) - entier(v.ristourne) - entier(v.qpAgent))

/** Options « code - libellé », comme les listes de l'application d'origine. */
const optionsAvecCode = (liste) =>
  liste.map((e) => ({ valeur: e.code, libelle: `${e.code} - ${e.libelle}` }))

const optionsAdherents = () => optionsAvecCode(actifs('adherents'))
const optionsSpecialites = () => optionsAvecCode(actifs('specialites'))

/** Fournisseurs de soins d'une spécialité (vide tant qu'elle n'est pas choisie). */
const optionsFournisseursSoins = (valeurs) =>
  valeurs.specialite
    ? optionsAvecCode(
        actifs('fournisseurs-de-soins').filter((f) => f.specialite === valeurs.specialite),
      )
    : []

/** Fournisseurs divers (administratifs), sans spécialité. */
const optionsFournisseursDivers = () => optionsAvecCode(actifs('fournisseurs-divers'))

/** Intitulé d'une spécialité, pour la colonne « Spécialité ». */
const libelleSpecialite = (code) =>
  actifs('specialites').find((s) => s.code === code)?.libelle || code

// --- Colonnes communes aux deux sous-onglets --------------------------------
const colonnesCommunes = [
  // Posés / calculés par le serveur ; absents du formulaire.
  { nom: 'numero', libelle: 'N°', largeur: '80px', mono: true, calcule: true },
  {
    nom: 'numeroFournisseur',
    libelle: 'N° facture Frs',
    libelleForm: 'N° facture',
    largeur: '140px',
    mono: true,
    maxLength: 40,
  },
  {
    nom: 'dateFacture',
    libelle: 'Date F.',
    libelleForm: 'Date facture',
    largeur: '110px',
    type: 'date',
    valeurTableau: (f) => dateFr(f.dateFacture),
  },
  {
    nom: 'recuLe',
    libelle: 'Reçu le',
    libelleForm: 'Reçu le',
    largeur: '110px',
    type: 'date',
    valeurTableau: (f) => dateFr(f.recuLe),
  },
  // Suite du cycle de vie : colonnes de la liste seulement (lecture).
  {
    nom: 'saisieLe',
    libelle: 'Saisie le',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.saisieLe),
  },
  {
    nom: 'traiteeLe',
    libelle: 'Traitée le',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.traiteeLe),
  },
  {
    nom: 'dateCompta',
    libelle: 'Date compta',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.dateCompta),
  },
  {
    nom: 'echeance',
    libelle: 'Echéance',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.echeance),
  },
  {
    nom: 'payeeLe',
    libelle: 'Payée le',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.payeeLe),
  },
  { nom: 'moisTraitement', libelle: 'Mois trait.', largeur: '110px', calcule: true },
  {
    nom: 'montantNet',
    libelle: 'Montant',
    libelleForm: 'Montant Net Facture',
    largeur: '120px',
    aligne: 'droite',
    lectureSeule: true,
    valeur: (v) => montantFr(montantNetDe(v)),
    valeurTableau: (f) => montantFr(f.montantNet),
  },
  // Entête facture : les montants de la réception.
  {
    nom: 'fraisReel',
    libelleForm: 'F. réel',
    largeur: '120px',
    type: 'number',
    aligne: 'droite',
    defaut: 0,
  },
  {
    nom: 'remise',
    libelleForm: 'Remise',
    largeur: '110px',
    type: 'number',
    aligne: 'droite',
    defaut: 0,
  },
  {
    nom: 'ristourne',
    libelleForm: 'Ristourne',
    largeur: '110px',
    type: 'number',
    aligne: 'droite',
    defaut: 0,
  },
  {
    nom: 'qpAgent',
    libelleForm: 'QP. Agent',
    largeur: '110px',
    type: 'number',
    aligne: 'droite',
    defaut: 0,
  },
  { nom: 'remboursementTicket', libelleForm: 'Remboursement Ticket', type: 'booleen' },
  // Mode du remboursement : n'apparaît que si « Remboursement Ticket » est coché
  // (capture 65). Banque par défaut (majoritaire dans LAMPS).
  {
    nom: 'typeRemb',
    libelleForm: 'Mode de remboursement',
    type: 'bascule',
    defaut: 'banque',
    options: () => [
      { valeur: 'compense', libelle: 'Compense' },
      { valeur: 'banque', libelle: 'Banque' },
    ],
    visible: (v) => Boolean(v.remboursementTicket),
  },
  { nom: 'avoir', libelleForm: 'Facture d’avoir', type: 'booleen' },
  // Fournisseur : le code (N° Frs) et le nom, lu sur sa fiche.
  { nom: 'fournisseur', libelle: 'Fournisseur', largeur: '220px', calcule: true },
  {
    nom: 'codeSoc',
    libelle: 'Code soc.',
    libelleForm: 'Société',
    largeur: '90px',
    mono: true,
    requis: true,
    afficherCode: true,
    options: optionsAdherents,
    libelleSeul: true,
  },
  { nom: 'saisiePar', libelle: 'Saisie par', largeur: '130px', calcule: true },
  { nom: 'traiteePar', libelle: 'Traitée par', largeur: '130px', calcule: true },
  { nom: 'comptabiliseePar', libelle: 'Comptabilisée par', largeur: '140px', calcule: true },
  // État du cycle de vie : badge dans la liste.
  { nom: 'etat', libelle: 'État', type: 'statut', largeur: '120px', options: ETATS_FACTURE },
  // --- Colonnes « Règlements » (§17) : lecture, pour la page Règlements. ---
  { nom: 'joursRetard', libelle: 'J. retard', largeur: '80px', aligne: 'droite', calcule: true },
  {
    nom: 'mpReglement',
    libelle: 'M.P',
    largeur: '60px',
    mono: true,
    calcule: true,
    valeurTableau: (f) => f.typeReglement || '',
  },
  {
    nom: 'dateReglement',
    libelle: 'Date Reg.',
    largeur: '110px',
    calcule: true,
    valeurTableau: (f) => dateFr(f.dateReglement),
  },
  {
    nom: 'etatReglement',
    libelle: 'État',
    type: 'statut',
    largeur: '120px',
    options: ETATS_REGLEMENT,
  },
]

// --- Barre de liste (Exercice · Société · État, puis Réceptionner) ----------
const barreFactures = (champsSupplementaires = []) => ({
  champsSoulignes: true,
  barreCompacte: true,
  rechercheEnDernier: true,
  rechercheFlottante: true,
  filtres: [
    {
      champ: 'exercice',
      etiquette: 'Exercice',
      libelle: 'Tous',
      options: EXERCICES,
      defaut: () => String(new Date().getFullYear()),
      largeur: '7rem',
    },
    { champ: 'codeSoc', etiquette: 'Société', libelle: '- Toutes -', options: optionsAdherents },
    {
      champ: 'etat',
      etiquette: 'État',
      libelle: '- Toutes -',
      options: ETATS_FACTURE.map((e) => ({ valeur: e, libelle: e })),
    },
    ...champsSupplementaires,
  ],
})

/** Base commune aux deux sous-onglets. */
const baseFactures = {
  cle: 'factures',
  vide: 'Aucune facture',
  nouveau: 'Réceptionner une facture',
  modifier: 'Modifier la facture',
  taillePage: 15,
  nommer: (f) => `la facture n° ${f.numero}`,
  // Pas de titre au-dessus de la liste : le sous-onglet le dit déjà.
  sansTitre: true,
  // Le bouton « Réceptionner » de la barre suffit : le tableau vide n'en répète
  // pas un second.
  sansCreationTableauVide: true,
  // On ouvre une facture en cliquant sa ligne (le panneau s'ouvre) : pas de
  // crayon, et la ligne en cours d'édition se colore en rouge. Les actions
  // « Traiter » / « Comptabiliser » restent, elles, dans la ligne.
  modificationParLigne: true,
  // Une facture ne se « désactive » pas, elle s'annule.
  etat: {
    actif: 'Valide',
    inactif: 'Annulée',
    desactiver: 'Annuler la facture',
    reactiver: 'Rétablir la facture',
    desactive: 'annulée',
    reactive: 'rétablie',
  },
  colonnesTableau: [
    'numero',
    'numeroFournisseur',
    'dateFacture',
    'recuLe',
    'saisieLe',
    'traiteeLe',
    'dateCompta',
    'echeance',
    'payeeLe',
    'moisTraitement',
    'montantNet',
    'codeFournisseur',
    'fournisseur',
    'specialite',
    'codeSoc',
    'saisiePar',
    'traiteePar',
    'comptabiliseePar',
    'etat',
  ],
}

// --- Sous-onglet « Fournisseurs de Soins » ----------------------------------
export const FACTURES_SOINS = {
  ...baseFactures,
  libelle: 'Factures Fournisseurs de Soins',
  filtreBase: (f) => f.typeFournisseur === 'soins',
  ...barreFactures([
    {
      champ: 'specialite',
      etiquette: 'Spécialité',
      libelle: '- Toutes -',
      options: optionsSpecialites,
    },
  ]),
  colonnes: [
    // Type figé pour ce sous-onglet (hors formulaire) : la réception crée bien
    // une facture « soins ».
    { nom: 'typeFournisseur', calcule: false, defaut: 'soins' },
    {
      nom: 'specialite',
      libelle: 'Spécialité',
      libelleForm: 'Spécialité',
      largeur: '150px',
      options: optionsSpecialites,
      // Le code est déjà dans le libellé de l'option (« 06 - PHARMACIES ») :
      // `libelleSeul` évite que le formulaire le rajoute (« 06 - 06 - … »).
      libelleSeul: true,
      valeurTableau: (f) => libelleSpecialite(f.specialite),
    },
    {
      nom: 'codeFournisseur',
      libelle: 'N° Frs',
      libelleForm: 'Fournisseur',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      dependDe: 'specialite',
      options: optionsFournisseursSoins,
      libelleSeul: true,
    },
    ...colonnesCommunes,
  ],
  formulaire: [
    {
      libelle: 'Réception Facture',
      sections: [
        { titre: 'Société', lignes: [['codeSoc']] },
        { titre: 'Informations du fournisseur', lignes: [['specialite', 'codeFournisseur']] },
        {
          titre: 'Entête facture',
          lignes: [
            ['numeroFournisseur', 'dateFacture', 'recuLe'],
            ['fraisReel', 'remise', 'ristourne', 'qpAgent'],
            ['montantNet'],
          ],
        },
        { lignes: [['remboursementTicket', 'avoir'], ['typeRemb']] },
      ],
    },
  ],
}

// --- Sous-onglet « Fournisseurs Divers » ------------------------------------
export const FACTURES_DIVERS = {
  ...baseFactures,
  libelle: 'Factures Fournisseurs Divers',
  filtreBase: (f) => f.typeFournisseur === 'divers',
  ...barreFactures(),
  // Pas de colonne « Spécialité » pour les divers : on la retire du tableau.
  colonnesTableau: baseFactures.colonnesTableau.filter((c) => c !== 'specialite'),
  colonnes: [
    { nom: 'typeFournisseur', calcule: false, defaut: 'divers' },
    { nom: 'specialite', libelle: 'Spécialité', calcule: true },
    {
      nom: 'codeFournisseur',
      libelle: 'N° Frs',
      libelleForm: 'Fournisseur',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      options: optionsFournisseursDivers,
      libelleSeul: true,
    },
    ...colonnesCommunes,
  ],
  formulaire: [
    {
      libelle: 'Réception Facture',
      sections: [
        { titre: 'Société', lignes: [['codeSoc']] },
        { titre: 'Fournisseur', lignes: [['codeFournisseur']] },
        {
          titre: 'Entête facture',
          lignes: [
            ['numeroFournisseur', 'dateFacture', 'recuLe'],
            ['fraisReel', 'remise', 'ristourne', 'qpAgent'],
            ['montantNet'],
          ],
        },
        { lignes: [['remboursementTicket', 'avoir'], ['typeRemb']] },
      ],
    },
  ],
}

// ============================================================================
// Règlements (§17) : le PAIEMENT des factures, l'étape après comptabilisation.
//
// Même liste que les factures, mais réduite aux factures parvenues à la
// comptabilisation (Comptabilisée ou Payée), filtrée par état de règlement et
// enrichie des colonnes de paiement (jours de retard, mode de paiement, date).
// On n'y crée ni ne modifie une facture : on la règle, via l'action « Régler »
// portée par la page (ReglementModal). Deux sous-onglets Soins / Divers, comme
// les factures.
// ============================================================================

/** Une facture entre dans les règlements dès qu'elle est comptabilisée. */
const estReglable = (f) => f.etat === 'Comptabilisée' || f.etat === 'Payée'

/** Filtre « État » des règlements, en segments (cf. ETATS_REGLEMENT). */
const segmentsReglement = {
  // `activite: true` : les segments portent eux-mêmes l'état (une facture
  // annulée a l'état de règlement « Annulée »), pas d'interrupteur « inactifs ».
  activite: true,
  valeurs: [
    { valeur: 'toutes', libelle: 'Toutes', filtre: () => true },
    { valeur: 'non-echue', libelle: 'Non Echue', filtre: (f) => f.etatReglement === 'Non Echue' },
    { valeur: 'echue', libelle: 'Echue', filtre: (f) => f.etatReglement === 'Echue' },
    { valeur: 'reglee', libelle: 'Reglée', filtre: (f) => f.etatReglement === 'Reglée' },
    {
      valeur: 'comptabilisee',
      libelle: 'Comptabilisée',
      filtre: (f) => f.etat === 'Comptabilisée',
    },
    { valeur: 'annulee', libelle: 'Annulée', filtre: (f) => f.etatReglement === 'Annulée' },
  ],
}

/** Barre de liste des règlements : Exercice · Société (l'état est en segments). */
const barreReglements = (champsSupplementaires = []) => ({
  champsSoulignes: true,
  barreCompacte: true,
  rechercheEnDernier: true,
  rechercheFlottante: true,
  segmentsADroite: true,
  filtres: [
    {
      champ: 'exercice',
      etiquette: 'Exercice',
      libelle: 'Tous',
      options: EXERCICES,
      defaut: () => String(new Date().getFullYear()),
      largeur: '7rem',
    },
    { champ: 'codeSoc', etiquette: 'Société', libelle: '- Toutes -', options: optionsAdherents },
    ...champsSupplementaires,
  ],
})

/** Stats du titre : « N Factures - total » (montant net cumulé de la vue). */
const statsReglement = (factures) => {
  const total = factures.reduce((s, f) => s + entier(f.montantNet), 0)
  return `${factures.length} Factures - ${montantFr(total)}`
}

/** Base commune aux deux sous-onglets de règlement. */
const baseReglements = {
  cle: 'factures',
  vide: 'Aucune facture à régler',
  taillePage: 15,
  sansTitre: true,
  // On ne crée pas de facture ici ; on règle.
  sansCreation: true,
  // Cases à cocher : on règle / marque en lot (comme l'application d'origine).
  selection: true,
  stats: statsReglement,
  nommer: (f) => `la facture n° ${f.numero}`,
  // Reprend le vocabulaire « Valide / Annulée » des factures (badge d'état).
  etat: baseFactures.etat,
  segments: segmentsReglement,
  colonnesTableau: [
    'numero',
    'numeroFournisseur',
    'dateFacture',
    'recuLe',
    'echeance',
    'joursRetard',
    'montantNet',
    'mpReglement',
    'dateReglement',
    'codeFournisseur',
    'fournisseur',
    'specialite',
    'codeSoc',
    'etatReglement',
  ],
}

// --- Sous-onglet « Fournisseurs de Soins » ----------------------------------
export const REGLEMENTS_SOINS = {
  ...baseReglements,
  libelle: 'Règlements Fournisseurs de Soins',
  filtreBase: (f) => f.typeFournisseur === 'soins' && estReglable(f),
  ...barreReglements([
    {
      champ: 'specialite',
      etiquette: 'Spécialité',
      libelle: '- Toutes -',
      options: optionsSpecialites,
    },
  ]),
  colonnes: [
    {
      nom: 'specialite',
      libelle: 'Spécialité',
      largeur: '150px',
      options: optionsSpecialites,
      valeurTableau: (f) => libelleSpecialite(f.specialite),
    },
    {
      nom: 'codeFournisseur',
      libelle: 'N° Frs',
      largeur: '90px',
      mono: true,
      afficherCode: true,
    },
    ...colonnesCommunes,
  ],
}

// --- Sous-onglet « Fournisseurs Divers » ------------------------------------
export const REGLEMENTS_DIVERS = {
  ...baseReglements,
  libelle: 'Règlements Fournisseurs Divers',
  filtreBase: (f) => f.typeFournisseur === 'divers' && estReglable(f),
  ...barreReglements(),
  colonnesTableau: baseReglements.colonnesTableau.filter((c) => c !== 'specialite'),
  colonnes: [
    { nom: 'specialite', libelle: 'Spécialité', calcule: true },
    {
      nom: 'codeFournisseur',
      libelle: 'N° Frs',
      largeur: '90px',
      mono: true,
      afficherCode: true,
    },
    ...colonnesCommunes,
  ],
}

/** Mode de paiement en toutes lettres (colonne « M.P » et modal). */
export const LIBELLES_REGLEMENT = {
  E: 'Espèce',
  C: 'Chèque',
  V: 'Virement',
  T: 'Transfert',
}

// ============================================================================
// Ordre de Paiement (§18, captures 61-62) : établir un chèque/virement libre,
// « à l'ordre de » quelqu'un, avec un motif - sans facture derrière. Liste
// « Edition Lettres Chèques/Ordre de Virement », modal « Etablir ».
// (Sous réserve des captures à venir : mode Virement détaillé, impression.)
// ============================================================================

/** Banques du référentiel, en « code - libellé » pour la liste déroulante. */
const optionsBanques = () =>
  actifs('banques').map((b) => ({ valeur: b.code, libelle: `${b.code} - ${b.libelle}` }))

/** Modes de paiement d'un ordre (cf. titre de l'écran). */
const MODES_PAIEMENT = [
  { valeur: 'C', libelle: 'Chèque' },
  { valeur: 'V', libelle: 'Virement' },
]

export const ORDRES_PAIEMENT = {
  cle: 'ordres-paiement',
  vide: 'Aucun ordre de paiement',
  libelle: 'Edition Lettres Chèques/Ordre de Virement',
  nouveau: 'Etablir',
  modifier: "Modifier l'ordre",
  taillePage: 15,
  // Pas de titre au-dessus de la liste : la page le porte déjà.
  sansTitre: true,
  // Cases à cocher (action de lot), comme l'application d'origine.
  selection: true,
  nommer: (o) => `l'ordre n° ${o.numeroEnreg}`,
  champsSoulignes: true,
  barreCompacte: true,
  rechercheEnDernier: true,
  rechercheFlottante: true,
  // Un ordre ne se supprime pas, il s'annule.
  etat: {
    actif: 'Valide',
    inactif: 'Annulé',
    desactiver: "Annuler l'ordre",
    reactiver: "Rétablir l'ordre",
    desactive: 'annulé',
    reactive: 'rétabli',
  },
  filtres: [
    {
      champ: 'exercice',
      etiquette: 'Exercice',
      libelle: 'Tous',
      options: EXERCICES,
      defaut: () => String(new Date().getFullYear()),
      largeur: '7rem',
    },
  ],
  // Colonnes de la liste (capture 61) : sans la banque, comme l'origine.
  colonnesTableau: [
    'numeroEnreg',
    'dateSaisie',
    'numeroPiece',
    'datePiece',
    'montant',
    'aOrdreDe',
    'motif',
    'modePaiement',
  ],
  colonnes: [
    { nom: 'numeroEnreg', libelle: 'N° Enreg.', largeur: '90px', mono: true, calcule: true },
    {
      nom: 'dateSaisie',
      libelle: 'Date saisie',
      largeur: '110px',
      calcule: true,
      valeurTableau: (o) => dateFr(o.dateSaisie),
    },
    { nom: 'numeroPiece', libelle: 'N° pièce', largeur: '110px', mono: true, calcule: true },
    {
      nom: 'datePiece',
      libelle: 'Date pièce',
      libelleForm: 'Date chèque',
      largeur: '110px',
      type: 'date',
      defaut: () => new Date().toISOString().slice(0, 10),
      valeurTableau: (o) => dateFr(o.datePiece),
    },
    {
      nom: 'montant',
      libelle: 'Montant',
      largeur: '120px',
      type: 'number',
      aligne: 'droite',
      valeurTableau: (o) => montantFr(o.montant),
    },
    { nom: 'aOrdreDe', libelle: "A l'ordre de", libelleForm: "À l'ordre de", maxLength: 150 },
    { nom: 'motif', libelle: 'Motif', maxLength: 200 },
    {
      nom: 'modePaiement',
      libelle: 'Mode paiement',
      largeur: '120px',
      options: MODES_PAIEMENT,
      defaut: 'C',
      valeurTableau: (o) =>
        o.modePaiementLibelle || (o.modePaiement === 'V' ? 'Virement' : 'Chèque'),
    },
    {
      nom: 'banque',
      libelle: 'Banque',
      libelleForm: 'Banque',
      options: optionsBanques,
      afficherCode: true,
      libelleSeul: true,
    },
  ],
  formulaire: [
    {
      libelle: 'Etablir un paiement',
      sections: [
        {
          lignes: [['modePaiement', 'banque'], ['datePiece', 'montant'], ['aOrdreDe'], ['motif']],
        },
      ],
    },
  ],
}

// ============================================================================
// Remboursement Frais Médicaux (Traitements → Remboursement, captures 66-68)
// ============================================================================
const MOIS_OPTIONS = [
  { valeur: '1', libelle: 'Janvier' },
  { valeur: '2', libelle: 'Février' },
  { valeur: '3', libelle: 'Mars' },
  { valeur: '4', libelle: 'Avril' },
  { valeur: '5', libelle: 'Mai' },
  { valeur: '6', libelle: 'Juin' },
  { valeur: '7', libelle: 'Juillet' },
  { valeur: '8', libelle: 'Août' },
  { valeur: '9', libelle: 'Septembre' },
  { valeur: '10', libelle: 'Octobre' },
  { valeur: '11', libelle: 'Novembre' },
  { valeur: '12', libelle: 'Décembre' },
]

/** Stats du titre : « N Participants - Total Solde - Total à rembourser ». */
const statsRemboursement = (lignes) => {
  const solde = lignes.reduce((s, l) => s + entier(l.montantDu), 0)
  const aRembourser = lignes
    .filter((l) => !l.rembourse)
    .reduce((s, l) => s + entier(l.montantDu), 0)
  return `${lignes.length} Participants - Total Solde: ${montantFr(solde)} - Total à rembourser: ${montantFr(aRembourser)}`
}

/** Segments d'état : Tous / Réglé / Non réglé. */
const segmentsRemboursement = {
  activite: true,
  valeurs: [
    { valeur: 'tous', libelle: 'Tous', filtre: () => true },
    { valeur: 'regle', libelle: 'Réglé', filtre: (l) => Boolean(l.rembourse) },
    { valeur: 'non-regle', libelle: 'Non réglé', filtre: (l) => !l.rembourse },
  ],
}

export const REMBOURSEMENTS = {
  cle: 'remboursements',
  libelle: 'Remboursement Frais Médicaux',
  vide: 'Aucun remboursement',
  taillePage: 15,
  sansTitre: true,
  sansCreation: true,
  // Cases à cocher : on règle en lot (comme l'application d'origine).
  selection: true,
  stats: statsRemboursement,
  nommer: (l) => `le remboursement de ${l.participant}`,
  segments: segmentsRemboursement,
  champsSoulignes: true,
  barreCompacte: true,
  rechercheEnDernier: true,
  rechercheFlottante: true,
  segmentsADroite: true,
  filtres: [
    {
      champ: 'exercice',
      etiquette: 'Exercice',
      libelle: 'Tous',
      options: EXERCICES,
      defaut: () => String(new Date().getFullYear()),
      largeur: '7rem',
    },
    { champ: 'codeSoc', etiquette: 'Société', libelle: '- Toutes -', options: optionsAdherents },
    { champ: 'moisNum', etiquette: 'Mois', libelle: '- Tous -', options: () => MOIS_OPTIONS },
    {
      champ: 'typeRemb',
      etiquette: 'Mode',
      libelle: '- Tous -',
      options: () => [
        { valeur: 'compense', libelle: 'Compense' },
        { valeur: 'banque', libelle: 'Banque' },
      ],
    },
  ],
  colonnesTableau: [
    'codeJournal',
    'datePiece',
    'moisTraitement',
    'dateSaisie',
    'numTicket',
    'numFactIpm',
    'participant',
    'matriculePart',
    'codeSoc',
    'libelleRemb',
    'etatRemboursement',
    'fraisReel',
    'montantDu',
  ],
  colonnes: [
    { nom: 'codeJournal', libelle: 'C.JL', largeur: '70px', mono: true },
    { nom: 'datePiece', libelle: 'Date Pièce', largeur: '110px', valeurTableau: (l) => dateFr(l.datePiece) },
    { nom: 'moisTraitement', libelle: 'Mois trait.', largeur: '100px' },
    { nom: 'dateSaisie', libelle: 'Date Saisie', largeur: '110px', valeurTableau: (l) => dateFr(l.dateSaisie) },
    { nom: 'numTicket', libelle: 'N° ticket', largeur: '90px', mono: true },
    { nom: 'numFactIpm', libelle: 'N° Fact. IPM', largeur: '100px', mono: true },
    { nom: 'participant', libelle: 'Participant', largeur: '180px' },
    { nom: 'matriculePart', libelle: 'Soc. Mat', largeur: '90px', mono: true },
    { nom: 'codeSoc', libelle: 'Code Soc.', largeur: '80px', mono: true },
    { nom: 'libelleRemb', libelle: 'Libellé', largeur: '160px', valeurTableau: (l) => l.libelle },
    // `type: 'statut'` : l'état est porté par la colonne, donc pas de bouton
    // « Désactiver » sur la ligne ni d'interrupteur « Afficher les inactifs » -
    // une ligne de remboursement ne se désactive pas, elle se règle.
    { nom: 'etatRemboursement', libelle: 'Remboursé', largeur: '110px', type: 'statut' },
    { nom: 'fraisReel', libelle: 'Frais réel', largeur: '100px', aligne: 'droite', valeurTableau: (l) => montantFr(l.fraisReel) },
    { nom: 'montantDu', libelle: 'Montant dû', largeur: '100px', aligne: 'droite', valeurTableau: (l) => montantFr(l.montantDu) },
  ],
}

/** Mode de paiement du remboursement (Méthode de Règlement, captures 56-57). */
export const METHODES_REMBOURSEMENT = { C: 'Chèque', V: 'Virement', T: 'Transfert' }

export { optionsBanques }
