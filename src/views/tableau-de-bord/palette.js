/**
 * Palette de visualisation du tableau de bord.
 *
 * Elle suit la règle de « Données de base » : du noir, du blanc, un rouge.
 * Cette page-là ne montre que deux couleurs — le noir des en-têtes et de
 * l'élément actif, le rouge SAR d'un bouton et d'une icône — et c'est
 * précisément ce qui la rend calme. Un tableau de bord bariolé à côté d'elle
 * casserait l'application en deux.
 *
 * D'où la composition ici :
 *   · une **rampe graphite** pour les figures à plusieurs parts. Une seule
 *     teinte, cinq clartés — les secteurs se distinguent par la valeur, pas
 *     par la couleur ;
 *   · un **graphite plein** pour toute marque à série unique ;
 *   · le **rouge SAR** réservé à la série principale d'une comparaison, aux
 *     dossiers rejetés et aux écarts défavorables. Rien d'autre.
 *
 * Les niveaux ont été vérifiés sur la surface réelle des cartes (#ffffff) :
 * clarté monotone, écart visible entre marches, teinte unique, et extrémité
 * claire au-dessus du plancher de contraste.
 */

// -----------------------------------------------------------------------------
// Rampe graphite — figures à plusieurs parts
// -----------------------------------------------------------------------------
// Elle descend du gris vers le presque-noir, ses deux extrémités choisies pour
// rester au-dessus du fond blanc des cartes.
//
// L'attribution suit l'ordre de déclaration des catégories, jamais leur rang :
// une rampe posée par ordre de grandeur redirait en clarté ce que la taille
// du secteur montre déjà, et changerait de couleur au moindre filtre.
// La rampe s'arrête à mi-course au lieu de plonger jusqu'au presque-noir :
// sur un camembert ou une aire polaire, les marches sont de grandes surfaces,
// et un secteur quasi noir de la taille d'un quart de disque fait un pavé qui
// écrase toute la carte. Cinq marches suffisamment écartées dans une plage
// resserrée se distinguent tout aussi bien, sans peser.
const RAMPE = ['#a2a9b4', '#8b939f', '#747d8a', '#5d6673', '#464f5c']

// -----------------------------------------------------------------------------
// Chrome du graphique : encres, grilles, surfaces
// -----------------------------------------------------------------------------
// Repris des gris déjà employés par la barre supérieure, le rail et les
// tableaux, pour que rien ne détonne d'une page à l'autre.
const CHROME = {
  surface: '#ffffff',
  grille: '#eceff2',
  axe: '#d9dde2',
  encre: '#1d1d1b',
  encreDouce: '#4b5563',
  encreMuette: '#6b7280',
  // Marque à série unique : le graphite d'un cran plus foncé que le milieu
  // de rampe, pour se détacher sans peser.
  neutre: '#3f4753',
  accent: '#e52621',
  // L'infobulle reprend le noir SAR des en-têtes de tableaux et du bandeau
  // des panneaux : c'est la même surface « inversée » d'un bout à l'autre.
  infobulle: { fond: '#1d1d1b', titre: '#ffffff', corps: 'rgba(255, 255, 255, 0.78)' },
}

// -----------------------------------------------------------------------------
// Couleurs d'état
// -----------------------------------------------------------------------------
// Rabattues par rapport aux verts et ambres d'usage : à côté du gris de la
// page, une saturation pleine ferait tache. Elles restent au-dessus de 3:1
// sur leur fond, et ne circulent jamais sans l'icône et le libellé qui les
// accompagnent — la couleur seule ne dit rien.
//
// Le rejet reprend le rouge SAR : c'est déjà la couleur du danger partout
// ailleurs dans l'application.
const ETATS = {
  valide: '#2f7d32',
  encours: '#a9791b',
  attente: '#b4643c',
  rejete: '#e52621',
  hausse: '#2f7d32',
  baisse: '#e52621',
}

/**
 * Convertit une teinte en rgba — sert aux aplats d'aire (~10 % d'opacité :
 * un lavis, jamais un bloc saturé) et aux pistes de jauges.
 *
 * @param {string} hex couleur au format #rrggbb
 * @param {number} alpha opacité entre 0 et 1
 */
export const avecAlpha = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Palette de la page. Constante : l'application n'a qu'un mode d'affichage.
 */
export const PALETTE = {
  rampe: RAMPE,
  etats: ETATS,
  ...CHROME,
}
