/**
 * Description du document « Bon de Pharmacie ».
 *
 * Même grammaire que les référentiels de « Données de base » - le fichier
 * config.js de cette section-là documente chaque option en détail. La page ne
 * réécrit donc aucun composant : elle décrit ses champs et laisse
 * <Referentiel /> faire le reste.
 *
 * Un bon de pharmacie autorise un bénéficiaire à retirer des médicaments chez
 * un pharmacien conventionné, à la charge de l'IPM. Il désigne des tiers
 * déclarés ailleurs - une société, un participant, un de ses ayants droit, une
 * pharmacie, un prescripteur - lus dans leurs référentiels, jamais en dur ici.
 * Ce que le bon partage avec la lettre de garantie est dans ../commun.js.
 *
 * Servi par le backend (/api/bons-pharmacie/) : numéro BPI et date posés par
 * le serveur, noms des tiers lus sur leurs fiches, cohérence contrôlée
 * (le participant appartient à la société, le bénéficiaire au participant et
 * au type, le prescripteur à la spécialité).
 */

import { cilPrint } from '@coreui/icons'

import {
  BARRE_DOCUMENTS,
  colonneNumeroFacture,
  colonneRemboursementIntegral,
  colonnesBeneficiaire,
  colonnesEmission,
  colonnesPrescripteur,
  fournisseursDeSpecialite,
  nomFournisseur,
  ouvrirPdf,
} from '../commun'

/** Code de la spécialité « PHARMACIES » dans le référentiel des spécialités. */
const SPECIALITE_PHARMACIE = '06'

export const BONS_PHARMACIE = {
  cle: 'bons-pharmacie',
  libelle: 'Bons de Pharmacie',
  nouveau: 'Nouveau bon',
  modifier: 'Modifier le bon',

  // La maquette d'origine ne montre que l'export.
  outils: ['export'],

  taillePage: 12,

  // Un bon n'a pas d'intitulé : c'est son numéro qui le nomme dans les
  // messages de confirmation.
  nommer: (b) => `Le bon ${b.code}`,

  // Vocabulaire de l'activation : un bon ne se « désactive » pas, il s'annule.
  // Un bon ne se supprime pas : il s'annule, et peut être rétabli.
  etat: {
    actif: 'Valide',
    inactif: 'Annulé',
    desactiver: 'Annuler le bon',
    reactiver: 'Rétablir le bon',
    desactive: 'annulé',
    reactive: 'rétabli',
  },

  // Barre de l'application d'origine (cf. commun.js) : Exercice, Traités /
  // Non Traités, « Rechercher… », puis Nouveau et Export Excel.
  ...BARRE_DOCUMENTS,

  // Impression individuelle d'un bon : le bon au modèle de l'application
  // d'origine, original et copie, en PDF. Tout bon s'imprime, comme dans
  // l'origine - à l'émission surtout : c'est lui que le bénéficiaire apporte
  // à la pharmacie.
  actionsLigne: [
    {
      cle: 'pdf',
      libelle: 'Imprimer le bon (PDF)',
      icone: cilPrint,
      executer: (b) =>
        ouvrirPdf(`/bons-pharmacie/${b.id}/pdf/`, b.code, `Bon de pharmacie ${b.code}`),
    },
  ],

  // Le tableau retient de quoi identifier le bon et savoir pour qui il a été
  // émis ; le reste - prescripteur, ordonnance - se lit dans la fiche.
  colonnesTableau: [
    'code',
    'date',
    'matriculePart',
    'participant',
    'typeBenef',
    'beneficiaire',
    'codeFournisseur',
    'pharmacie',
    'numeroFacture',
  ],

  colonnes: [
    ...colonnesEmission(),
    ...colonnesBeneficiaire(),

    // --- Pharmacie ---------------------------------------------------------
    {
      nom: 'codeFournisseur',
      libelle: 'Code F.',
      libelleForm: 'Pharmacie',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      options: () => fournisseursDeSpecialite(SPECIALITE_PHARMACIE),
    },
    {
      nom: 'pharmacie',
      libelle: 'Pharmacie',
      libelleForm: 'Raison sociale',
      lectureSeule: true,
      valeur: (valeurs) => nomFournisseur(valeurs.codeFournisseur),
    },
    colonneNumeroFacture(),

    // --- Prescripteur ------------------------------------------------------
    ...colonnesPrescripteur(),

    // --- Ordonnance --------------------------------------------------------
    {
      // Déduit du nombre de médicaments choisis, comme à l'écran d'origine où
      // il se remplit tout seul : on ne le saisit pas.
      nom: 'nbArticles',
      libelle: 'Nb. Articles',
      libelleForm: 'Nb. Articles',
      largeur: '110px',
      type: 'number',
      aligne: 'droite',
      lectureSeule: true,
      valeur: (v) => (Array.isArray(v.medicaments) ? v.medicaments.length : 0),
    },
    {
      nom: 'dateOrdonnance',
      libelle: 'Date Ordonnance',
      libelleForm: 'Date Ordonnance',
      largeur: '140px',
      type: 'date',
    },
    {
      // Les médicaments de l'ordonnance : on les sélectionne dans le catalogue
      // (Données de base → Médicaments), on ne les tape pas - comme LAMPS. Le
      // « Nb. Articles » ci-dessus en découle.
      nom: 'medicaments',
      libelleForm: 'Médicaments',
      type: 'medicaments',
    },
    colonneRemboursementIntegral(),
  ],

  // Découpage repris de la maquette : quatre encadrés - qui, pour qui, où, et
  // sur prescription de qui - puis l'ordonnance. Le numéro, la date,
  // l'exercice et les noms recopiés restent calculés à l'enregistrement et
  // alimentent le tableau.
  formulaire: [
    {
      libelle: 'Bon de pharmacie',
      sections: [
        {
          titre: 'Participant',
          lignes: [['codeSoc'], ['matriculePart']],
        },
        {
          titre: 'Bénéficiaire',
          lignes: [['typeBenef', 'matriculeBenef']],
        },
        {
          titre: 'Pharmacie',
          lignes: [['codeFournisseur']],
        },
        {
          titre: 'Prescripteur',
          lignes: [['specialite'], ['prescripteur']],
        },
        {
          titre: 'Ordonnance',
          lignes: [['nbArticles', 'dateOrdonnance'], ['medicaments'], ['remboursementIntegral']],
        },
      ],
    },
  ],
}
