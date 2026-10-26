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
  /**
   * Portrait de la personne (data URI). Quand il existe, il REMPLACE les
   * initiales : une photo se reconnaît d'un coup d'oeil, deux lettres non.
   * La teinte de la pastille ne sert alors à rien et n'est pas posée.
   */
  photo?: string | null
  /** Diamètre en pixels (40 par défaut, 44 dans le bandeau, 64 au profil). */
  taille?: number
  /**
   * « douce » : pastille de la charte sur fond clair.
   * « marque » : sur une surface de marque (bandeau), verre blanc translucide
   * cerclé — les teintes douces y deviendraient illisibles.
   */
  ton?: 'douce' | 'marque'
  /**
   * « ronde » : la pastille habituelle.
   * « identite » : le rectangle arrondi des photos de la carte d'adhérent,
   * dans les proportions d'une photo d'identité. `taille` est alors la
   * LARGEUR, la hauteur suit.
   */
  forme?: 'ronde' | 'identite'
  className?: string
}

/** Proportions de la photo de la carte d'adhérent (4,75em sur 6em). */
const RAPPORT_IDENTITE = 6 / 4.75

/** Le portrait s'il existe, sinon les initiales. */
export default function Avatar({
  nom,
  photo,
  taille = 40,
  ton = 'douce',
  forme = 'ronde',
  className,
}: Props) {
  const identite = forme === 'identite'
  const style: CSSProperties = {
    width: taille,
    height: identite ? Math.round(taille * RAPPORT_IDENTITE) : taille,
    fontSize: taille * 0.38,
  }
  const teinte = photo || ton !== 'douce' ? '' : ` ipm-avatar--${indiceTeinte(nom)}`
  return (
    <span
      className={[
        'ipm-avatar',
        `ipm-avatar--${ton}`,
        identite && 'ipm-avatar--identite',
        teinte.trim(),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-hidden="true"
    >
      {photo ? <img className="ipm-avatar__photo" src={photo} alt="" /> : initiales(nom)}
    </span>
  )
}
