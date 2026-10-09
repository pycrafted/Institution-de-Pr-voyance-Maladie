import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reponseJson, unBon, unParticipant } from '../test/fabriques'
import { configurerClient, construireUrl, requete } from './client'
import { ErreurApi } from './erreurs'
import { creerBon, identifier, listerPrescripteurs, telechargerPdfBon } from './mobile'

const fetchMock = vi.fn<typeof fetch>()
const surSessionExpiree = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  surSessionExpiree.mockReset()
  configurerClient({
    apiBase: 'https://ipm.test/api/',
    jeton: 'JETON',
    surSessionExpiree,
    fetch: fetchMock,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function derniereRequete() {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? []
  return {
    url: String(url),
    init: init ?? {},
    entetes: (init?.headers ?? {}) as Record<string, string>,
  }
}

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurApi> {
  try {
    await promesse
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurApi)
    return e as ErreurApi
  }
  throw new Error('La requête aurait dû échouer.')
}

describe('construireUrl', () => {
  it('colle le chemin à apiBase sans double « / » et encode les paramètres', () => {
    expect(construireUrl('/mobile/moi/')).toBe('https://ipm.test/api/mobile/moi/')
    expect(construireUrl('/mobile/prescripteurs/', { specialite: 'A B', vide: undefined })).toBe(
      'https://ipm.test/api/mobile/prescripteurs/?specialite=A+B',
    )
  })
})

describe('requete', () => {
  it('envoie le jeton participant et renvoie le JSON', async () => {
    fetchMock.mockResolvedValue(reponseJson([unBon()]))
    const bons = await requete('/mobile/bons-pharmacie/')
    expect(bons).toEqual([unBon()])
    const { url, entetes, init } = derniereRequete()
    expect(url).toBe('https://ipm.test/api/mobile/bons-pharmacie/')
    expect(entetes.Authorization).toBe('Participant JETON')
    expect(init.credentials).toBe('omit')
  })

  it("n'envoie pas de jeton quand il n'y en a pas", async () => {
    configurerClient({ jeton: null })
    fetchMock.mockResolvedValue(reponseJson({}))
    await requete('/mobile/moi/')
    expect(derniereRequete().entetes.Authorization).toBeUndefined()
  })

  it('sérialise le corps en JSON (POST)', async () => {
    fetchMock.mockResolvedValue(reponseJson(unBon(), 201))
    const corps = {
      beneficiaire: '1204',
      pharmacie: 'PH001',
      specialite: '01',
      prescripteur: 'MG001',
      nbArticles: 3,
      dateOrdonnance: '2026-09-17',
    }
    await creerBon(corps)
    const { init, entetes } = derniereRequete()
    expect(init.method).toBe('POST')
    expect(entetes['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual(corps)
  })

  it('400 : erreur de validation avec les champs DRF', async () => {
    fetchMock.mockResolvedValue(
      reponseJson({ nbArticles: ['Au plus 8 articles.'], dateOrdonnance: 'Date invalide.' }, 400),
    )
    const erreur = await erreurDe(
      requete('/mobile/bons-pharmacie/', { methode: 'POST', corps: {} }),
    )
    expect(erreur.genre).toBe('validation')
    expect(erreur.statut).toBe(400)
    expect(erreur.champ('nbArticles')).toBe('Au plus 8 articles.')
    expect(erreur.champs.dateOrdonnance).toEqual(['Date invalide.'])
    expect(erreur.message).toBe('Au plus 8 articles.')
  })

  it('401 sur un appel authentifié : ferme la session avec le message du serveur', async () => {
    fetchMock.mockResolvedValue(
      reponseJson({ detail: 'Session expirée. Identifiez-vous à nouveau.' }, 401),
    )
    const erreur = await erreurDe(requete('/mobile/moi/'))
    expect(erreur.genre).toBe('non-autorise')
    expect(erreur.message).toBe('Session expirée. Identifiez-vous à nouveau.')
    expect(surSessionExpiree).toHaveBeenCalledTimes(1)
  })

  it("401 à l'identification : identité incorrecte, sans jeton ni déconnexion", async () => {
    fetchMock.mockResolvedValue(
      reponseJson({ detail: 'Matricule ou mot de passe incorrect.' }, 401),
    )
    const erreur = await erreurDe(identifier({ matricule: '1204', mot_de_passe: '0001' }))
    expect(erreur.genre).toBe('non-autorise')
    expect(erreur.message).toBe('Matricule ou mot de passe incorrect.')
    expect(derniereRequete().entetes.Authorization).toBeUndefined()
    expect(surSessionExpiree).not.toHaveBeenCalled()
  })

  it('403 : reprend le message du serveur (dossier inactif)', async () => {
    const detail = "Votre dossier IPM n'est pas actif. Rapprochez-vous de l'IPM."
    fetchMock.mockResolvedValue(reponseJson({ detail }, 403))
    const erreur = await erreurDe(identifier({ matricule: '1204', mot_de_passe: '0000' }))
    expect(erreur.genre).toBe('interdit')
    expect(erreur.message).toBe(detail)
  })

  it('429 : message français, pas celui (anglais) de DRF', async () => {
    fetchMock.mockResolvedValue(
      reponseJson({ detail: 'Request was throttled. Expected available in 42 seconds.' }, 429),
    )
    const erreur = await erreurDe(identifier({ matricule: '1204', mot_de_passe: '0000' }))
    expect(erreur.genre).toBe('trop-de-requetes')
    expect(erreur.message).toMatch(/Trop de tentatives/)
  })

  it.each([
    [404, 'introuvable'],
    [500, 'serveur'],
    [502, 'serveur'],
    [418, 'inconnue'],
  ] as const)('%i → %s', async (statut, genre) => {
    fetchMock.mockResolvedValue(new Response('<html>erreur</html>', { status: statut }))
    const erreur = await erreurDe(requete('/mobile/bons-pharmacie/9/'))
    expect(erreur.genre).toBe(genre)
    expect(erreur.statut).toBe(statut)
    expect(surSessionExpiree).not.toHaveBeenCalled()
  })

  it('échec réseau → erreur « reseau »', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const erreur = await erreurDe(requete('/mobile/moi/'))
    expect(erreur.genre).toBe('reseau')
    expect(erreur.statut).toBeNull()
  })

  it('délai de 15 s dépassé → erreur « delai »', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_ok, echec) => {
          init?.signal?.addEventListener('abort', () =>
            echec(new DOMException('Abandon', 'AbortError')),
          )
        }),
    )
    const promesse = erreurDe(requete('/mobile/moi/'))
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await promesse).genre).toBe('delai')
  })

  it("annulation par l'appelant → erreur « annulee »", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_ok, echec) => {
          init?.signal?.addEventListener('abort', () =>
            echec(new DOMException('Abandon', 'AbortError')),
          )
        }),
    )
    const controleur = new AbortController()
    const promesse = erreurDe(requete('/mobile/moi/', { signal: controleur.signal }))
    controleur.abort()
    expect((await promesse).genre).toBe('annulee')
  })

  it('réponse 200 illisible → erreur « inconnue »', async () => {
    fetchMock.mockResolvedValue(new Response('pas du json', { status: 200 }))
    expect((await erreurDe(requete('/mobile/moi/'))).genre).toBe('inconnue')
  })
})

