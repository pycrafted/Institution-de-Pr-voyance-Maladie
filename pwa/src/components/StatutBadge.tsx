import { IonIcon } from '@ionic/react'

import type { StatutBon } from '../types/api'
import { infoStatut } from '../utils/statut'

interface Props {
  statut: StatutBon
  /** « petit » dans les listes, « grand » dans l'en-tête du détail. */
  taille?: 'petit' | 'grand'
  /** Affiche l'icône devant le libellé (grand par défaut). */
  icone?: boolean
  /** Sur une surface de marque (bandeau rouge ou noir) : pilule translucide. */
  surMarque?: boolean
}

/**
 * Puce de statut en pilule (SPEC_DESIGN §3.5) : valide vert, traité bleu,
 * expiré gris, annulé rouge. Les couleurs viennent des jetons `--st-*` par
 * la classe `ipm-statut--<statut>` : aucune couleur n'est posée ici, sinon
 * le mode sombre mentirait.
 */
export default function StatutBadge({
  statut,
  taille = 'petit',
  icone = taille === 'grand',
  surMarque = false,
}: Props) {
  const info = infoStatut(statut)
  return (
    <span
      className={`ipm-statut ipm-statut--${statut} ipm-statut--${taille}${
        surMarque ? ' ipm-statut--marque' : ''
      }`}
      data-statut={statut}
    >
      {icone && <IonIcon icon={info.icone} aria-hidden="true" />}
      {info.libelle}
    </span>
  )
}
