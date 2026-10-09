/**
 * Outils communs aux tests des écrans de l'agent « accueil » (Accueil,
 * Profil, Identification) : environnement Ionic dans jsdom et session
 * simulée, sans IndexedDB ni réseau.
 */

import { setupIonicReact } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { SessionContext, type Session } from '../../session/SessionContext'
import { unMoi } from '../../test/fabriques'

/** Observateur factice : jsdom n'a ni IntersectionObserver ni ResizeObserver. */
class ObservateurFactice {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

/** À appeler dans un beforeAll : ce dont les composants Ionic ont besoin sous jsdom. */
export function preparerIonic(): void {
  for (const nom of ['IntersectionObserver', 'ResizeObserver']) {
    const cibles: object[] = [globalThis, window]
    for (const cible of cibles) {
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

/** Session identifiée d'exemple (Moustapha DIOP et sa conjointe), fonctions simulées. */
export function uneSession(surcharge: Partial<Session> = {}): Session {
  const moi = unMoi()
  return {
    statut: 'identifie',
    participant: moi.participant,
    beneficiaires: moi.beneficiaires,
    motifDeconnexion: null,
    identifier: vi.fn(() => Promise.resolve()),
    rafraichir: vi.fn(() => Promise.resolve()),
    deconnecter: vi.fn(() => Promise.resolve()),
    ...surcharge,
  }
}

/** Rend un écran sous une session donnée et un routeur Ionic (routerLink). */
export function rendreEcran(ecran: ReactNode, session: Session = uneSession()) {
  return render(
    <SessionContext.Provider value={session}>
      <IonReactRouter>{ecran}</IonReactRouter>
    </SessionContext.Provider>,
  )
}
