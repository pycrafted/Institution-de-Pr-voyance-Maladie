/**
 * Chargement de l'annuaire des structures conventionnées, toutes spécialités
 * confondues (`GET /api/mobile/conventionnes/`).
 *
 * L'annuaire ne change pas d'une minute à l'autre : la dernière liste reçue
 * est gardée en mémoire du module, de sorte qu'un second passage sur l'écran
 * l'affiche instantanément, sans squelettes, pendant qu'une requête discrète
 * la rafraîchit. Cette mémoire n'est PAS un cache hors-ligne : elle disparaît
 * au rechargement de l'application (le socle `offline/stockage.ts` ne stocke
 * aujourd'hui que les bons et leurs PDF — cf. rapport).
 *
 * Aucune donnée personnelle ici : l'annuaire est le même pour tout le monde,
 * il n'a donc pas à être effacé à la déconnexion.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { ErreurApi, listerConventionnes } from '../../api'
import type { Conventionne } from '../../types/api'

interface Memoire {
  structures: Conventionne[]
  /** Date-heure ISO de la réception. */
  le: string
}

let memoire: Memoire | null = null

export interface EtatConventionnes {
  /** null tant que rien n'est connu : c'est le moment des squelettes. */
  structures: Conventionne[] | null
  chargement: boolean
  /** Dernier échec ; la liste déjà affichée, s'il y en a une, reste visible. */
  erreur: ErreurApi | null
  /** Date-heure ISO de la dernière réponse du serveur. */
  synchroniseLe: string | null
}

/** Oublie la liste mémorisée (tests, et changement d'employé). */
export function reinitialiserConventionnes(): void {
  memoire = null
}

/**
 * L'annuaire, chargé à l'affichage de l'écran. `rafraichir` sert au
 * tirer-pour-rafraîchir (IonRefresher) et au bouton « Réessayer ».
 */
export function useConventionnes(): EtatConventionnes & { rafraichir: () => Promise<void> } {
  const [etat, setEtat] = useState<EtatConventionnes>(() => ({
    structures: memoire?.structures ?? null,
    chargement: true,
    erreur: null,
    synchroniseLe: memoire?.le ?? null,
  }))
  // L'écran peut être quitté pendant la requête : ne plus rien publier après.
  const vivant = useRef(true)

  const charger = useCallback(async (signal?: AbortSignal) => {
    setEtat((precedent) => ({ ...precedent, chargement: true }))
    try {
      const recues = await listerConventionnes({ signal })
      if (!vivant.current) return
      const le = new Date().toISOString()
      memoire = { structures: recues, le }
      setEtat({ structures: recues, chargement: false, erreur: null, synchroniseLe: le })
    } catch (e) {
      const erreur = e instanceof ErreurApi ? e : new ErreurApi('inconnue')
      // Requête annulée parce que l'écran a été quitté : rien à signaler.
      if (!vivant.current || erreur.genre === 'annulee') return
      setEtat((precedent) => ({ ...precedent, chargement: false, erreur }))
    }
  }, [])

  useEffect(() => {
    vivant.current = true
    const controleur = new AbortController()
    void charger(controleur.signal)
    return () => {
      vivant.current = false
      controleur.abort()
    }
  }, [charger])

  return { ...etat, rafraichir: () => charger() }
}
