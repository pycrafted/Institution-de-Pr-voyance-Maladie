/**
 * Chargeur de la PWA : quatre points à traîne qui tournent en cercle.
 *
 * Remplace l'IonSpinner partout. Il prend la couleur du texte autour
 * (currentColor), comme l'IonSpinner : blanc dans un bouton plein, rouge dans
 * un message d'attente, etc. La taille se règle en CSS (28 px par défaut).
 */

import './Chargeur.css'

interface Props {
  className?: string
  /** Libellé lu par les lecteurs d'écran ; sans lui, le chargeur est décoratif. */
  'aria-label'?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

const CENTRE = 20
const RAYON = 14
/** Longueur de la traîne derrière chaque point, en degrés. */
const TRAINE = 55

function point(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: CENTRE + RAYON * Math.cos(radians),
    y: CENTRE + RAYON * Math.sin(radians),
  }
}

/** Les quatre têtes, en diagonale ; la traîne part en arrière (sens inverse de la rotation). */
const BRANCHES = [45, 135, 225, 315].map((tete) => {
  const debut = point(tete - TRAINE)
  const fin = point(tete)
  return {
    tete: fin,
    arc: `M ${debut.x.toFixed(2)} ${debut.y.toFixed(2)} A ${RAYON} ${RAYON} 0 0 1 ${fin.x.toFixed(2)} ${fin.y.toFixed(2)}`,
  }
})

export default function Chargeur({ className, ...aria }: Props) {
  const libelle = aria['aria-label']
  return (
    <svg
      className={`ipm-chargeur${className ? ` ${className}` : ''}`}
      viewBox="0 0 40 40"
      role={libelle ? 'img' : undefined}
      aria-label={libelle}
      aria-hidden={libelle ? undefined : (aria['aria-hidden'] ?? true)}
    >
      <g className="ipm-chargeur__roue">
        {BRANCHES.map((b, i) => (
          <g key={i}>
            <path d={b.arc} className="ipm-chargeur__traine" />
            <circle cx={b.tete.x} cy={b.tete.y} r={2.4} className="ipm-chargeur__point" />
          </g>
        ))}
      </g>
    </svg>
  )
}
