import React from 'react'
import CIcon from '@coreui/icons-react'
import {
  cilChartLine,
  cilStorage,
  cilHospital,
  cilAddressBook,
  cilUser,
  cilMedicalCross,
  cilEnvelopeLetter,
  cilBed,
} from '@coreui/icons'
import { CNavItem, CNavTitle } from '@coreui/react'

import { oeil } from './assets/icones'

const icone = (glyphe) => <CIcon icon={glyphe} customClassName="nav-icon" />

const _nav = [
  // Sa propre section : le tableau de bord ne relève ni des fichiers ni de la
  // gestion, il les analyse. Sans intitulé au-dessus d'elle, l'entrée flottait
  // en tête de colonne comme un oubli hors des deux autres groupes.
  {
    component: CNavTitle,
    name: 'Analyse',
  },
  {
    component: CNavItem,
    name: 'Tableau de bord',
    to: '/tableau-de-bord',
    icon: icone(cilChartLine),
  },
  {
    component: CNavTitle,
    name: 'Fichiers',
  },
  {
    component: CNavItem,
    name: 'Données de base',
    to: '/donnees-de-base',
    icon: icone(cilStorage),
  },
  {
    component: CNavItem,
    name: 'Fournisseurs de Soins',
    to: '/fournisseurs-de-soins',
    icon: icone(cilHospital),
  },
  {
    component: CNavItem,
    name: 'Adhérents',
    to: '/adherents',
    icon: icone(cilAddressBook),
  },
  {
    component: CNavItem,
    name: 'Participants',
    to: '/participants',
    icon: icone(cilUser),
  },
  // Les pièces émises au profit des participants. Groupe à plat, comme
  // « Fichiers » : quatre entrées se lisent d'un coup d'œil, les replier
  // derrière un dépliant ajouterait un clic sans rien ranger.
  {
    component: CNavTitle,
    name: 'Documents',
  },
  {
    component: CNavItem,
    name: 'Bons de Pharmacie',
    to: '/documents/bons-pharmacie',
    icon: icone(cilMedicalCross),
  },
  {
    component: CNavItem,
    name: 'Lettres de Garantie',
    to: '/documents/lettres-garantie',
    icon: icone(cilEnvelopeLetter),
  },
  {
    component: CNavItem,
    name: 'LG Hospitalisation',
    to: '/documents/lg-hospitalisation',
    icon: icone(cilBed),
  },
  {
    component: CNavItem,
    name: 'Bons Optique',
    to: '/documents/bons-optique',
    icon: icone(oeil),
  },
  // « Gestion » — Traitements, Comptabilité — a été retiré du menu : ce ne sont
  // pas des pages mais des regroupements, et les annoncer avant d'avoir leur
  // contenu ne menait qu'à des écrans d'attente. Les routes et leurs écrans
  // restent déclarés (voir views/a-venir/pagesAVenir.js) : il suffira de
  // remettre les entrées ici le jour où la section existera.
]

export default _nav
