/**
 * État vide illustré (SPEC_DESIGN §3.10) : liste sans document, recherche
 * sans résultat, erreur de chargement.
 *
 * L'illustration est un SVG maison — un disque en dégradé, un halo, et
 * l'icône du sujet par-dessus — plutôt qu'une grosse icône posée sur un rond
 * plat : c'est ce qui distingue un écran vide soigné d'un écran raté.
 */

import { IonIcon } from '@ionic/react'
import type { ReactNode } from 'react'

import { BoutonPrincipal, BoutonSecondaire } from './Boutons'

/** Teinte de l'illustration : la marque, un statut, ou neutre. */
export type TeinteVide = 'rouge' | 'neutre' | 'valide' | 'traite' | 'annule'

interface Props {
  /** Icône ionicons (ex. `documentTextOutline`) posée au centre du disque. */
  icone: string
  titre: string
  message?: ReactNode
  /** Bouton d'action facultatif (« Nouveau bon », « Réessayer »). */
  action?: { libelle: string; onClick: () => void; icone?: string; secondaire?: boolean }
  teinte?: TeinteVide
  /** Version resserrée, pour un état vide à l'intérieur d'une section. */
  compact?: boolean
  className?: string
}

export default function EtatVide({
  icone,
  titre,
  message,
  action,
  teinte = 'rouge',
  compact = false,
  className,
}: Props) {
  const Bouton = action?.secondaire ? BoutonSecondaire : BoutonPrincipal
  return (
    <div
      className={`ipm-vide ipm-vide--${teinte}${compact ? ' ipm-vide--compact' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="status"
    >
      <span className="ipm-vide__illustration" aria-hidden="true">
        <span className="ipm-vide__halo" />
        <span className="ipm-vide__disque">
          <IonIcon icon={icone} />
        </span>
      </span>
      <h2 className="ipm-vide__titre">{titre}</h2>
      {message && <p className="ipm-vide__message">{message}</p>}
      {action && (
        <div className="ipm-vide__action">
          <Bouton compact icone={action.icone} onClick={action.onClick}>
            {action.libelle}
          </Bouton>
        </div>
      )}
    </div>
  )
}
