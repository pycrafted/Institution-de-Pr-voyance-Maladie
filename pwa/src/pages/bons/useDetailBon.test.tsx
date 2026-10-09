import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { reinitialiserBons } from '../../data/bons'
import {
  enregistrerBonsEnCache,
  enregistrerPdfEnCache,
  lirePdfEnCache,
  viderCache,
} from '../../offline/stockage'
import { reponseJson, unBon, unFournisseur } from '../../test/fabriques'
import { empreinteImpression, lireIdentifiant, useDetailBon, usePdfBon } from './useDetailBon'

const fetchMock = vi.fn<typeof fetch>()

function reponsePdf(contenu = '%PDF-1.7 bon'): Response {
  // Corps en texte : le Blob de jsdom n'est pas reconnu par le Response de Node.
  return new Response(contenu, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  })
}

beforeEach(async () => {
  fetchMock.mockReset()
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  reinitialiserBons()
  await viderCache()
})

describe('lireIdentifiant', () => {
  it('accepte un entier positif seulement', () => {
    expect(lireIdentifiant('12')).toBe(12)
    expect(lireIdentifiant('0')).toBeNull()
    expect(lireIdentifiant('12abc')).toBeNull()
    expect(lireIdentifiant(undefined)).toBeNull()
  })
})

describe('empreinteImpression', () => {
  it('change si ce qui est imprimé change, pas pour le statut', () => {
    const bon = unBon()
    expect(empreinteImpression({ ...bon, statut: 'traite' })).toBe(empreinteImpression(bon))
    expect(empreinteImpression({ ...bon, pharmacie: unFournisseur({ code: 'PH999' }) })).not.toBe(
      empreinteImpression(bon),
    )
    expect(empreinteImpression({ ...bon, nbArticles: 5 })).not.toBe(empreinteImpression(bon))
  })
})

describe('useDetailBon', () => {
  it('montre le bon du cache, puis la version du serveur', async () => {
    await enregistrerBonsEnCache([unBon({ id: 4, statut: 'valide' })])
    fetchMock.mockResolvedValue(reponseJson(unBon({ id: 4, statut: 'traite' })))

    const { result } = renderHook(() => useDetailBon('bon-pharmacie', 4))
    await waitFor(() => expect(result.current.bon?.statut).toBe('traite'))
    expect(result.current.chargement).toBe(false)
    expect(result.current.introuvable).toBe(false)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/mobile/bons-pharmacie/4/')
  })

  it('404 : introuvable', async () => {
    fetchMock.mockResolvedValue(reponseJson({ detail: 'Pas trouvé.' }, 404))
    const { result } = renderHook(() => useDetailBon('bon-pharmacie', 99))
    await waitFor(() => expect(result.current.introuvable).toBe(true))
    expect(result.current.bon).toBeUndefined()
  })

  it('hors ligne sans cache : erreur réseau', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useDetailBon('bon-pharmacie', 5))
    await waitFor(() => expect(result.current.erreur?.genre).toBe('reseau'))
    expect(result.current.bon).toBeUndefined()
  })

  it('identifiant illisible : introuvable sans appel', () => {
    const { result } = renderHook(() => useDetailBon('bon-pharmacie', null))
    expect(result.current.introuvable).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('usePdfBon', () => {
  it('télécharge le PDF absent du cache, puis le met en cache', async () => {
    fetchMock.mockResolvedValue(reponsePdf())
    const { result } = renderHook(() => usePdfBon('bon-pharmacie', 8))
    await waitFor(() => expect(result.current.pdf).not.toBeNull())
    expect(result.current.chargement).toBe(false)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/mobile/bons-pharmacie/8/pdf/')
    await waitFor(async () => expect(await lirePdfEnCache('bon-pharmacie', 8)).toBeDefined())
  })

  it('relit le PDF du cache sans réseau', async () => {
    await enregistrerPdfEnCache(
      'bon-pharmacie',
      9,
      new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    )
    const { result } = renderHook(() => usePdfBon('bon-pharmacie', 9))
    await waitFor(() => expect(result.current.pdf).not.toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.erreur).toBeNull()
  })

  it('bon modifié depuis la mise en cache (autre visite) : retéléchargé et réenregistré', async () => {
    await enregistrerPdfEnCache(
      'bon-pharmacie',
      12,
      new Blob(['%PDF ancien'], { type: 'application/pdf' }),
      {
        empreinte: 'E1',
      },
    )
    fetchMock.mockResolvedValue(reponsePdf('%PDF nouveau'))
    const { result } = renderHook(() => usePdfBon('bon-pharmacie', 12, 'E2'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(async () =>
      expect((await lirePdfEnCache('bon-pharmacie', 12))?.empreinte).toBe('E2'),
    )
    expect(await result.current.pdf?.text()).toBe('%PDF nouveau')
  })

  it('même empreinte : le cache suffit', async () => {
    await enregistrerPdfEnCache('bon-pharmacie', 13, new Blob(['%PDF']), { empreinte: 'E1' })
    const { result } = renderHook(() => usePdfBon('bon-pharmacie', 13, 'E1'))
    await waitFor(() => expect(result.current.pdf).not.toBeNull())
    await new Promise((fin) => setTimeout(fin, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('téléchargé avant que le bon soit connu : pas de second téléchargement', async () => {
    fetchMock.mockResolvedValue(reponsePdf())
    const { result, rerender } = renderHook(({ e }) => usePdfBon('bon-pharmacie', 14, e), {
      initialProps: { e: null as string | null },
    })
    await waitFor(() => expect(result.current.pdf).not.toBeNull())
    rerender({ e: 'E1' })
    await waitFor(async () =>
      expect((await lirePdfEnCache('bon-pharmacie', 14))?.empreinte).toBe('E1'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('démonté (déconnexion) pendant le téléchargement : rien n’est mis en cache', async () => {
    let repondre: (reponse: Response) => void = () => {}
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((resoudre, rejeter) => {
          repondre = resoudre
          init?.signal?.addEventListener('abort', () =>
            rejeter(new DOMException('Annulé', 'AbortError')),
          )
        }),
    )
    const { unmount } = renderHook(() => usePdfBon('bon-pharmacie', 15, 'E1'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    unmount()
    repondre(reponsePdf())
    await new Promise((fin) => setTimeout(fin, 20))
    expect(await lirePdfEnCache('bon-pharmacie', 15)).toBeUndefined()
  })

  it('échec : erreur montrable, puis nouvel essai', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => usePdfBon('bon-pharmacie', 10))
    await waitFor(() => expect(result.current.erreur?.genre).toBe('reseau'))
    expect(result.current.pdf).toBeNull()

    fetchMock.mockResolvedValueOnce(reponsePdf())
    await act(() => result.current.recharger())
    await waitFor(() => expect(result.current.pdf).not.toBeNull())
    expect(result.current.erreur).toBeNull()
  })
})
