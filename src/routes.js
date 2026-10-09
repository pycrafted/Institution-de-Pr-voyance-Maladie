import React from 'react'

import { PAGES_A_VENIR } from './views/a-venir/pagesAVenir'

const TableauDeBord = React.lazy(() => import('./views/tableau-de-bord/TableauDeBord'))
const DonneesDeBase = React.lazy(() => import('./views/donnees-de-base/DonneesDeBase'))
const FournisseursDeSoins = React.lazy(
  () => import('./views/fournisseurs-de-soins/FournisseursDeSoins'),
)
const Adherents = React.lazy(() => import('./views/adherents/Adherents'))
const Participants = React.lazy(() => import('./views/participants/Participants'))
const BonsPharmacie = React.lazy(() => import('./views/documents/bons-pharmacie/BonsPharmacie'))
const LettresGarantie = React.lazy(
  () => import('./views/documents/lettres-garantie/LettresGarantie'),
)
const BonsOptique = React.lazy(() => import('./views/documents/bons-optique/BonsOptique'))
const Parametres = React.lazy(() => import('./views/parametres/Parametres'))
const LgHospitalisation = React.lazy(
  () => import('./views/documents/lg-hospitalisation/LgHospitalisation'),
)
const Factures = React.lazy(() => import('./views/traitements/Factures'))
const Reglements = React.lazy(() => import('./views/traitements/Reglements'))
const PageAVenir = React.lazy(() => import('./views/a-venir/PageAVenir'))

export const routes = [
  { path: '/', exact: true, name: 'Accueil' },
  { path: '/tableau-de-bord', name: 'Tableau de bord', element: TableauDeBord },
  { path: '/donnees-de-base', name: 'Données de base', element: DonneesDeBase },
  { path: '/fournisseurs-de-soins', name: 'Fournisseurs de Soins', element: FournisseursDeSoins },
  { path: '/adherents', name: 'Adhérents', element: Adherents },
  { path: '/participants', name: 'Participants', element: Participants },
  { path: '/documents/bons-pharmacie', name: 'Bons de Pharmacie', element: BonsPharmacie },
  { path: '/documents/lettres-garantie', name: 'Lettres de Garantie', element: LettresGarantie },
  { path: '/documents/bons-optique', name: 'Bons Optique', element: BonsOptique },
  { path: '/parametres', name: 'Paramètres', element: Parametres },
  {
    path: '/documents/lg-hospitalisation',
    name: 'LG Hospitalisation',
    element: LgHospitalisation,
  },
  { path: '/traitements/factures', name: 'Factures', element: Factures },
  { path: '/traitements/factures/:id', name: 'Traitement facture', element: Factures },
  { path: '/traitements/reglements', name: 'Règlements', element: Reglements },

  // Sections annoncées dans le menu, écran d'attente en attendant leur
  // développement. Retirer l'entrée de pagesAVenir.js et déclarer la vraie
  // vue ici le jour où l'une d'elles est réalisée.
  ...PAGES_A_VENIR.map((page) => ({
    path: page.chemin,
    name: page.titre,
    element: PageAVenir,
  })),
]

export default routes
