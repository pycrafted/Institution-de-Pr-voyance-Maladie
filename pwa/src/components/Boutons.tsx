/**
 * Boutons de la charte (SPEC_DESIGN §3.7).
 *
 *   BoutonPrincipal  pilule de 54 de haut, dégradé rouge, 16/700 blanc,
 *                    aura `--ombre-rouge`. Un seul par écran.
 *   BoutonSecondaire même forme, sur surface avec bordure 1 px.
 *   PiedBoutons      le socle des boutons fixés en bas d'écran : un voile
 *                    dégradé transparent → fond, pour que le contenu qui
 *                    défile dessous s'efface au lieu de se couper net.
 *
 * Des `<button>` natifs plutôt qu'IonButton : IonButton impose sa hauteur,
 * ses marges et son fond par des variables qu'il faudrait toutes annuler.
 */

import { IonIcon, IonSpinner } from '@ionic/react'
import type { ReactNode } from 'react'

import { haptique } from '../hooks/haptique'

interface PropsBouton {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Remplace le libellé par une roue et bloque le bouton. */
  occupe?: boolean
  /** Icône ionicons posée devant le libellé. */
  icone?: string
  /** Rouge (défaut) ou noir de marque, pour une action secondaire forte. */
  teinte?: 'rouge' | 'noir'
  className?: string
  /** Libellé lu par le lecteur d'écran s'il diffère du contenu. */
  etiquette?: string
  /** Largeur du contenu plutôt que toute la ligne. */
  compact?: boolean
}

function Bouton({
  variante,
  children,
  onClick,
  type = 'button',
  disabled = false,
  occupe = false,
  icone,
  teinte = 'rouge',
  className,
  etiquette,
  compact = false,
}: PropsBouton & { variante: 'principal' | 'secondaire' }) {
  const classes = [
    'ipm-bouton',
    `ipm-bouton--${variante}`,
    variante === 'principal' ? `ipm-bouton--${teinte}` : '',
    compact ? 'ipm-bouton--compact' : '',
    'ipm-appui',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || occupe}
      aria-busy={occupe || undefined}
      aria-label={etiquette}
      onClick={() => {
        if (disabled || occupe) return
        haptique.leger()
        onClick?.()
      }}
    >
      {occupe ? (
        <IonSpinner name="crescent" aria-hidden="true" className="ipm-bouton__roue" />
      ) : (
        icone && <IonIcon icon={icone} aria-hidden="true" className="ipm-bouton__icone" />
      )}
      <span className="ipm-bouton__libelle">{children}</span>
    </button>
  )
}

/** Action principale d'un écran : pilule 54, dégradé rouge, aura rouge. */
export function BoutonPrincipal(props: PropsBouton) {
  return <Bouton variante="principal" {...props} />
}

/** Action secondaire : même forme, sur surface avec bordure. */
export function BoutonSecondaire(props: PropsBouton) {
  return <Bouton variante="secondaire" {...props} />
}

/** Socle des boutons fixés en bas d'écran (voile dégradé + zone sûre). */
export function PiedBoutons({ children }: { children: ReactNode }) {
  return <div className="ipm-pied-boutons">{children}</div>
}
