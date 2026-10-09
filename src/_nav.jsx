import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilCalculator, cilDescription, cilFolder } from '@coreui/icons'
import { CNavGroup, CNavItem } from '@coreui/react'

const icone = (glyphe) => <CIcon icon={glyphe} customClassName="nav-icon" />

const _nav = [
  // Le tableau de bord ne figure plus dans la colonne : ses chiffres sont
  // encore ceux d'une maquette, et l'annoncer avant qu'ils soient réels
  // laissait croire à une synthèse de la caisse. Sa route existe toujours
  // (/#/tableau-de-bord) : elle reviendra au menu quand elle agrégera de
  // vraies données - comme Traitements et Comptabilité.
  // « Fichiers » et « Documents » sont des sections dépliantes : on clique sur
  // l'intitulé pour voir ses pages. D'autres viendront s'y ranger, et la
  // colonne ne s'allongera pas pour autant. Elles se présentent fermées, et
  // seules elles portent une icône : leurs pages se distinguent par le retrait
  // et leur intitulé.
  {
    component: CNavGroup,
    name: 'Fichiers',
    icon: icone(cilFolder),
    items: [
      {
        component: CNavItem,
        name: 'Données de base',
        to: '/donnees-de-base',
      },
      {
        component: CNavItem,
        name: 'Fournisseurs de Soins',
        to: '/fournisseurs-de-soins',
      },
      {
        component: CNavItem,
        name: 'Adhérents',
        to: '/adherents',
      },
      {
        component: CNavItem,
        name: 'Participants',
        to: '/participants',
      },
      // Dernière entrée des « Fichiers », comme dans l'application d'origine.
      {
        component: CNavItem,
        name: 'Paramètres',
        to: '/parametres',
      },
    ],
  },
  // Les pièces émises au profit des participants.
  {
    component: CNavGroup,
    name: 'Documents',
    icon: icone(cilDescription),
    items: [
      {
        component: CNavItem,
        name: 'Bons de Pharmacie',
        to: '/documents/bons-pharmacie',
      },
      {
        component: CNavItem,
        name: 'Lettres de Garantie',
        to: '/documents/lettres-garantie',
      },
      {
        component: CNavItem,
        name: 'LG Hospitalisation',
        to: '/documents/lg-hospitalisation',
      },
      {
        component: CNavItem,
        name: 'Bons Optique',
        to: '/documents/bons-optique',
      },
    ],
  },
  // Le traitement des factures des prestataires : réception, liquidation,
  // comptabilisation. La section revient au menu avec son premier écran.
  {
    component: CNavGroup,
    name: 'Traitements',
    icon: icone(cilCalculator),
    items: [
      {
        component: CNavItem,
        name: 'Factures',
        to: '/traitements/factures',
      },
      {
        component: CNavItem,
        name: 'Règlements',
        to: '/traitements/reglements',
      },
    ],
  },
  // « Comptabilité » reste à venir : sa route et son écran d'attente sont
  // déclarés (voir views/a-venir/pagesAVenir.js), l'entrée reviendra ici le
  // jour où la section existera.
]

export default _nav
