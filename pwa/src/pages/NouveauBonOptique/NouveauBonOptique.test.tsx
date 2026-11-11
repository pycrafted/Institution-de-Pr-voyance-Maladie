import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { etatBons, reinitialiserBons } from '../../data/bons'
import { viderCache } from '../../offline/stockage'
import { reponseJson, unBon, unFournisseur, uneSpecialite } from '../../test/fabriques'
import type { Bon } from '../../types/api'
import { preparerIonic, rendreAvecSession } from '../NouveauBon/outils-test'
import { avertissementRenouvellement, deuxAnsApres } from './assistant'
import NouveauBonOptique from './index'

const surcouches = vi.hoisted(() => ({ presenterToast: vi.fn() }))

// Mêmes doubles que les tests de la lettre : la feuille de choix d'Ionic ne
// se présente pas sous jsdom.
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
  return { ...reel, useIonToast: () => [surcouches.presenterToast, vi.fn()] }
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

const SPECIALITES = [uneSpecialite({ code: '00', libelle: 'GENERALISTES', nombre: 1 })]
const DOCTEUR = unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN' })
const OPTICIEN = unFournisseur({ code: 'OP001', libelle: 'OPTIQUE PONTY', adresse: 'Dakar' })
const ARTICLES = [
  { code: 'ACT0086', libelle: 'Montures' },
  { code: 'ACT0087', libelle: 'Verres' },
]
const BON_CREE: Bon = unBon({
  genre: 'bon-optique',
  id: 9,
  code: 'BCI000009',
  pharmacie: null,
  prestataire: OPTICIEN,
  articles: [{ code: 'ACT0086', libelle: 'Montures', quantite: 1 }],
  valableJusquAu: '2026-10-18',
})

interface Appel {
  methode: string
  url: string
  corps: unknown
}

