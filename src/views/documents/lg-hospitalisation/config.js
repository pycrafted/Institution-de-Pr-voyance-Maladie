/**
 * Description du document « Lettre de garantie hospitalisation ».
 *
 * Champs repris de l'écran « Edition Lettre de garantie hospitalisation » de
 * l'application d'origine :
 *   - Société *, Matricule Participant * ;
 *   - Bénéficiaire * : Type *, Bénéficiaire * ;
 *   - Structure de Santé * : Type (HOPITAL, CLINIQUE, CENTRE DE SANTE),
 *     Catégorie (1ère à 4ème Catégorie), Prestataire (ceux du type choisi),
 *     Nature prestation ;
 *   - Prescripteur : Spécialité, Date prescription, Prescripteur ;
 *   - Motif d'hospitalisation : Remise, et les actes - on les *sélectionne*
 *     dans la nomenclature (Données de base → Actes), filtrée sur la spécialité
 *     de la structure, puis on saisit leur tarif, comme l'origine
 *     (« - Rechercher acte - », quantité, Tarif) ;
 *   - Remboursement intégral.
 *
 * La barre de liste reprend celle des autres documents (cf. ../commun.js). Pas
 * d'impression : le modèle de la lettre imprimée manque encore.
 *
 * Servie par le backend (/api/lg-hospitalisation/) : numéro et date posés par
 * le serveur, noms des tiers lus sur leurs fiches, cohérence contrôlée (le
 * prestataire est du type de structure choisi).
 */

import {
  BARRE_DOCUMENTS,
  actifs,
  colonneNumeroFacture,
  colonneRemboursementIntegral,
  colonnesBeneficiaire,
  colonnesEmission,
  colonnesPrescripteur,
  nomFournisseur,
} from '../commun'
import { listerEntreesSync } from '../../../services/referentiels'

/**
 * Types de structure de santé de l'origine, et la spécialité de leurs
 * prestataires : un hôpital se choisit parmi les HOPITAUX (« 0301 - HOPITAL LE
 * DANTEC » à l'origine).
 */
const TYPES_STRUCTURE = [
  { valeur: 'HOPITAL', libelle: 'HOPITAL', specialite: 'HOPITAUX' },
  { valeur: 'CLINIQUE', libelle: 'CLINIQUE', specialite: 'CLINIQUES' },
  { valeur: 'CENTRE DE SANTE', libelle: 'CENTRE DE SANTE', specialite: 'CENTRES DE SANTE' },
]

const CATEGORIES = [
  { valeur: '1', libelle: '1ère Catégorie' },
  { valeur: '2', libelle: '2ème Catégorie' },
  { valeur: '3', libelle: '3ème Catégorie' },
  { valeur: '4', libelle: '4ème Catégorie' },
]

/** Prestataires actifs du type de structure choisi (vide tant qu'il ne l'est pas). */
const prestatairesDuType = (type) => {
  const specialite = TYPES_STRUCTURE.find((t) => t.valeur === type)?.specialite
  if (!specialite) return []
  const codes = listerEntreesSync('specialites')
    .filter((s) => s.libelle === specialite)
    .map((s) => s.code)
  return actifs('fournisseurs-de-soins')
    .filter((f) => codes.includes(f.specialite))
    .map((f) => ({ valeur: f.code, libelle: f.libelle }))
}

const choisie = (valeurs) => Boolean(valeurs.typeStructure)

