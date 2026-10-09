import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionEnregistree } from '../offline/stockage'
import { unMoi } from '../test/fabriques'
import { SessionProvider, type Session } from './SessionContext'
import { useSession } from './useSession'

const simulations = vi.hoisted(() => ({
  // Lecture de la session suspendue : c'est dans cette fenêtre que tombe la
  // déconnexion.
  suspendre: false,
  reprendre: null as null | (() => void),
}))

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>()
  const { unMoi: moi } = await import('../test/fabriques')
  return {
    ...reel,
    chargerConfig: () => Promise.resolve({ apiBase: '/api' }),
    lireMoi: () => Promise.resolve(moi()),
  }
})

vi.mock('../offline/stockage', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../offline/stockage')>()
  return {
    ...reel,
    lireSession: async () => {
      const valeur = await reel.lireSession()
      if (!simulations.suspendre) return valeur
      await new Promise<void>((reprendre) => (simulations.reprendre = reprendre))
      return valeur
    },
  }
})

describe('SessionProvider', () => {
  it('une déconnexion pendant le rafraîchissement du profil n’est pas annulée', async () => {
    const stockage =
      await vi.importActual<typeof import('../offline/stockage')>('../offline/stockage')
    const { participant, beneficiaires } = unMoi()
    const enregistree: SessionEnregistree = { jeton: 'J', participant, beneficiaires, depuis: '' }
    await stockage.enregistrerSession(enregistree)

    let session: Session | null = null
    function Sonde() {
      session = useSession()
      return null
    }
    render(
      <SessionProvider>
        <Sonde />
      </SessionProvider>,
    )
    await waitFor(() => expect(session?.statut).toBe('identifie'))

    // Rafraîchissement du profil : suspendu pendant la relecture de la session.
    simulations.suspendre = true
    let rafraichissement: Promise<void> = Promise.resolve()
    act(() => {
      rafraichissement = session!.rafraichir()
    })
    await waitFor(() => expect(simulations.reprendre).not.toBeNull())

    await act(() => session!.deconnecter())
    simulations.suspendre = false
    simulations.reprendre?.()
    await act(() => rafraichissement)

    expect(await stockage.lireSession()).toBeUndefined()
    expect(session!.statut).toBe('anonyme')
  })
})
