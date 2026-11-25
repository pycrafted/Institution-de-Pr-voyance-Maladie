/**
 * Palette de visualisation du tableau de bord.
 *
 * Elle suit la règle de « Données de base » : du noir, du blanc, un rouge.
 * Cette page-là ne montre que deux couleurs - le noir des en-têtes et de
 * l'élément actif, le rouge SAR d'un bouton et d'une icône - et c'est
 * précisément ce qui la rend calme. Un tableau de bord bariolé à côté d'elle
 * casserait l'application en deux.
 *
 * D'où la composition ici :
 *   · une **rampe graphite** pour les figures à plusieurs parts. Une seule
 *     teinte, cinq clartés - les secteurs se distinguent par la valeur, pas
 *     par la couleur ;
 *   · un **graphite plein** pour toute marque à série unique ;
 *   · l'**accent de l'IPM** réservé à la série principale d'une comparaison.
 *     Depuis qu'il est une ardoise sombre (2026-11-25), il se distingue du
 *     graphite par la TEINTE et non plus par la clarté : la seconde série
 *     d'une comparaison prend donc `secondaire`, un graphite clair, et non
 *     plus `neutre`, qui avait la même clarté que lui ;
 *   · le **rouge d'alerte** pour les dossiers rejetés et les écarts
 *     défavorables. Rien d'autre.
 *
 * Les niveaux ont été vérifiés sur la surface réelle des cartes (#ffffff) :
 * clarté monotone, écart visible entre marches, teinte unique, et extrémité
 * claire au-dessus du plancher de contraste.
 */

// -----------------------------------------------------------------------------
// Rampe graphite - figures à plusieurs parts
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
const RAMPE = ['#b0a6a5', '#9a908e', '#847a78', '#6d6361', '#554c4b']

// -----------------------------------------------------------------------------
// Chrome du graphique : encres, grilles, surfaces
// -----------------------------------------------------------------------------
// Repris des gris déjà employés par la barre supérieure, le rail et les
// tableaux, pour que rien ne détonne d'une page à l'autre.
const CHROME = {
  surface: '#ffffff',
  grille: '#f4edec',
  axe: '#ddd4d3',
  encre: '#1d1d1b',
  encreDouce: '#5b5250',
  encreMuette: '#736968',
  // Marque à série unique : le graphite d'un cran plus foncé que le milieu
  // de rampe, pour se détacher sans peser. Seule, elle ne voisine rien.
  neutre: '#4c4443',
  // Seconde série d'une comparaison, celle qui voisine l'accent.
  //
  // Elle valait `neutre` jusqu'au 2026-11-25. L'accent, devenu une ardoise
  // SOMBRE, a la même clarté que ce graphite - 1,08:1 entre les deux : les
  // deux courbes de « Dépenses engagées / Remboursements versés » devenaient
  // indiscernables, et tout à fait indiscernables en niveaux de gris. Le
  // milieu de rampe rend 3,28:1 contre l'accent et 3,11:1 sur le blanc des
  // cartes : au-dessus du plancher de 3:1 des deux côtés.
  secondaire: '#9a908e',
  // L'accent de l'IPM, le même que celui des boutons et des rails de
  // l'application. Écrit en dur ici parce que Chart.js dessine sur un canevas
  // et ne lit pas les variables CSS : si l'accent change dans style.scss, il
  // faut changer cette ligne avec lui.
  accent: '#344256',
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
// accompagnent - la couleur seule ne dit rien.
//
// Le rejet et la baisse prennent le rouge d'ALERTE, et non l'accent de la
// marque : signaler un dossier rejeté ou un écart défavorable n'est pas un
// geste de marque, et les deux rouges ne doivent pas se confondre. C'est la
// règle des écrans de Comptabilité.
const ETATS = {
  valide: '#2f7d32',
  encours: '#a9791b',
  attente: '#b4643c',
  rejete: '#c62828',
  hausse: '#2f7d32',
  baisse: '#c62828',
}

/**
 * Convertit une teinte en rgba - sert aux aplats d'aire (~10 % d'opacité :
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
