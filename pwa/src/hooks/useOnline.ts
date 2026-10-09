import { useSyncExternalStore } from 'react'

/**
 * true si l'appareil se dit connecté. `navigator.onLine` ne garantit pas que
 * le serveur répond (portail captif, réseau sans Internet) : c'est une
 * indication pour l'interface (bandeau, bouton désactivé), les appels
 * gardent leurs propres erreurs « réseau ».
 */
export function useOnline(): boolean {
  return useSyncExternalStore(sAbonner, lire, () => true)
}

function lire(): boolean {
  return navigator.onLine
}

function sAbonner(abonne: () => void) {
  window.addEventListener('online', abonne)
  window.addEventListener('offline', abonne)
  return () => {
    window.removeEventListener('online', abonne)
    window.removeEventListener('offline', abonne)
  }
}
