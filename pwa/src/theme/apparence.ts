/**
 * Apparence de l'application : claire (par défaut) ou sombre, au choix de
 * l'employé, depuis le bouton de l'accueil.
 *
 * Le choix ne suit donc plus le réglage du téléphone : la palette sombre
 * d'Ionic et celle de la charte (theme/variables.css) se posent sur la classe
 * « ion-palette-dark » de <html>, que ce module met ou retire. Le choix est
 * gardé dans ce téléphone (localStorage) ; s'il n'y en a pas, ou si le
 * stockage est refusé (navigation privée), c'est le clair.
 */

import { useSyncExternalStore } from 'react'

export type Apparence = 'sombre' | 'clair'

const CLE = 'ipm.apparence'

/**
 * Couleur de la barre d'état du téléphone : le noir de marque, haut du
 * dégradé du bandeau (--deg-marque). Chaque écran commence par un bandeau,
 * en clair comme en sombre : la barre d'état se pose dessus.
 */
const FOND: Record<Apparence, string> = { clair: '#1D1D1B', sombre: '#1D1D1B' }
export const APPARENCE_PAR_DEFAUT: Apparence = 'clair'

const abonnes = new Set<() => void>()
let courante: Apparence = lire()

function lire(): Apparence {
  try {
    const gardee = localStorage.getItem(CLE)
    return gardee === 'clair' || gardee === 'sombre' ? gardee : APPARENCE_PAR_DEFAUT
  } catch {
    return APPARENCE_PAR_DEFAUT
  }
}

function poser(apparence: Apparence) {
  const racine = document.documentElement
  racine.classList.toggle('ion-palette-dark', apparence === 'sombre')
  // Contrôles natifs (sélecteur de fichier, barres) dans le même ton.
  racine.style.colorScheme = apparence === 'sombre' ? 'dark' : 'light'
  poserBarreEtat(FOND[apparence])
}

/** Écrit la couleur de la barre d'état (Android, et iOS installé). */
function poserBarreEtat(couleur: string) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (metas.length === 0) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = couleur
    document.head.appendChild(meta)
    return
  }
  metas.forEach((meta) => {
    // Une balise à condition de mode (media) ne doit pas être réécrite : elle
    // ne s'applique pas toujours. Il n'y en a plus, mais rien ne l'interdit.
    if (!meta.media) meta.content = couleur
  })
}

/** À appeler au démarrage, avant le premier rendu : pas d'éclair clair. */
export function appliquerApparence() {
  poser(courante)
}

export function changerApparence(apparence: Apparence) {
  courante = apparence
  poser(apparence)
  try {
    localStorage.setItem(CLE, apparence)
  } catch {
    // Stockage refusé : le choix vaut pour cette session seulement.
  }
  abonnes.forEach((prevenir) => prevenir())
}

export function basculerApparence() {
  changerApparence(courante === 'sombre' ? 'clair' : 'sombre')
}

/** Relit le choix gardé (tests). */
export function reinitialiserApparence() {
  courante = lire()
  poser(courante)
}

function sAbonner(prevenir: () => void) {
  abonnes.add(prevenir)
  return () => {
    abonnes.delete(prevenir)
  }
}

export function useApparence(): Apparence {
  return useSyncExternalStore(sAbonner, () => courante)
}
