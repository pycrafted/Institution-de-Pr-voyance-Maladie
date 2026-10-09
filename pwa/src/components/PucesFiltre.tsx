/**
 * Puces de filtre (SPEC_DESIGN §3.6) — la rangée de pilules qui défile à
 * l'horizontale, en remplacement d'`ion-segment`, interdit par §1 : son
 * rectangle gris à barres de séparation est un onglet de site web.
 *
 * Active : rouge plein, texte blanc. Inactive : surface + bordure 1 px.
 * La barre de défilement est masquée globalement (theme/global.css).
 */

import { haptique } from '../hooks/haptique'

export interface Puce {
  /** Valeur remontée à `onChanger` ; sert aussi de clé React. */
  cle: string
  libelle: string
  /** Compteur affiché derrière le libellé (nombre de documents). */
  nombre?: number
}

interface Props {
  puces: readonly Puce[]
  /** Clé de la puce active. */
  active: string
  onChanger: (cle: string) => void
  /** Libellé du groupe pour le lecteur d'écran. */
  etiquette: string
  className?: string
}

export default function PucesFiltre({ puces, active, onChanger, etiquette, className }: Props) {
  return (
    <div
      className={`ipm-puces${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={etiquette}
    >
      {puces.map((puce) => {
        const choisie = puce.cle === active
        return (
          <button
            key={puce.cle}
            type="button"
            role="tab"
            aria-selected={choisie}
            data-puce={puce.cle}
            className={`ipm-puce${choisie ? ' ipm-puce--active' : ''}`}
            onClick={() => {
              if (choisie) return
              haptique.selection()
              onChanger(puce.cle)
            }}
          >
            {puce.libelle}
            {puce.nombre !== undefined && (
              <span className="ipm-puce__nombre ipm-chiffres">{puce.nombre}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
