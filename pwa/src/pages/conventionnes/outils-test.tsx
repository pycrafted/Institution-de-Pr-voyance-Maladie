/**
 * Outils des tests de l’écran « Conventionnés » : Ionic sous jsdom, et un
 * routeur Ionic autour de l'écran (le bandeau de marque s'en sert pour le
 * retour). Même forme que pages/bons/outils-test.tsx.
 */

import { setupIonicReact } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** jsdom n'a ni IntersectionObserver ni ResizeObserver, dont Ionic se sert. */
class ObservateurFactice {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

/** À appeler dans un beforeAll : ce dont les composants Ionic ont besoin. */
export function preparerIonic(): void {
  for (const nom of ['IntersectionObserver', 'ResizeObserver']) {
    for (const cible of [globalThis, window] as object[]) {
      if (!(nom in cible)) {
        Object.defineProperty(cible, nom, {
          configurable: true,
          writable: true,
          value: ObservateurFactice,
        })
      }
    }
  }
  setupIonicReact({ innerHTMLTemplatesEnabled: false })
}

/** Rend un écran sous le routeur Ionic. */
export function rendreEcran(ecran: ReactNode) {
  return render(<IonReactRouter>{ecran}</IonReactRouter>)
}

/** Le champ de recherche de la charte (§3.8) enveloppe un ion-input. */
export function rechercher(texte: string): void {
  const saisie = document.querySelector('ion-input')
  if (!saisie) throw new Error('champ de recherche absent')
  fireEvent(saisie, new CustomEvent('ionInput', { detail: { value: texte } }))
}

/**
 * Force `navigator.onLine` (useOnline le lit tel quel) et rend la valeur
 * d'origine au test suivant.
 */
export function simulerReseau(enLigne: boolean): () => void {
  // Propriété posée sur l'instance : la supprimer redonne celle du prototype.
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLigne })
  return () => {
    Reflect.deleteProperty(navigator, 'onLine')
  }
}
