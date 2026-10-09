/**
 * Logo SAR (l'ovale rouge du site IPM), en image plutôt qu'en SVG tracé à la
 * main : c'est le logo officiel, il ne se redessine pas.
 *
 * `ton="blanc"` ne charge pas un second fichier : le logo étant d'une seule
 * couleur pleine, `brightness(0) invert(1)` le rend blanc franc. Une seule
 * image à précacher pour le bandeau sombre comme pour la carte rouge.
 */

interface Props {
  /** Largeur en pixels (la hauteur suit le rapport du logo, ~2,2:1). */
  largeur?: number
  /** « rouge » sur fond clair, « blanc » sur une surface de marque. */
  ton?: 'rouge' | 'blanc'
  className?: string
}

/** Chemin public du logo (public/logo-sar.png), précaché par le service worker. */
export const LOGO_SAR = '/logo-sar.png'

export default function LogoSar({ largeur = 56, ton = 'rouge', className }: Props) {
  return (
    <img
      className={`ipm-logo ipm-logo--${ton}${className ? ` ${className}` : ''}`}
      src={LOGO_SAR}
      alt="SAR"
      width={largeur}
      style={{ width: largeur }}
      draggable={false}
    />
  )
}
