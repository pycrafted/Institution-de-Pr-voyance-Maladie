import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../api'
import { enregistrerBonsEnCache, lireBonsEnCache, viderCache } from '../offline/stockage'
import { reponseJson, unBon } from '../test/fabriques'
import type { Bon } from '../types/api'
import { chargerBons, etatBons, memoriserBon, reinitialiserBons } from './bons'

const fetchMock = vi.fn<typeof fetch>()
// Les bons répondent comme chaque test le décide ; les lettres de garantie,
// lues en même temps (api/mobile.listerBons), par la liste `lettres` ; les
// bons d'optique, par une liste vide.
const bonsMock = vi.fn<typeof fetch>()
let lettres: Bon[] = []

beforeEach(async () => {
  fetchMock.mockReset()
  bonsMock.mockReset()
  lettres = []
  fetchMock.mockImplementation((entree, init) =>
    String(entree).includes('/lettres-garantie/')
      ? Promise.resolve(reponseJson(lettres))
      : String(entree).includes('/bons-optique/')
        ? Promise.resolve(reponseJson([]))
        : bonsMock(entree, init),
  )
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  reinitialiserBons()
  await viderCache()
})

describe('liste partagée des bons', () => {
  it('charge depuis le serveur et met en cache', async () => {
    bonsMock.mockResolvedValue(reponseJson([unBon({ id: 2 }), unBon({ id: 1 })]))
    await chargerBons()
    expect(etatBons().bons?.map((b) => b.id)).toEqual([2, 1])
    expect(etatBons().depuisCache).toBe(false)
    expect(etatBons().chargement).toBe(false)
    expect((await lireBonsEnCache())?.bons).toHaveLength(2)
  })

  it('hors ligne : garde la liste du cache et signale l’erreur', async () => {
    await enregistrerBonsEnCache([unBon({ id: 5 })], '2026-09-17T08:00:00Z')
    bonsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await chargerBons()
    const etat = etatBons()
    expect(etat.bons?.map((b) => b.id)).toEqual([5])
    expect(etat.depuisCache).toBe(true)
    expect(etat.synchroniseLe).toBe('2026-09-17T08:00:00Z')
    expect(etat.erreur?.genre).toBe('reseau')
  })

  it('appels simultanés : une seule requête', async () => {
    bonsMock.mockResolvedValue(reponseJson([]))
    await Promise.all([chargerBons(), chargerBons()])
    expect(bonsMock).toHaveBeenCalledTimes(1)
  })

  it('memoriserBon ajoute en tête ou remplace', async () => {
    bonsMock.mockResolvedValue(reponseJson([unBon({ id: 1 })]))
    await chargerBons()
    memoriserBon(unBon({ id: 2 }))
    expect(etatBons().bons?.map((b) => b.id)).toEqual([2, 1])
    memoriserBon(unBon({ id: 1, statut: 'traite' }))
    expect(etatBons().bons?.find((b) => b.id === 1)?.statut).toBe('traite')
  })

  it('memoriserBon avant tout chargement ajoute le bon au cache sans l’écraser', async () => {
    await enregistrerBonsEnCache([unBon({ id: 1 }), unBon({ id: 3 })], '2026-09-01T08:00:00Z')
    memoriserBon(unBon({ id: 7 }))
    expect(etatBons().bons?.map((b) => b.id)).toEqual([7])
    await vi.waitFor(async () =>
      expect((await lireBonsEnCache())?.bons.map((b) => b.id)).toEqual([7, 1, 3]),
    )
    expect(etatBons().bons?.map((b) => b.id)).toEqual([7, 1, 3])
  })

  it('trie par date du bon, puis par saisie, même si le serveur trie par saisie', async () => {
    bonsMock.mockResolvedValue(
      reponseJson([
        // Saisi en dernier par l'IPM, mais daté de mai 2024.
        unBon({ id: 3, date: '2024-05-21', creeLe: '2026-09-18T10:00:00Z' }),
        unBon({ id: 2, date: '2025-10-18', creeLe: '2025-10-18T09:00:00Z' }),
        unBon({ id: 1, date: '2025-01-01', creeLe: '2025-01-01T09:00:00Z' }),
        unBon({ id: 4, date: '2025-10-18', creeLe: '2025-10-18T11:00:00Z' }),
      ]),
    )
    await chargerBons()
    expect(etatBons().bons?.map((b) => b.id)).toEqual([4, 2, 1, 3])
  })

  it('une synchronisation partie avant une création n’efface pas le bon créé', async () => {
    bonsMock.mockResolvedValueOnce(reponseJson([unBon({ id: 1 })]))
    await chargerBons()
    // Synchronisation lente, partie AVANT la création.
    let repondre: (r: Response) => void = () => {}
    bonsMock.mockReturnValueOnce(new Promise<Response>((ok) => (repondre = ok)))
    const lente = chargerBons()
    await vi.waitFor(() => expect(bonsMock).toHaveBeenCalledTimes(2))
    const cree = unBon({ id: 9, code: 'BPI000009', creeLe: '2026-09-18T12:00:00Z' })
    memoriserBon(cree)
    // L'assistant relance une synchronisation : c'est la même requête en vol.
    void chargerBons()
    repondre(reponseJson([unBon({ id: 1 })]))
    await lente
    expect(etatBons().bons?.map((b) => b.id)).toEqual([9, 1])
    expect((await lireBonsEnCache())?.bons.map((b) => b.id)).toContain(9)
    // Une synchronisation partie APRÈS fait foi (bon annulé côté IPM entre-temps).
    bonsMock.mockResolvedValueOnce(reponseJson([unBon({ id: 1 })]))
    await chargerBons()
    expect(etatBons().bons?.map((b) => b.id)).toEqual([1])
  })

  it('une réponse arrivée après la déconnexion est ignorée', async () => {
    let repondre: (r: Response) => void = () => {}
    bonsMock.mockReturnValue(new Promise<Response>((ok) => (repondre = ok)))
    const chargement = chargerBons()
    await vi.waitFor(() => expect(bonsMock).toHaveBeenCalled())
    reinitialiserBons()
    repondre(reponseJson([unBon()]))
    await chargement
    expect(etatBons().bons).toBeNull()
  })

  it('lit les lettres de garantie avec les bons, sans confondre deux numéros internes égaux', async () => {
    lettres = [unBon({ id: 1, genre: 'lettre-garantie', code: 'LGI000001', date: '2026-09-20' })]
    bonsMock.mockResolvedValue(
      reponseJson([unBon({ id: 1, code: 'BPI000001', date: '2026-09-19' })]),
    )
    await chargerBons()
    expect(etatBons().bons?.map((b) => b.code)).toEqual(['LGI000001', 'BPI000001'])
    // Mémoriser la lettre ne remplace pas le bon de même id.
    memoriserBon(unBon({ id: 1, genre: 'lettre-garantie', code: 'LGI000001', statut: 'traite' }))
    const bons = etatBons().bons ?? []
    expect(bons).toHaveLength(2)
    expect(bons.find((b) => b.code === 'BPI000001')?.statut).toBe('valide')
  })
})
