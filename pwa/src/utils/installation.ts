/**
 * Invitation à installer (Android/Chrome : événement `beforeinstallprompt`).
 *
 * Le navigateur émet l'événement une seule fois, souvent avant que l'écran
 * qui propose l'installation soit monté : on l'intercepte dès le démarrage
 * (main.tsx appelle ecouterInstallation) et on le garde ici.
 */

import { useSyncExternalStore } from 'react'

/** Événement non standard de Chromium, absent des types DOM. */
export interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let invitation: EvenementInstallation | null = null
let installee = false
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((abonne) => abonne())

export function ecouterInstallation(): void {
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Pas de mini-barre du navigateur : c'est notre feuille qui propose.
    evenement.preventDefault()
    invitation = evenement as EvenementInstallation
    prevenir()
  })
  window.addEventListener('appinstalled', () => {
    invitation = null
    installee = true
    prevenir()
  })
}

export interface EtatInstallation {
  /** true si le navigateur permet l'installation en un geste (Android). */
  possible: boolean
  /** true juste après une installation acceptée. */
  installee: boolean
}

let instantane: EtatInstallation = { possible: false, installee: false }
function lire(): EtatInstallation {
  if (instantane.possible !== (invitation !== null) || instantane.installee !== installee) {
    instantane = { possible: invitation !== null, installee }
  }
  return instantane
}

function sAbonner(abonne: () => void) {
  abonnes.add(abonne)
  return () => abonnes.delete(abonne)
}

/** Ouvre la boîte d'installation du navigateur ; true si l'employé a accepté. */
export async function proposerInstallation(): Promise<boolean> {
  const evenement = invitation
  if (!evenement) return false
  invitation = null
  prevenir()
  await evenement.prompt()
  const choix = await evenement.userChoice
  return choix.outcome === 'accepted'
}

export function useInstallation(): EtatInstallation & { proposer: () => Promise<boolean> } {
  const etat = useSyncExternalStore(sAbonner, lire, lire)
  return { ...etat, proposer: proposerInstallation }
}
