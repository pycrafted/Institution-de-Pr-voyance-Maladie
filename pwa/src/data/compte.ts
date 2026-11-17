/**
 * Relevé du compte IPM du participant, partagé par l'écran « Mon relevé ».
 *
 * Même stratégie que la liste des bons (data/bons.ts) : le dernier relevé en
 * cache s'affiche tout de suite (hors ligne compris), puis le réseau le
 * remplace dès qu'il répond. Pas de mémorisation locale ici - un mouvement
 * naît d'une écriture comptable posée par l'IPM, jamais depuis le téléphone.
 */

import { useEffect, useSyncExternalStore } from 'react'

import { ErreurApi, lireCompte } from '../api'
import { enregistrerCompteEnCache, lireCompteEnCache } from '../offline/stockage'
import type { ReleveCompte } from '../types/api'

export interface EtatCompte {
  /** null tant que rien n'est connu (ni cache, ni réseau). */
  releve: ReleveCompte | null
  /** Date-heure ISO de la dernière synchronisation réussie avec le serveur. */
  synchroniseLe: string | null
  /** true si le relevé affiché vient du cache (serveur pas encore joint). */
  depuisCache: boolean
  chargement: boolean
  /** Dernier échec de synchronisation ; le relevé précédent reste affiché. */
  erreur: ErreurApi | null
}

const INITIAL: EtatCompte = {
  releve: null,
  synchroniseLe: null,
  depuisCache: false,
  chargement: false,
  erreur: null,
}

let etat: EtatCompte = INITIAL
const abonnes = new Set<() => void>()
let enCours: Promise<void> | null = null
let dejaCharge = false
// Incrémentée à la déconnexion : une réponse arrivée après ne doit pas
// ressusciter le relevé de l'employé précédent.
let generation = 0

function modifier(partiel: Partial<EtatCompte>) {
  etat = { ...etat, ...partiel }
  abonnes.forEach((abonne) => abonne())
}

function sAbonner(abonne: () => void) {
  abonnes.add(abonne)
  return () => abonnes.delete(abonne)
}

export function etatCompte(): EtatCompte {
  return etat
}

/**
 * Synchronise avec le serveur (le cache d'abord, au premier appel). Les
 * appels simultanés partagent la même requête. Ne rejette jamais : l'échec
 * est dans `erreur`.
 */
export function chargerCompte(): Promise<void> {
  if (enCours) return enCours
  dejaCharge = true
  const ma = generation
  const actuelle = () => ma === generation
  const promesse = (async () => {
    modifier({ chargement: true })
    if (etat.releve === null) {
      const enCache = await lireCompteEnCache()
      if (enCache && actuelle() && etat.releve === null) {
        modifier({ releve: enCache.releve, synchroniseLe: enCache.le, depuisCache: true })
      }
    }
    try {
      const recu = await lireCompte()
      if (!actuelle()) return
      const le = new Date().toISOString()
      modifier({ releve: recu, synchroniseLe: le, depuisCache: false, erreur: null })
      await enregistrerCompteEnCache(recu, le)
    } catch (e) {
      if (actuelle()) modifier({ erreur: e instanceof ErreurApi ? e : new ErreurApi('inconnue') })
    } finally {
      if (actuelle()) {
        modifier({ chargement: false })
        enCours = null
      }
    }
  })()
  enCours = promesse
  return promesse
}

/** Oublie tout (déconnexion). Le cache IndexedDB est vidé par la session. */
export function reinitialiserCompte(): void {
  generation += 1
  dejaCharge = false
  enCours = null
  etat = INITIAL
  abonnes.forEach((abonne) => abonne())
}

/**
 * Le relevé du compte ; le charge au premier écran qui l'utilise.
 * `rafraichir` sert au tirer-pour-rafraîchir (IonRefresher).
 */
export function useCompte(): EtatCompte & { rafraichir: () => Promise<void> } {
  const courant = useSyncExternalStore(sAbonner, etatCompte, etatCompte)
  useEffect(() => {
    if (!dejaCharge) void chargerCompte()
  }, [])
  return { ...courant, rafraichir: chargerCompte }
}
