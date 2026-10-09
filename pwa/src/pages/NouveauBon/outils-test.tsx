/**
 * Outils des tests de l'assistant « Nouveau bon » : Ionic sous jsdom, session
 * simulée, et un faux serveur mobile branché sur le client API (aucun appel
 * réseau réel).
 */

// Module de tests, jamais rechargé à chaud : la règle de Fast Refresh (un
// fichier = des composants seulement) ne le concerne pas.
/* eslint-disable react-refresh/only-export-components */

import { setupIonicReact } from '@ionic/react'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { configurerClient } from '../../api'
import { SessionContext, type Session } from '../../session/SessionContext'
import { reponseJson, unBon, unFournisseur, uneSpecialite, unMoi } from '../../test/fabriques'
import type { Bon, Fournisseur, Specialite } from '../../types/api'

/** jsdom n'a ni IntersectionObserver ni ResizeObserver, dont Ionic se sert. */
class ObservateurFactice {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

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

export function rendreAvecSession(ecran: ReactNode, session: Session = uneSession()) {
  return render(<SessionContext.Provider value={session}>{ecran}</SessionContext.Provider>)
}

export const SPECIALITES: Specialite[] = [
  uneSpecialite(),
  uneSpecialite({ code: '02', libelle: 'PEDIATRIE', nombre: 1 }),
]
export const PRESCRIPTEURS: Fournisseur[] = [
  unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN', adresse: 'Fann Résidence' }),
]
export const PHARMACIES: Fournisseur[] = [
  unFournisseur(),
  unFournisseur({ code: 'PH002', libelle: "PHARMACIE DE L'AEROPORT", adresse: 'Yoff' }),
]
export const BON_CREE: Bon = unBon({ id: 42, code: 'BPI000042', valableJusquAu: '2026-10-18' })

export interface Appel {
  methode: string
  url: string
  corps: unknown
  autorisation: string | null
}

/**
 * Faux serveur : répond aux points d'entrée de l'assistant. `creation`
 * décide de la réponse au POST ; `pharmacies` peut simuler une panne.
 */
export function fauxServeur(
  options: {
    creation?: () => Response | Promise<Response>
    pharmacies?: () => Response | Promise<Response>
  } = {},
) {
  const appels: Appel[] = []
  const fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree)
    const methode = init?.method ?? 'GET'
    const entetes = (init?.headers ?? {}) as Record<string, string>
    appels.push({
      methode,
      url,
      corps: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      autorisation: entetes.Authorization ?? null,
    })
    if (url.endsWith('/mobile/specialites/')) return reponseJson(SPECIALITES)
    if (url.endsWith('/mobile/pharmacies/'))
      return options.pharmacies ? options.pharmacies() : reponseJson(PHARMACIES)
    if (url.includes('/mobile/prescripteurs/')) return reponseJson(PRESCRIPTEURS)
    if (url.endsWith('/mobile/bons-pharmacie/') && methode === 'POST') {
      return options.creation ? options.creation() : reponseJson(BON_CREE, 201)
    }
    if (url.endsWith('/mobile/bons-pharmacie/')) return reponseJson([BON_CREE])
    return reponseJson({ detail: 'Introuvable.' }, 404)
  })
  configurerClient({
    apiBase: '/api',
    jeton: 'J',
    fetch: fetch as typeof globalThis.fetch,
    surSessionExpiree: null,
  })
  return { fetch, appels }
}
