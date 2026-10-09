/**
 * Géométrie du pincement pour zoomer de la visionneuse PDF.
 *
 * La page est transformée par `translate(x, y) scale(echelle)` avec une
 * origine en haut à gauche : ces fonctions pures calculent la transformation
 * suivante à partir des doigts, et l'empêchent de laisser du vide autour de
 * la page (comme l'app Photos : on ne « perd » jamais la page).
 */

export const ECHELLE_MIN = 1
export const ECHELLE_MAX = 4
/** Zoom du double tapotement. */
export const ECHELLE_DOUBLE_TAP = 2.5

export interface Transformation {
  echelle: number
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

export const IDENTITE: Transformation = { echelle: 1, x: 0, y: 0 }

export function borner(valeur: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valeur))
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function milieu(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Zoome jusqu'à `echelle` en gardant immobile le point `centre` (coordonnées
 * dans le cadre) : le contenu sous les doigts reste sous les doigts.
 */
export function zoomerAutour(t: Transformation, echelle: number, centre: Point): Transformation {
  const rapport = echelle / t.echelle
  return {
    echelle,
    x: centre.x - (centre.x - t.x) * rapport,
    y: centre.y - (centre.y - t.y) * rapport,
  }
}

/**
 * Remet la page dans le cadre (`largeur` × `hauteur`, taille non zoomée) :
 * échelle entre 1 et le maximum, et aucun bord de page à l'intérieur du cadre.
 */
export function contraindre(t: Transformation, largeur: number, hauteur: number): Transformation {
  const echelle = borner(t.echelle, ECHELLE_MIN, ECHELLE_MAX)
  if (echelle === ECHELLE_MIN) return IDENTITE
  return {
    echelle,
    x: borner(t.x, largeur * (1 - echelle), 0),
    y: borner(t.y, hauteur * (1 - echelle), 0),
  }
}

/** Double tapotement : zoom sur le point touché, ou retour à la page entière. */
export function basculerZoom(
  t: Transformation,
  point: Point,
  largeur: number,
  hauteur: number,
): Transformation {
  if (t.echelle > 1.05) return IDENTITE
  return contraindre(zoomerAutour(t, ECHELLE_DOUBLE_TAP, point), largeur, hauteur)
}

/**
 * Pendant le geste, on tolère un léger dépassement (effet élastique) ;
 * `contraindre` ramène la page en place au lâcher.
 */
export function echelleElastique(echelle: number): number {
  if (echelle < ECHELLE_MIN) return ECHELLE_MIN - (ECHELLE_MIN - echelle) * 0.35
  if (echelle > ECHELLE_MAX) return ECHELLE_MAX + (echelle - ECHELLE_MAX) * 0.35
  return echelle
}

/**
 * Plus grand canvas que les navigateurs mobiles acceptent sans le dessiner
 * blanc : Safari iOS plafonne à 16 777 216 pixels, on garde une marge.
 */
export const PIXELS_MAX_CANVAS = 16_000_000

/**
 * Facteur de rendu d'une page : largeur affichée × densité de l'écran ×
 * zoom, réduit si le canvas dépasserait le plafond de pixels.
 * `rapport` = hauteur / largeur de la page.
 */
export function facteurRendu(
  largeurCss: number,
  rapport: number,
  densite: number,
  zoom: number,
  plafond = PIXELS_MAX_CANVAS,
): number {
  const facteur = Math.max(1, densite) * Math.max(1, zoom)
  const largeur = largeurCss * facteur
  const pixels = largeur * largeur * rapport
  if (pixels <= plafond) return facteur
  return facteur * Math.sqrt(plafond / pixels)
}
