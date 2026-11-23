/**
 * Les ayants droit du participant connecté : sa famille, sans lui-même (le
 * titulaire a déjà sa propre carte). Partagé par l'accueil, la page
 * « Identité » et la feuille des photos.
 */

import { useMemo } from 'react'

import { useParticipant } from '../session'

export function useFamille() {
  const { beneficiaires } = useParticipant()
  return useMemo(
    () => beneficiaires.filter((beneficiaire) => !beneficiaire.estParticipant),
    [beneficiaires],
  )
}
