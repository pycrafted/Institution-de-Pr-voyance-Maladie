/**
 * Chargement d'une liste de référence de l'assistant (spécialités,
 * prescripteurs, pharmacies) : annulé si l'assistant se ferme, relançable
 * (« Réessayer »), et relancé tout seul au retour du réseau.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { estErreurApi, messageErreur } from '../../api'
import { useOnline } from '../../hooks/useOnline'

export interface Chargement<T> {
  /** null tant que rien n'est arrivé (afficher des squelettes). */
  donnees: T | null
  chargement: boolean
  /** Message montrable tel quel, null si tout va bien. */
  erreur: string | null
  recharger: () => void
}

interface Etat<T> {
  cle: string | null
  donnees: T | null
  chargement: boolean
  erreur: string | null
}

/**
 * Charge `charger(signal)` pour la clé donnée ; `cle === null` : rien à
 * charger (spécialité pas encore choisie). Changer de clé repart de zéro,
 * revenir à la même clé ne recharge pas.
 */
export function useChargement<T>(
  cle: string | null,
  charger: (signal: AbortSignal) => Promise<T>,
): Chargement<T> {
  // La fonction change à chaque rendu ; seule la clé décide d'un rechargement.
  const chargerRef = useRef(charger)
  chargerRef.current = charger
  const [essai, setEssai] = useState(0)
  const [etat, setEtat] = useState<Etat<T>>({
    cle,
    donnees: null,
    chargement: cle !== null,
    erreur: null,
  })
  const enLigne = useOnline()

  useEffect(() => {
    if (cle === null) return
    const controleur = new AbortController()
    setEtat((e) =>
      e.cle === cle
        ? { ...e, chargement: true, erreur: null }
        : { cle, donnees: null, chargement: true, erreur: null },
    )
    chargerRef.current(controleur.signal).then(
      (donnees) => setEtat({ cle, donnees, chargement: false, erreur: null }),
      (e: unknown) => {
        // Assistant fermé ou clé changée : personne n'attend plus cette réponse.
        if (controleur.signal.aborted || (estErreurApi(e) && e.genre === 'annulee')) return
        setEtat((precedent) => ({ ...precedent, cle, chargement: false, erreur: messageErreur(e) }))
      },
    )
    return () => controleur.abort()
  }, [cle, essai])

  const recharger = useCallback(() => setEssai((n) => n + 1), [])

  // Réseau revenu après un échec : on réessaie sans attendre un geste.
  const echec = etat.erreur !== null && etat.donnees === null
  useEffect(() => {
    if (enLigne && echec) recharger()
    // Seul le retour du réseau déclenche : pas l'échec lui-même (boucle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne])

  const aJour = etat.cle === cle
  return {
    donnees: aJour ? etat.donnees : null,
    chargement: cle !== null && (!aJour || etat.chargement),
    erreur: aJour ? etat.erreur : null,
    recharger,
  }
}
