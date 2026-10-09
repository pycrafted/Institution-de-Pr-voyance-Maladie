/**
 * Outils des tests des écrans de documents (« Mes bons » et le détail
 * d'un bon) : Ionic sous jsdom, et un routeur Ionic autour de l'écran.
 *
 * Le routeur est indispensable depuis la refonte : les cartes de liste de la
 * charte poussent la page du bon par `useIonRouter()`, et le bandeau de
 * marque s'en sert pour le retour.
 */

import { setupIonicReact } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { render } from '@testing-library/react'
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

/** Rend un écran sous le routeur Ionic (navigation des cartes de liste). */
export function rendreEcran(ecran: ReactNode) {
  return render(<IonReactRouter>{ecran}</IonReactRouter>)
}

/** La puce de filtre d'une clé (§3.6), à la place de l'ancien ion-segment. */
export function puce(cle: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-puce="${cle}"]`)
  if (!element) throw new Error(`puce « ${cle} » absente`)
  return element
}
