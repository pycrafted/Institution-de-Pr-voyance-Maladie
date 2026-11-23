/**
 * Chargement de l'annuaire des structures conventionnées, toutes spécialités
 * confondues (`GET /api/mobile/conventionnes/`).
 *
 * L'annuaire ne change pas d'une minute à l'autre : la dernière liste reçue
 * est gardée en mémoire du module, de sorte qu'un second passage sur l'écran
 * l'affiche instantanément, sans squelettes, pendant qu'une requête discrète
 * la rafraîchit. Elle est aussi recopiée dans le stockage du navigateur : au
 * lancement suivant de l'application, la carte a ses points tout de suite
 * (puis la liste est remise à jour en silence), et l'annuaire reste
 * consultable hors ligne. `prechargerConventionnes()` la demande dès la
 * connexion, pour que l'onglet « Structures » s'ouvre déjà rempli.
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

/** Clé du stockage du navigateur (versionnée : un changement de forme l'invalide). */
const CLE_STOCKAGE = 'ipm.conventionnes.v1'

let memoire: Memoire | null = lireStockage()

function lireStockage(): Memoire | null {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE)
    if (!brut) return null
    const lu = JSON.parse(brut) as Memoire
    return Array.isArray(lu.structures) && typeof lu.le === 'string' ? lu : null
  } catch {
    return null
  }
}

function memoriser(structures: Conventionne[]): Memoire {
  memoire = { structures, le: new Date().toISOString() }
  try {
    window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(memoire))
  } catch {
    // Navigation privée ou stockage plein : la mémoire du module suffit.
  }
  return memoire
}

/**
 * La requête en cours, partagée entre le préchargement et l'écran. Jamais
 * annulée : un écran quitté ignore seulement la réponse (l'annuler privait
 * l'autre demandeur de sa liste).
 */
let enCours: Promise<Memoire> | null = null

function demander(): Promise<Memoire> {
  if (!enCours) {
    enCours = listerConventionnes()
      .then(memoriser)
      .finally(() => {
        enCours = null
      })
  }
  return enCours
}

/**
 * Charge l'annuaire en arrière-plan (après la connexion), s'il n'a pas été
 * reçu depuis plus de 10 minutes. Un échec est sans conséquence : l'écran
 * réessaiera à son ouverture.
 */
export function prechargerConventionnes(): void {
  const age = memoire ? Date.now() - Date.parse(memoire.le) : Number.POSITIVE_INFINITY
  if (age < 10 * 60_000) return
  void demander().catch(() => undefined)
}

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
  enCours = null
  try {
    window.localStorage.removeItem(CLE_STOCKAGE)
  } catch {
    // Rien à effacer.
  }
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

  const charger = useCallback(async () => {
    setEtat((precedent) => ({ ...precedent, chargement: true }))
    try {
      const recue = await demander()
      if (!vivant.current) return
      setEtat({
        structures: recue.structures,
        chargement: false,
        erreur: null,
        synchroniseLe: recue.le,
      })
    } catch (e) {
      const erreur = e instanceof ErreurApi ? e : new ErreurApi('inconnue')
      // Requête annulée parce que l'écran a été quitté : rien à signaler.
      if (!vivant.current || erreur.genre === 'annulee') return
      setEtat((precedent) => ({ ...precedent, chargement: false, erreur }))
    }
  }, [])

  useEffect(() => {
    vivant.current = true
    void charger()
    return () => {
      vivant.current = false
    }
  }, [charger])

  return { ...etat, rafraichir: () => charger() }
}