function fauxServeur(creation: () => Response = () => reponseJson(BON_CREE, 201)) {
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
    if (url.includes('/mobile/prescripteurs/')) return reponseJson([DOCTEUR])
    if (url.endsWith('/mobile/opticiens/')) return reponseJson([OPTICIEN])
    if (url.endsWith('/mobile/articles-optique/')) return reponseJson(ARTICLES)
    if (url.endsWith('/mobile/bons-optique/') && methode === 'POST') return creation()
    if (url.endsWith('/mobile/bons-optique/')) return reponseJson([BON_CREE])
    if (url.endsWith('/mobile/bons-pharmacie/')) return reponseJson([])
    if (url.endsWith('/mobile/lettres-garantie/')) return reponseJson([])
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

function bouton(nom: string | RegExp): HTMLButtonElement {
  const element = screen.getByText(nom).closest('button, ion-button')
  if (!(element instanceof HTMLElement)) throw new Error(`Bouton « ${String(nom)} » absent`)
  return element as HTMLButtonElement
}

/** Un champ du formulaire, par son libellé. */
const champ = (libelle: string | RegExp) => screen.getByLabelText(libelle) as HTMLSelectElement
const choisir = (libelle: string | RegExp, valeur: string) =>
  fireEvent.change(champ(libelle), { target: { value: valeur } })

/** Remplit le formulaire en entier. */
async function remplirTout() {
  choisir(/^Type/, 'CONJOINT')
  choisir(/^Bénéficiaire/, '1204-01')
  await waitFor(() => expect(champ(/^Spécialité/).disabled).toBe(false))
  choisir(/^Spécialité/, '00')
  await waitFor(() => expect(champ(/^Prescripteur/).disabled).toBe(false))
  choisir(/^Prescripteur/, 'MG001')
  await waitFor(() => expect(champ(/^Prestataire/).disabled).toBe(false))
  choisir(/^Prestataire/, 'OP001')
  fireEvent.change(champ(/^Date prescription/), { target: { value: '2026-09-15' } })
  fireEvent.click(await screen.findByLabelText('Montures'))
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

describe('Nouveau bon d’optique', () => {
  it('présente les mêmes sections que l’écran web, sans titre ni participant', () => {
    fauxServeur()
    const { container } = rendreAvecSession(
      <NouveauBonOptique onFermer={vi.fn()} onCree={vi.fn()} />,
    )
    const titres = Array.from(container.querySelectorAll('.ipm-formulaire__titre')).map(
      (t) => t.textContent,
    )
    expect(titres).toEqual(['Bénéficiaire', 'Prescripteur', 'Fournisseur', 'Articles'])
    expect(screen.queryByText('Nouveau bon')).toBeNull()
    expect(screen.queryByText(/Remboursement intégral/)).toBeNull()
  })

  it('n’exige que le bénéficiaire pour enregistrer', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBonOptique onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(bouton('Enregistrer').disabled).toBe(true)

    choisir(/^Type/, 'CONJOINT')
    choisir(/^Bénéficiaire/, '1204-01')
    await waitFor(() => expect(bouton('Enregistrer').disabled).toBe(false))
  })

  it('propose les opticiens et les articles de la nomenclature', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBonOptique onFermer={vi.fn()} onCree={vi.fn()} />)
    await waitFor(() => expect(champ(/^Prestataire/).disabled).toBe(false))
    expect(Array.from(champ(/^Prestataire/).options).map((o) => o.value)).toEqual(['', 'OP001'])
    expect(await screen.findByLabelText('Montures')).toBeInTheDocument()
    expect(screen.getByLabelText('Verres')).toBeInTheDocument()
    // Le prescripteur attend sa spécialité.
    expect(champ(/^Prescripteur/).disabled).toBe(true)
  })

  it('coche et décoche un article', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBonOptique onFermer={vi.fn()} onCree={vi.fn()} />)
    const montures = (await screen.findByLabelText('Montures')) as HTMLInputElement
    fireEvent.click(montures)
    expect(montures.checked).toBe(true)
    fireEvent.click(montures)
    expect(montures.checked).toBe(false)
  })

  it('envoie le formulaire rempli, puis ouvre le bon créé', async () => {
    const appels = fauxServeur()
    const onCree = vi.fn()
    rendreAvecSession(<NouveauBonOptique onFermer={vi.fn()} onCree={onCree} />)
    await remplirTout()

    fireEvent.click(bouton('Enregistrer'))
    expect(await screen.findByText('Bon généré')).toBeInTheDocument()
    const creation = appels.find((a) => a.methode === 'POST')
    expect(creation?.url).toBe('/api/mobile/bons-optique/')
    expect(creation?.corps).toEqual({
      beneficiaire: '1204-01',
      opticien: 'OP001',
      specialite: '00',
      prescripteur: 'MG001',
      articles: [{ code: 'ACT0086', quantite: 1 }],
      datePrescription: '2026-09-15',
    })
    expect(etatBons().bons?.[0]?.code).toBe('BCI000009')
    await waitFor(() => expect(onCree).toHaveBeenCalledWith(BON_CREE), { timeout: 3000 })
  })

  it('affiche le refus du serveur sous le champ concerné', async () => {
    fauxServeur(() => reponseJson({ opticien: ['Opticien inconnu ou non conventionné.'] }, 400))
    rendreAvecSession(<NouveauBonOptique onFermer={vi.fn()} onCree={vi.fn()} />)
    await remplirTout()
    fireEvent.click(bouton('Enregistrer'))
    expect(await screen.findByText('Opticien inconnu ou non conventionné.')).toBeInTheDocument()
  })
})

describe('Renouvellement du bon d’optique', () => {
  const saisie = (matricule: string | null) => ({
    beneficiaire: matricule ? ({ matricule } as never) : null,
    opticien: null,
    specialite: null,
    prescripteur: null,
    articles: [],
    datePrescription: '2026-09-18',
  })
  const ancien = (date: string, statut: Bon['statut'] = 'valide') =>
    unBon({
      genre: 'bon-optique',
      code: 'BCI000001',
      date,
      statut,
      beneficiaire: { matricule: '1204-01', nomComplet: 'Awa', type: null },
    })

  it('deux ans jour pour jour, un 29 février tombant le 1er mars', () => {
    expect(deuxAnsApres('2024-09-18')).toBe('2026-09-18')
    expect(deuxAnsApres('2024-02-29')).toBe('2026-03-01')
  })

  it('avertit quand le bénéficiaire a eu un bon depuis moins de deux ans', () => {
    const message = avertissementRenouvellement(
      [ancien('2025-03-24')],
      saisie('1204-01'),
      '2026-09-18',
    )
    expect(message).toContain('validation de l’IPM')
    expect(message).toContain('24/03/2027')
  })

  it('se tait au-delà de deux ans, pour un autre bénéficiaire, ou un bon annulé', () => {
    expect(
      avertissementRenouvellement([ancien('2024-09-01')], saisie('1204-01'), '2026-09-18'),
    ).toBeNull()
    expect(
      avertissementRenouvellement([ancien('2025-03-24')], saisie('1204'), '2026-09-18'),
    ).toBeNull()
    expect(
      avertissementRenouvellement(
        [ancien('2025-03-24', 'annule')],
        saisie('1204-01'),
        '2026-09-18',
      ),
    ).toBeNull()
  })
})
