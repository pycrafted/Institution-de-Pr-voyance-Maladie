/**
 * Description du document « Lettre de garantie ».
 *
 * Champs repris de l'écran « Edition lettre de garantie » de l'application
 * d'origine : Participant (Société, Matricule Participant), Bénéficiaire
 * (Type, Bénéficiaire), Prestataire (Spécialité, Prestataire, Nature
 * prestation), Prescripteur (Spécialité, Prescripteur), Actes (Nb. Articles,
 * Date prescription, Saisir les actes), Remboursement intégral.
 *
 * La liste d'origine n'est visible qu'en partie (Numero, Date) : sa barre et
 * ses autres colonnes reprennent celles des Bons de pharmacie, en attendant la
 * capture qui les montre. Ce que la lettre partage avec le bon est dans
 * ../commun.js.
 *
 * Servie par le backend (/api/lettres-garantie/) : numéro LGI et date posés
 * par le serveur, noms des tiers lus sur leurs fiches, cohérence contrôlée.
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
  naturesDeSpecialite,
  nomFournisseur,
  optionsSpecialites,
  ouvrirPdf,
} from '../commun'

export const LETTRES_GARANTIE = {
  cle: 'lettres-garantie',
  vide: 'Aucune lettre de garantie',
  libelle: 'Lettres de Garantie',
  nouveau: 'Nouvelle lettre',
  modifier: 'Modifier la lettre de garantie',

  outils: ['export'],

  taillePage: 12,

  // 45 906 lettres : pagination côté serveur (cf. Referentiel + socle backend).
  paginationServeur: true,

  // Une lettre n'a pas d'intitulé : c'est son numéro qui la nomme.
  nommer: (l) => `La lettre ${l.code}`,

  // Une lettre ne se « désactive » pas, elle s'annule.
  // Une lettre ne se supprime pas : elle s'annule, et peut être rétablie.
  etat: {
    actif: 'Valide',
    inactif: 'Annulée',
    desactiver: 'Annuler la lettre',
    reactiver: 'Rétablir la lettre',
    desactive: 'annulée',
    reactive: 'rétablie',
  },

  // Barre des Bons de pharmacie (cf. commun.js).
  ...BARRE_DOCUMENTS,

  // --- Ce que la refonte du 2026-11-24 change, APRÈS la barre commune -------
  // L'ordre compte : ces trois clés défont ce que `BARRE_DOCUMENTS` pose, et
  // ne le peuvent qu'écrites après lui. Les deux pages sœurs - Bons d'Optique
  // et LG Hospitalisation - gardent la barre commune telle quelle tant
  // qu'elles ne sont pas refaites.
  //
  // Pas de titre au-dessus de la liste : la page porte le sien, en chapeau.
  sansTitre: true,
  // La pastille « Total N » remonte au chapeau de la page (`onStats`), qui la
  // pose contre son titre - comme Participants et Fournisseurs de soins. Elle
  // compte la vue SERVEUR : segment retenu et recherche compris.
  // « Nouvelle lettre » porte l'accent, et un bouton d'accent se tient en BOUT
  // de groupe, pas au milieu entre deux boutons blancs.
  creationAvantOutils: false,

  // Impression individuelle, comme les bons : la lettre au modèle de
  // l'application d'origine, original et copie, en PDF.
  actionsLigne: [
    {
      cle: 'pdf',
      libelle: 'Imprimer la lettre (PDF)',
      icone: cilPrint,
      executer: (l) =>
        ouvrirPdf(`/lettres-garantie/${l.id}/pdf/`, l.code, `Lettre de garantie ${l.code}`),
    },
  ],

  colonnesTableau: [
    'code',
    'date',
    'matriculePart',
    'participant',
    'typeBenef',
    'beneficiaire',
    'codePrestataire',
    'prestataire',
    'numeroFacture',
  ],

  colonnes: [
    ...colonnesEmission(),
    ...colonnesBeneficiaire(),

    // --- Prestataire -------------------------------------------------------
    {
      nom: 'specialitePrestataire',
      libelle: 'Spé. prestataire',
      libelleForm: 'Spécialité',
      largeur: '180px',
      options: optionsSpecialites,
    },
    {
      nom: 'codePrestataire',
      libelle: 'Code P.',
      libelleForm: 'Prestataire',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      dependDe: 'specialitePrestataire',
      options: (valeurs) => fournisseursDeSpecialite(valeurs.specialitePrestataire),
    },
    {
      nom: 'prestataire',
      libelle: 'Prestataire',
      libelleForm: 'Raison sociale',
      lectureSeule: true,
      valeur: (valeurs) => nomFournisseur(valeurs.codePrestataire),
    },
    {
      // Les natures de prestation sont le référentiel « Types de prestation »
      // des données de base (00 VISITE, 01 ANALYSES BIO-MEDICALES…), comme la
      // liste de l'origine. La spécialité du prestataire les RANGE - elle n'en
      // retire aucune - d'après ce que cette spécialité donne vraiment dans
      // les lettres réelles de LAMPS (cf. naturesDeSpecialite).
      nom: 'naturePrestation',
      libelle: 'Nature prestation',
      libelleForm: 'Nature prestation',
      largeur: '200px',
      afficherCode: true,
      options: (valeurs) =>
        naturesDeSpecialite(valeurs.specialitePrestataire, valeurs.naturePrestation),
    },
    colonneNumeroFacture(),

    // --- Prescripteur ------------------------------------------------------
    ...colonnesPrescripteur(),

    // --- Actes -------------------------------------------------------------
    {
      // Déduit du nombre d'actes choisis, comme à l'écran d'origine où il se
      // remplit tout seul : on ne le saisit pas.
      nom: 'nbArticles',
      libelle: 'Nb. Articles',
      libelleForm: 'Nb. Articles',
      largeur: '110px',
      type: 'number',
      aligne: 'droite',
      lectureSeule: true,
      valeur: (v) => (Array.isArray(v.actes) ? v.actes.length : 0),
    },
    {
      nom: 'datePrescription',
      libelle: 'Date prescription',
      libelleForm: 'Date prescription',
      largeur: '140px',
      type: 'date',
    },
    {
      // Les actes de la prescription : on les sélectionne dans la nomenclature
      // (Données de base → Actes), filtrée sur la spécialité du prestataire,
      // puis on saisit leur tarif - comme LAMPS. Le « Nb. Articles » en découle.
      nom: 'actes',
      libelleForm: 'Actes',
      type: 'selection-actes',
      specialiteDe: 'specialitePrestataire',
    },
    colonneRemboursementIntegral(),
  ],

  // Encadrés de l'écran d'origine : Participant, Bénéficiaire, Prestataire,
  // Prescripteur, Actes.
  formulaire: [
    {
      libelle: 'Lettre de garantie',
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
          titre: 'Prestataire',
          lignes: [['specialitePrestataire'], ['codePrestataire'], ['naturePrestation']],
        },
        {
          titre: 'Prescripteur',
          lignes: [['specialite'], ['prescripteur']],
        },
        {
          titre: 'Actes',
          lignes: [['nbArticles', 'datePrescription'], ['actes'], ['remboursementIntegral']],
        },
      ],
    },
  ],
}