export const LG_HOSPITALISATION = {
  cle: 'lg-hospitalisation',
  vide: 'Aucune LG hospitalisation',
  libelle: 'LG Hospitalisation',
  nouveau: 'Nouvelle lettre',
  modifier: 'Modifier la lettre de garantie hospitalisation',

  outils: ['export'],

  // Quinze lignes par page, comme la liste d'origine.
  taillePage: 15,

  nommer: (l) => `La lettre ${l.code}`,

  // Une lettre ne se supprime pas : elle s'annule, et peut être rétablie.
  etat: {
    actif: 'Valide',
    inactif: 'Annulée',
    desactiver: 'Annuler la lettre',
    reactiver: 'Rétablir la lettre',
    desactive: 'annulée',
    reactive: 'rétablie',
  },

  ...BARRE_DOCUMENTS,

  colonnesTableau: [
    'code',
    'date',
    'matriculePart',
    'participant',
    'typeBenef',
    'beneficiaire',
    'typeStructure',
    'codePrestataire',
    'prestataire',
    'numeroFacture',
  ],

  colonnes: [
    ...colonnesEmission(),
    ...colonnesBeneficiaire(),

    // --- Structure de santé ------------------------------------------------
    {
      nom: 'typeStructure',
      libelle: 'Type structure',
      libelleForm: 'Type',
      largeur: '140px',
      requis: true,
      options: TYPES_STRUCTURE.map(({ valeur, libelle }) => ({ valeur, libelle })),
    },
    {
      nom: 'categorie',
      libelle: 'Catégorie',
      libelleForm: 'Catégorie',
      largeur: '130px',
      requis: true,
      libelleSeul: true,
      options: CATEGORIES,
    },
    {
      nom: 'codePrestataire',
      libelle: 'Code P.',
      libelleForm: 'Prestataire',
      largeur: '90px',
      mono: true,
      requis: true,
      afficherCode: true,
      dependDe: 'typeStructure',
      options: (valeurs) => prestatairesDuType(valeurs.typeStructure),
    },
    {
      nom: 'prestataire',
      libelle: 'Prestataire',
      libelleForm: 'Raison sociale',
      lectureSeule: true,
      valeur: (valeurs) => nomFournisseur(valeurs.codePrestataire),
    },
    {
      nom: 'naturePrestation',
      libelle: 'Nature prestation',
      libelleForm: 'Nature prestation',
      largeur: '200px',
      requis: true,
      afficherCode: true,
      options: () =>
        actifs('types-prestations').map((t) => ({ valeur: t.code, libelle: t.libelle })),
    },
    colonneNumeroFacture(),

    // --- Prescripteur ------------------------------------------------------
    ...colonnesPrescripteur(),
    {
      nom: 'datePrescription',
      libelle: 'Date prescription',
      libelleForm: 'Date prescription',
      largeur: '140px',
      type: 'date',
    },

    // --- Motif d'hospitalisation --------------------------------------------
    {
      nom: 'remise',
      libelle: 'Remise',
      libelleForm: 'Remise',
      largeur: '110px',
      type: 'number',
      aligne: 'droite',
      defaut: 0,
      visible: choisie,
    },
    {
      // Les actes du motif : on les sélectionne dans la nomenclature (Données
      // de base → Actes), filtrée sur la spécialité de la structure choisie
      // (un hôpital → actes HOPITAUX), puis on saisit leur tarif - comme
      // l'origine (« - Rechercher acte - »). Visible une fois la structure
      // choisie, comme le bouton grisé de l'application d'origine.
      nom: 'actes',
      libelleForm: 'Actes',
      type: 'selection-actes',
      prestataireDe: 'codePrestataire',
      visible: choisie,
    },
    colonneRemboursementIntegral(),
  ],

  // Encadrés de l'écran d'origine : la société et le participant (sans
  // titre), Bénéficiaire, Structure de Santé ; puis Prescripteur et Motif
  // d'hospitalisation ; enfin le remboursement intégral.
  formulaire: [
    {
      libelle: 'Lettre de garantie hospitalisation',
      sections: [
        {
          lignes: [['codeSoc'], ['matriculePart']],
        },
        {
          titre: 'Bénéficiaire',
          lignes: [['typeBenef', 'matriculeBenef']],
        },
        {
          titre: 'Structure de Santé',
          lignes: [['typeStructure', 'categorie'], ['codePrestataire'], ['naturePrestation']],
        },
        {
          titre: 'Prescripteur',
          lignes: [['specialite', 'datePrescription'], ['prescripteur']],
        },
        {
          titre: 'Motif d’hospitalisation',
          lignes: [['remise'], ['actes']],
        },
        {
          lignes: [['remboursementIntegral']],
        },
      ],
    },
  ],
}
