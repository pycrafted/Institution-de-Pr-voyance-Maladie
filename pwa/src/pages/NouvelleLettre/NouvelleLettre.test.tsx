import { fireEvent, screen, waitFor } from '@testing-library/react'
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
  { code: '00', libelle: 'VISITE', courante: true },
  { code: '01', libelle: 'ANALYSES BIO-MEDICALES', courante: true },
]
// Ce que le serveur rend pour la spécialité 08 CLINIQUES : la nature qu'elle
// donne vraiment devant, le reste derrière (cf. natures_courantes.py).
const NATURES_CLINIQUES = [
  { code: '00', libelle: 'VISITE', courante: true },
  { code: '01', libelle: 'ANALYSES BIO-MEDICALES', courante: false },
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
    if (url.includes('/mobile/natures-prestation/?specialite=08'))
      return reponseJson(NATURES_CLINIQUES)
    if (url.includes('/mobile/natures-prestation/')) return reponseJson(NATURES)
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
  await waitFor(() => expect(champ('Spécialité').disabled).toBe(false))
  choisir('Spécialité', '08')
  await waitFor(() => expect(champ(/^Prestataire/).disabled).toBe(false))
  choisir(/^Prestataire/, 'CL008')
  choisir(/^Nature prestation/, '00')
  choisir(/^Spécialité du prescripteur/, '00')
  await waitFor(() => expect(champ(/^Prescripteur/).disabled).toBe(false))
  choisir(/^Prescripteur/, 'MG001')
  fireEvent.change(champ(/^Date prescription/), { target: { value: '2026-09-15' } })
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
  it('présente les mêmes sections que l’écran web, sans titre ni participant', () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    const titres = Array.from(container.querySelectorAll('.ipm-formulaire__titre')).map(
      (t) => t.textContent,
    )
    expect(titres).toEqual(['Bénéficiaire', 'Prestataire', 'Prescripteur', 'Actes'])
    expect(screen.queryByText('Nouvelle lettre')).toBeNull()
    expect(container.querySelector('.ipm-formulaire__lecture')).toBeNull()
  })

  it('n’exige que le bénéficiaire pour enregistrer', async () => {
    fauxServeur()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(bouton('Enregistrer').disabled).toBe(true)

    choisir(/^Type/, 'CONJOINT')
    choisir(/^Bénéficiaire/, '1204-01')
    await waitFor(() => expect(bouton('Enregistrer').disabled).toBe(false))
  })

  it('le prestataire et le prescripteur attendent leur spécialité', async () => {
    fauxServeur()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(champ(/^Prestataire/).disabled).toBe(true)
    expect(champ(/^Prescripteur/).disabled).toBe(true)

    await waitFor(() => expect(champ('Spécialité').disabled).toBe(false))
    choisir('Spécialité', '08')
    await waitFor(() => expect(champ(/^Prestataire/).disabled).toBe(false))
    // Celui du prescripteur reste fermé : c'est l'autre spécialité.
    expect(champ(/^Prescripteur/).disabled).toBe(true)
  })

  it('range les natures d’après la spécialité du prestataire', async () => {
    fauxServeur()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    // Sans spécialité, pas de groupes : rien ne permet de mettre une nature
    // en avant, la liste reste celle d'avant.
    await waitFor(() => expect(champ(/^Nature prestation/).options.length).toBe(3))
    expect(champ(/^Nature prestation/).querySelectorAll('optgroup')).toHaveLength(0)

    await waitFor(() => expect(champ('Spécialité').disabled).toBe(false))
    choisir('Spécialité', '08')

    // Le serveur a rangé : la nature des cliniques d'abord, sous le nom de la
    // spécialité ; les autres suivent, elles ne disparaissent pas.
    await waitFor(() =>
      expect(
        Array.from(champ(/^Nature prestation/).querySelectorAll('optgroup')).map((g) =>
          g.getAttribute('label'),
        ),
      ).toEqual(['Cliniques', 'Autres natures']),
    )
    expect(
      Array.from(champ(/^Nature prestation/).options).map((o) => o.value),
    ).toEqual(['', '00', '01'])
  })

  it('envoie le formulaire rempli, puis ouvre la lettre créée', async () => {
    const appels = fauxServeur()
    const onCree = vi.fn()
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={onCree} />)
    await remplirTout()

    fireEvent.click(bouton('Enregistrer'))
    expect(await screen.findByText('Lettre générée')).toBeInTheDocument()
    const creation = appels.find((a) => a.methode === 'POST')
    expect(creation?.url).toBe('/api/mobile/lettres-garantie/')
    expect(creation?.corps).toMatchObject({
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

  it('affiche le refus du serveur sous le champ concerné', async () => {
    fauxServeur(() =>
      reponseJson({ prestataire: ['Ce prestataire n’est pas de la spécialité choisie.'] }, 400),
    )
    rendreAvecSession(<NouvelleLettre onFermer={vi.fn()} onCree={vi.fn()} />)
    await remplirTout()
    fireEvent.click(bouton('Enregistrer'))
    expect(
      await screen.findByText('Ce prestataire n’est pas de la spécialité choisie.'),
    ).toBeInTheDocument()
  })
})
