import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilBook, cilCalculator, cilDescription, cilFolder, cilSpeedometer } from '@coreui/icons'
import { CNavGroup, CNavItem } from '@coreui/react'

const icone = (glyphe) => <CIcon icon={glyphe} customClassName="nav-icon" />

const _nav = [
  {
    component: CNavItem,
    name: 'Tableau de bord',
    to: '/tableau-de-bord',
    icon: icone(cilSpeedometer),
  },
  // « Référentiels » et « Documents » sont des sections dépliantes : on clique sur
  // l'intitulé pour voir ses pages. D'autres viendront s'y ranger, et la
  // colonne ne s'allongera pas pour autant. Elles se présentent fermées, et
  // seules elles portent une icône : leurs pages se distinguent par le retrait
  // et leur intitulé.
  {
    component: CNavGroup,
    // « Fichiers » dans LAMPS ; renommé « Référentiels » le 2026-11-06 sur
    // demande du métier - un nom plus descriptif pour les données socles
    // (structure, types, médical, fournisseurs, adhérents, participants) que
    // le reste de l'application réutilise.
    name: 'Référentiels',
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
      // « Paramètres » était ici, dernière entrée des « Référentiels » comme dans
      // LAMPS. L'entrée est partie le 2026-11-06 : depuis que l'en-tête porte
      // trois icônes, la roue dentée y mène déjà, et la barre du bas répétait
      // le même lien à un centimètre de là. L'écran, sa route et son contenu
      // n'ont pas bougé - seul le doublon de menu disparaît.
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
  //
  // Les libellés sont ceux de l'application d'origine, relevés dans sa propre
  // table d'écrans (`table_fonctionnalites`, menu 82) : « Factures »,
  // « Réglements Factures », « Remb.Frais Médicaux », « Ordres de Paiements »,
  // « Suspensions ». On les écrit en entier - « Remboursement Frais
  // Médicaux », qui est d'ailleurs le titre de la page - et « Règlements »
  // reprend son accent grave.
  //
  // Reste du menu d'origine, non construit : Encaissements, Reporting et
  // export. Saisie Journal a rejoint la liste le 2026-11-04 (captures 84-85),
  // Retenues Frais Médicaux le 2026-11-05 (captures 86-91).
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
        name: 'Cotisations',
        to: '/traitements/cotisations',
      },
      {
        component: CNavItem,
        name: 'Règlements Factures',
        to: '/traitements/reglements',
      },
      {
        component: CNavItem,
        name: 'Remboursement Frais Médicaux',
        to: '/traitements/remboursements',
      },
      {
        component: CNavItem,
        name: 'Retenues Frais Médicaux',
        to: '/traitements/retenues',
      },
      {
        component: CNavItem,
        name: 'Ordres de Paiements',
        to: '/traitements/ordres-paiement',
      },
      {
        component: CNavItem,
        name: 'Suspensions',
        to: '/traitements/suspensions',
      },
      {
        component: CNavItem,
        name: "Bons d'Achats",
        to: '/traitements/bons-achats',
      },
      {
        component: CNavItem,
        name: 'Saisie Journal',
        to: '/traitements/saisie-journal',
      },
    ],
  },
  // La comptabilité : le grand livre, puis les états. Elle s'ouvre avec le
  // Journal Central, qui est la porte d'entrée des autres écrans du menu.
  {
    component: CNavGroup,
    name: 'Comptabilité',
    icon: icone(cilBook),
    items: [
      {
        component: CNavItem,
        name: 'Journal Central',
        to: '/comptabilite/journal-central',
      },
      {
        component: CNavItem,
        name: 'Plan Comptable',
        to: '/comptabilite/plan-comptable',
      },
      // « Interrogation Compte » au singulier, comme le fil d'Ariane de
      // l'origine : c'est le titre de la page qui porte l'accent de trop
      // (« Intérrogation Comptes … »), pas l'entrée de menu.
      {
        component: CNavItem,
        name: 'Interrogation Compte',
        to: '/comptabilite/interrogation-compte',
      },
    ],
  },
]

export default _nav
