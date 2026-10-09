/**
 * Description du document « Bon de commande optique ».
 *
 * Champs repris de l'écran « Edition bon de commande optique » de l'application
 * d'origine (capture 27) - exactement le patron des autres documents :
 *   - Participant : Société, Matricule Participant ;
 *   - Bénéficiaire : Type, Bénéficiaire ;
 *   - Prescripteur : Spécialité, Prescripteur ;
 *   - Fournisseur : Prestataire (l'opticien, spécialité 04), Date prescription,
 *     puis « Saisir les actes » - les articles optiques (Montures, Verres,
 *     Montures & Verres, Traitement) qu'on *sélectionne* dans la nomenclature,
 *     avec leur quantité et leur tarif ;
 *   - Remboursement intégral.
 *
 * Le bon imprimé (« BON DE COMMANDE OPTIQUE ») en tire sa ligne commandée et ses
 * montants (total, remise, net), calculés par le serveur. La barre de liste
 * reprend celle des Bons de pharmacie (cf. ../commun.js).
 *
 * Servi par le backend (/api/bons-optique/) : numéro BCI et date posés par le
 * serveur, noms des tiers lus sur leurs fiches, montants calculés, cohérence
 * contrôlée (le fournisseur est un opticien).
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

/** Code de la spécialité « OPTIQUE MEDICALE » dans le référentiel des spécialités. */
const SPECIALITE_OPTIQUE = '04'

const entier = (valeur) => {
  const n = Number.parseInt(valeur, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Montant en francs CFA, lu comme sur le bon : « 263 160 ». */
const montantFr = (n) => entier(n).toLocaleString('fr-FR')

export const BONS_OPTIQUE = {
  cle: 'bons-optique',
  libelle: 'Bons Optique',
  nouveau: 'Nouveau bon',
  modifier: 'Modifier le bon optique',

  outils: ['export'],

  taillePage: 12,

  // Un bon n'a pas d'intitulé : c'est son numéro qui le nomme.
  nommer: (b) => `Le bon ${b.code}`,

  // Un bon ne se « désactive » pas, il s'annule.
  // Un bon ne se supprime pas : il s'annule, et peut être rétabli.
  etat: {
    actif: 'Valide',
    inactif: 'Annulé',
    desactiver: 'Annuler le bon',
    reactiver: 'Rétablir le bon',
    desactive: 'annulé',
    reactive: 'rétabli',
  },

  // Barre des Bons de pharmacie (cf. commun.js).
  ...BARRE_DOCUMENTS,

  // Impression individuelle, comme les bons de pharmacie : le bon au modèle
  // de l'application d'origine, original et copie fournisseur, en PDF.
  actionsLigne: [
    {
      cle: 'pdf',
      libelle: 'Imprimer le bon (PDF)',
      icone: cilPrint,
      executer: (b) =>
        ouvrirPdf(`/bons-optique/${b.id}/pdf/`, b.code, `Bon de commande optique ${b.code}`),
    },
  ],

  colonnesTableau: [
    'code',
    'date',
    'matriculePart',
    'participant',
    'typeBenef',
    'beneficiaire',
    'codeFournisseur',
    'fournisseur',
    'montantNet',
    'numeroFacture',
  ],

  colonnes: [
    ...colonnesEmission(),
    ...colonnesBeneficiaire(),

    // --- Fournisseur (l'opticien) ------------------------------------------
    {
      nom: 'codeFournisseur',
      libelle: 'Code F.',
      libelleForm: 'Prestataire',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      options: () => fournisseursDeSpecialite(SPECIALITE_OPTIQUE),
    },
    {
      nom: 'fournisseur',
      libelle: 'Fournisseur',
      libelleForm: 'Raison sociale',
      lectureSeule: true,
      valeur: (valeurs) => nomFournisseur(valeurs.codeFournisseur),
    },
    colonneNumeroFacture(),

    // --- Prescripteur ------------------------------------------------------
    ...colonnesPrescripteur(),
    {
      nom: 'dateOrdonnance',
      libelle: 'Date Ordonnance',
      libelleForm: 'Date prescription',
      largeur: '140px',
      type: 'date',
    },

    // --- Articles optiques -------------------------------------------------
    {
      // On les sélectionne dans la nomenclature (Données de base → Actes),
      // filtrée sur la spécialité du prestataire (opticien, spé 04 : Montures,
      // Verres…), puis on saisit leur tarif - comme l'origine (« Saisir les
      // actes »). Le bon imprimé en tire sa ligne et ses montants.
      nom: 'actes',
      libelleForm: 'Articles',
      type: 'selection-actes',
      prestataireDe: 'codeFournisseur',
    },
    colonneRemboursementIntegral(),

    // --- Montant net (colonne de la liste, calculé par le serveur) ---------
    {
      nom: 'montantNet',
      libelle: 'Montant net',
      largeur: '130px',
      aligne: 'droite',
      calcule: true,
      valeurTableau: (b) => montantFr(b.montantNet),
    },
  ],

  // Encadrés de l'écran d'origine (capture 27).
  formulaire: [
    {
      libelle: 'Bon de commande optique',
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
          titre: 'Prescripteur',
          lignes: [['specialite'], ['prescripteur']],
        },
        {
          titre: 'Fournisseur',
          lignes: [['codeFournisseur'], ['dateOrdonnance'], ['actes']],
        },
        {
          lignes: [['remboursementIntegral']],
        },
      ],
    },
  ],
}
