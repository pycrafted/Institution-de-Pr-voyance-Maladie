/**
 * Ancien nom de l'état vide, conservé le temps que les écrans pas encore
 * repris par la refonte (Mes bons, Détail, assistant) passent à `EtatVide`.
 *
 * Il ne fait que traduire l'ancienne API (`couleur` en couleur Ionic) vers la
 * nouvelle (`teinte` de la charte). Ne pas l'employer dans du code neuf.
 *
 * @deprecated Employer `EtatVide` (SPEC_DESIGN §3.10).
 */

import type { ReactNode } from 'react'

import EtatVide, { type TeinteVide } from './EtatVide'

interface Props {
  icone: string
  titre: string
  message?: ReactNode
  action?: { libelle: string; onClick: () => void; icone?: string }
  couleur?: 'primary' | 'medium' | 'danger' | 'secondary' | 'success'
}

const TEINTES: Record<NonNullable<Props['couleur']>, TeinteVide> = {
  primary: 'rouge',
  medium: 'neutre',
  danger: 'annule',
  secondary: 'traite',
  success: 'valide',
}

export default function EmptyState({ icone, titre, message, action, couleur = 'primary' }: Props) {
  return (
    <EtatVide
      icone={icone}
      titre={titre}
      message={message}
      action={action}
      teinte={TEINTES[couleur]}
    />
  )
}
