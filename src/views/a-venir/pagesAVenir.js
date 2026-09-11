/**
 * Pages annoncées dans la navigation mais pas encore développées.
 *
 * Elles existent pour donner l'aperçu de l'application terminée : le menu est
 * complet, chaque entrée mène à un écran qui annonce la section à venir.
 * Au fur et à mesure des développements, on retire l'entrée d'ici et on
 * branche la vraie vue dans routes.js.
 */

import {
  cilUser,
  cilSettings,
  cilDescription,
  cilTask,
  cilCalculator,
  cilEnvelopeLetter,
  cilBed,
} from '@coreui/icons'

import { oeil } from '../../assets/icones'

export const PAGES_A_VENIR = [
  { chemin: '/documents', titre: 'Documents', icone: cilDescription },

  // Les documents de la section « Documents » du menu dont l'écran reste à
  // faire. « Bons de Pharmacie » n'y figure plus : sa vue est développée et
  // déclarée dans routes.js.
  { chemin: '/documents/lettres-garantie', titre: 'Lettres de Garantie', icone: cilEnvelopeLetter },
  { chemin: '/documents/lg-hospitalisation', titre: 'LG Hospitalisation', icone: cilBed },
  // Pas de lunettes chez CoreUI : l'œil maison de la page de connexion fait
  // l'affaire, et dit « optique » sans ambiguïté.
  { chemin: '/documents/bons-optique', titre: 'Bons Optique', icone: oeil },

  { chemin: '/traitements', titre: 'Traitements', icone: cilTask },
  { chemin: '/comptabilite', titre: 'Comptabilité', icone: cilCalculator },
  // Atteintes par la barre supérieure, pas par le menu.
  { chemin: '/parametres', titre: 'Paramètres', icone: cilSettings },
  { chemin: '/profil', titre: 'Profil', icone: cilUser },
]

export const pageAVenirParChemin = (chemin) => PAGES_A_VENIR.find((p) => p.chemin === chemin)
