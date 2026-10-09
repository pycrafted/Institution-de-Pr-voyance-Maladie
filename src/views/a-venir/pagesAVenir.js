/**
 * Pages annoncées dans la navigation mais pas encore développées.
 *
 * Elles existent pour donner l'aperçu de l'application terminée : le menu est
 * complet, chaque entrée mène à un écran qui annonce la section à venir.
 * Au fur et à mesure des développements, on retire l'entrée d'ici et on
 * branche la vraie vue dans routes.js.
 */

import { cilUser, cilDescription, cilTask, cilCalculator } from '@coreui/icons'

export const PAGES_A_VENIR = [
  // Les documents du menu ont tous leur vue, déclarée dans routes.js ; seule
  // la racine de la section reste en attente.
  { chemin: '/documents', titre: 'Documents', icone: cilDescription },

  { chemin: '/traitements', titre: 'Traitements', icone: cilTask },
  { chemin: '/comptabilite', titre: 'Comptabilité', icone: cilCalculator },
  // Atteintes par la barre supérieure, pas par le menu.
  { chemin: '/profil', titre: 'Profil', icone: cilUser },
]

export const pageAVenirParChemin = (chemin) => PAGES_A_VENIR.find((p) => p.chemin === chemin)
