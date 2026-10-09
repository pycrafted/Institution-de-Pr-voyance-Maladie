import type { CSSProperties } from 'react'

import { initiales } from '../utils/format'

/*
 * Trois déclinaisons de la charte SAR, et rien d'autre : §1 interdit une
 * couleur en dur dans un composant, et une application rouge et noir n'a pas
 * à montrer une pastille orange, rose ou violette. Les couples fond / texte
 * sont déclarés en jetons (--av-*, cf. theme/variables.css) ; le composant ne
 * choisit qu'un indice.
 *
 * L'indice vient du nom, pour qu'une même personne garde toujours la même
 * pastille d'un écran à l'autre.
 */
const NB_TEINTES = 3

function indiceTeinte(nom: string): number {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (h % NB_TEINTES) + 1
}

interface Props {
  nom: string
  /** Diamètre en pixels (40 par défaut, 44 dans le bandeau, 64 au profil). */
  taille?: number
  /**
   * « douce » : pastille de la charte sur fond clair.
   * « marque » : sur une surface de marque (bandeau), verre blanc translucide
   * cerclé — les teintes douces y deviendraient illisibles.
   */
  ton?: 'douce' | 'marque'
  className?: string
}

/** Pastille ronde aux initiales (bénéficiaires, profil, bandeau de l'accueil). */
export default function Avatar({ nom, taille = 40, ton = 'douce', className }: Props) {
  const style: CSSProperties = {
    width: taille,
    height: taille,
    fontSize: taille * 0.38,
  }
  const teinte = ton === 'douce' ? ` ipm-avatar--${indiceTeinte(nom)}` : ''
  return (
    <span
      className={`ipm-avatar ipm-avatar--${ton}${teinte}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {initiales(nom)}
    </span>
  )
}