describe('points d’entrée', () => {
  it('prescripteurs : la spécialité passe en paramètre', async () => {
    fetchMock.mockResolvedValue(reponseJson([]))
    await listerPrescripteurs('01')
    expect(derniereRequete().url).toBe('https://ipm.test/api/mobile/prescripteurs/?specialite=01')
  })

  it('PDF : renvoie un Blob', async () => {
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    )
    const pdf = await telechargerPdfBon('bon-pharmacie', 7)
    expect(derniereRequete().url).toBe('https://ipm.test/api/mobile/bons-pharmacie/7/pdf/')
    expect(derniereRequete().entetes.Accept).toMatch(/application\/pdf/)
    // Blob de Node (fetch) et non celui de jsdom : on vérifie le contenu, pas la classe.
    expect(pdf.type).toBe('application/pdf')
    expect(await pdf.text()).toBe('%PDF-1.4')
  })

  it("identification : corps attendu par l'API", async () => {
    fetchMock.mockResolvedValue(reponseJson({ jeton: 'J', participant: unParticipant() }))
    const reponse = await identifier({ matricule: '01-1204', mot_de_passe: '0000' })
    expect(reponse.jeton).toBe('J')
    expect(JSON.parse(String(derniereRequete().init.body))).toEqual({
      matricule: '01-1204',
      mot_de_passe: '0000',
    })
  })
})
