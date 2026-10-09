import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { etatBons, reinitialiserBons } from '../../data/bons'
import { viderCache } from '../../offline/stockage'
import { reponseJson, unBon, unFournisseur, uneSpecialite } from '../../test/fabriques'
import type { Bon } from '../../types/api'
import { preparerIonic, rendreAvecSession } from '../NouveauBon/outils-test'
import NouvelleLettre from './index'

const surcouches = vi.hoisted(() => ({ presenterToast: vi.fn() }))

// Mêmes doubles que les tests de l'assistant du bon : la feuille de choix
// et les roues de date d'Ionic ne se présentent pas sous jsdom.
vi.mock('../../components/FeuilleChoix', () => ({
  default: ({
    ouverte,
    onFermer,
    titre,
    choix,
  }: {
    ouverte: boolean
    onFermer: () => void
    titre: string
    choix: { libelle: string; onClick?: () => void }[]
  }) =>
    ouverte ? (
      <div role="dialog" aria-label={titre}>
        {choix.map((c) => (
          <button
            key={c.libelle}
            type="button"
            onClick={() => {
              onFermer()
              c.onClick?.()
            }}
          >
            {c.libelle}
          </button>
        ))}
      </div>
    ) : null,
}))

vi.mock('@ionic/react', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@ionic/react')>()
  const { createElement } = await import('react')
  return {
    ...reel,
    useIonToast: () => [surcouches.presenterToast, vi.fn()],
    IonDatetime: (props: {
      value?: string
      onIonChange?: (e: { detail: { value: string } }) => void
    }) =>
      createElement('input', {
        'aria-label': 'Roues de la date',
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) =>
          props.onIonChange?.({ detail: { value: e.target.value } }),
      }),
  }
})

vi.mock('../../hooks/haptique', () => ({
  haptique: {
    leger: vi.fn(),
    selection: vi.fn(),
    succes: vi.fn(),
    erreur: vi.fn(),
    avertissement: vi.fn(),
  },
}))

const SPECIALITES = [
  uneSpecialite({ code: '08', libelle: 'CLINIQUES', nombre: 1 }),
  uneSpecialite({ code: '00', libelle: 'GENERALISTES', nombre: 1 }),
]
const CLINIQUE = unFournisseur({
  code: 'CL008',
  libelle: 'CLINIQUE DE LA MADELEINE',
  adresse: 'Dakar',
})
const DOCTEUR = unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN' })
const NATURES = [
  { code: '00', libelle: 'VISITE' },
  { code: '01', libelle: 'ANALYSES BIO-MEDICALES' },
]
const LETTRE_CREEE: Bon = unBon({
  genre: 'lettre-garantie',
  id: 7,
  code: 'LGI000075',
  pharmacie: null,
  prestataire: CLINIQUE,
  valableJusquAu: '2026-10-18',
})

interface Appel {
  methode: string
  url: string
  corps: unknown
}

function fauxServeur(creation: () => Response = () => reponseJson(LETTRE_CREEE, 201)) {
  const appels: Appel[] = []
  const fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree)
    const methode = init?.method ?? 'GET'
    appels.push({
      methode,
      url,
      corps: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    })
    if (url.endsWith('/mobile/specialites/')) return reponseJson(SPECIALITES)
    if (url.endsWith('/mobile/natures-prestation/')) return reponseJson(NATURES)
    if (url.includes('/mobile/prescripteurs/?specialite=08')) return reponseJson([CLINIQUE])
    if (url.includes('/mobile/prescripteurs/')) return reponseJson([DOCTEUR])
    if (url.endsWith('/mobile/lettres-garantie/') && methode === 'POST') return creation()
    if (url.endsWith('/mobile/lettres-garantie/')) return reponseJson([LETTRE_CREEE])
    if (url.endsWith('/mobile/bons-pharmacie/')) return reponseJson([])
    return reponseJson({ detail: 'Introuvable.' }, 404)
  })
  configurerClient({
    apiBase: '/api',
    jeton: 'J',
    fetch: fetch as typeof globalThis.fetch,
    surSessionExpiree: null,
  })
  return appels
}

function toucher(texte: string | HTMLElement) {
  const element = typeof texte === 'string' ? screen.getByText(texte) : texte
  const cible = element.closest('button')
  if (!cible) throw new Error(`Rien à toucher pour « ${element.textContent ?? ''} »`)
  fireEvent.click(cible)
}

async function allerAuRecap() {
  toucher('Awa DIOP')
  toucher(await screen.findByText('Cliniques'))
  toucher(await screen.findByText('Clinique de la Madeleine'))
  toucher(await screen.findByText('Visite'))
  toucher(await screen.findByText('Generalistes'))
  toucher(await screen.findByText('Cabinet Medical Fann'))
  await screen.findByText('La prescription')
  fireEvent.change(screen.getByLabelText('Roues de la date'), { target: { value: '2026-09-15' } })
  toucher('Continuer')
  await screen.findByText('Vérifiez avant de générer')
}

beforeAll(() => preparerIonic())

beforeEach(async () => {
  surcouches.presenterToast.mockReset()
  reinitialiserBons()
  await viderCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 18, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Nouvelle lettre de garantie', () => {
  it('commence par la famille, en six étapes', () => {
    fauxServeur()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(screen.getByText('Pour qui est la prise en charge ?')).toBeInTheDocument()
    expect(screen.getByText('Étape 1 sur 6 · Bénéficiaire')).toBeInTheDocument()
  })

  it('génère la lettre de bout en bout, puis ouvre son détail après l’animation', async () => {
    const appels = fauxServeur()
    const onCree = vi.fn()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={onCree} />)

    await allerAuRecap()
    const recap = screen.getByLabelText('Récapitulatif de la lettre')
    expect(within(recap).getByText('Awa DIOP')).toBeInTheDocument()
    expect(within(recap).getByText('Clinique de la Madeleine')).toBeInTheDocument()
    expect(within(recap).getByText('Visite')).toBeInTheDocument()
    expect(within(recap).getByText('Cabinet Medical Fann')).toBeInTheDocument()
    expect(within(recap).getByText('mardi 15 septembre 2026')).toBeInTheDocument()

    toucher('Générer la lettre')
    expect(await screen.findByText('Lettre générée')).toBeInTheDocument()
    expect(screen.getByText('N° LGI000075')).toBeInTheDocument()

    const creation = appels.find((a) => a.methode === 'POST')
    expect(creation?.url).toBe('/api/mobile/lettres-garantie/')
    expect(creation?.corps).toEqual({
      beneficiaire: '1204-01',
      specialitePrestataire: '08',
      prestataire: 'CL008',
      naturePrestation: '00',
      specialite: '00',
      prescripteur: 'MG001',
      datePrescription: '2026-09-15',
    })
    expect(etatBons().bons?.[0]?.code).toBe('LGI000075')
    await waitFor(() => expect(onCree).toHaveBeenCalledWith(LETTRE_CREEE), { timeout: 3000 })
  })

  it('refus du serveur : ramène à l’étape du champ, avec son message', async () => {
    fauxServeur(() =>
      reponseJson({ prestataire: ['Ce prestataire n’est pas de la spécialité choisie.'] }, 400),
    )
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()
    toucher('Générer la lettre')
    expect(
      await screen.findByText('Ce prestataire n’est pas de la spécialité choisie.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 6 · Prestataire')).toBeInTheDocument()
  })
})
