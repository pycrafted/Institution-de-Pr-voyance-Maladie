/**
 * Description de la liste « Demandes de photo » (Participants → onglet).
 *
 * La photo d'identité se pose une seule fois, depuis l'application mobile, par
 * le titulaire - pour lui-même ou un de ses ayants droit. Pour la changer, il
 * en demande la réinitialisation depuis son téléphone ; la demande arrive ici.
 *
 * L'IPM l'instruit, et ne fait que cela : « Réinitialiser » efface la photo,
 * que le titulaire repose aussitôt depuis le mobile ; « Refuser » clôt la
 * demande et garde la photo. L'IPM ne pose jamais elle-même un portrait.
 */

import React from 'react'
import { cilBan, cilReload } from '@coreui/icons'

import { executerAction } from '../../services/referentiels'

export const STATUTS_DEMANDE_PHOTO = ['En attente', 'Traitée', 'Refusée']

/** « 2026-10-27T09:12:00+00:00 » → « 27/10/2026 ». */
const formaterDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

const enAttente = (d) => d.statut === 'En attente'

/** « Awa DIOP (Epouse) », ou le participant lui-même. */
const designer = (d) =>
  d.matriculeBenef
    ? `la photo de ${d.beneficiaire} (${d.typeBenef})`
    : `la photo de ${d.participant}`

export const DEMANDES_PHOTO = {
  cle: 'demandes-photo',
  vide: 'Aucune demande de photo',
  libelle: 'Demandes de photo',
  sansTitre: true,
  // Une demande se dépose depuis le mobile, jamais ici.
  sansCreation: true,
  // Rien ne se modifie dans une demande : elle s'instruit par ses deux
  // actions. Le clic sur la ligne ne doit donc pas ouvrir de formulaire.
  onLigne: () => {},
  champsSoulignes: true,
  segmentsADroite: true,
  outils: ['export'],
  taillePage: 12,
  nommer: (d) => (d.matriculeBenef ? d.beneficiaire : d.participant),
  stats: (entrees) => `En attente: ${entrees.filter(enAttente).length} - Total: ${entrees.length}`,

  // Les demandes à instruire d'abord : c'est l'onglet par défaut.
  segments: {
    valeurs: () => [
      ...STATUTS_DEMANDE_PHOTO.map((s) => ({
        valeur: s,
        libelle: s === 'En attente' ? 'En attente' : `${s}s`,
        filtre: (d) => d.statut === s,
      })),
      { valeur: 'tous', libelle: 'Toutes', filtre: () => true },
    ],
  },

  colonnesTableau: [
    'photo',
    'dateDemande',
    'codeSoc',
    'matriculePart',
    'participant',
    'beneficiaire',
    'typeBenef',
    'motif',
    'statut',
    'traitePar',
  ],

  colonnes: [
    {
      nom: 'photo',
      libelle: 'Photo',
      largeur: '64px',
      // La photo que la réinitialisation effacerait : l'IPM voit ce qu'elle
      // instruit. Vide une fois réinitialisée.
      valeurTableau: (d) =>
        d.photo
          ? React.createElement('img', {
              src: d.photo,
              alt: '',
              className: 'prt-vignette-photo',
            })
          : '-',
    },
    {
      nom: 'dateDemande',
      libelle: 'Demandée le',
      largeur: '110px',
      valeurTableau: (d) => formaterDate(d.dateDemande),
    },
    { nom: 'codeSoc', libelle: 'Code Soc.', largeur: '80px' },
    { nom: 'matriculePart', libelle: 'Matricule', largeur: '90px', mono: true },
    { nom: 'participant', libelle: 'Participant' },
    { nom: 'beneficiaire', libelle: 'Photo de' },
    {
      nom: 'typeBenef',
      libelle: 'Type',
      largeur: '110px',
      valeurTableau: (d) => (d.matriculeBenef ? d.typeBenef : 'Lui-même'),
    },
    { nom: 'motif', libelle: 'Motif', valeurTableau: (d) => d.motif || '-' },
    {
      nom: 'statut',
      libelle: 'Statut',
      type: 'statut',
      largeur: '110px',
      options: STATUTS_DEMANDE_PHOTO,
    },
    { nom: 'traitePar', libelle: 'Traitée par', valeurTableau: (d) => d.traitePar || '-' },
  ],

  actionsLigne: [
    {
      cle: 'reinitialiser',
      libelle: 'Réinitialiser la photo',
      icone: cilReload,
      classe: 'ddb-action-succes',
      visible: enAttente,
      confirmer: (d) =>
        `Réinitialiser ${designer(d)} ?\n\n` +
        'La photo sera effacée ; le titulaire pourra en poser une nouvelle depuis l’application mobile.',
      executer: async (d) => {
        await executerAction('demandes-photo', d.id, 'reinitialiser')
        return 'Photo réinitialisée : le titulaire peut la reposer depuis le mobile'
      },
    },
    {
      cle: 'refuser',
      libelle: 'Refuser la demande',
      icone: cilBan,
      classe: 'ddb-action-danger',
      danger: true,
      visible: enAttente,
      confirmer: (d) =>
        `Refuser la demande de changement de ${designer(d)} ?\n\nLa photo est conservée.`,
      executer: async (d) => {
        await executerAction('demandes-photo', d.id, 'refuser')
        return 'Demande refusée : la photo est conservée'
      },
    },
  ],
}
