import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { forwardRef } from 'react'

import { configurerClient } from '../api'
import { reponseJson, unFournisseur } from '../test/fabriques'
import type { Conventionne } from '../types/api'
import { preparerIonic, rendreEcran } from './conventionnes/outils-test'
import { reinitialiserConventionnes } from './conventionnes/useConventionnes'
import Itineraire, { type ItineraireProps } from './Itineraire'

// Leaflet ne se dessine pas sous jsdom : la carte est remplacée par un témoin
// qui dit ce qu'on lui a confié. Le vrai composant est éprouvé dans le
// navigateur (tests de bout en bout).
vi.mock('./itineraire/Carte', () => ({
  default: forwardRef(function CarteSimulee(
    props: { destination: unknown; position: unknown; trace: unknown },
    _ref,
  ) {
    return (
      <div
        data-testid="carte"
        data-destination={JSON.stringify(props.destination)}
        data-position={JSON.stringify(props.position)}
        data-trace={props.trace ? 'oui' : 'non'}
      />
    )
  }),
}))

const fetchMock = vi.fn<typeof fetch>()
const globalFetch = globalThis.fetch

const MADELEINE: Conventionne = {
  ...unFournisseur(),
  code: 'CL008',
  libelle: 'CLINIQUE DE LA MADELEINE',
  adresse: '18 Avenue des Diambars - Dakar',
  telephone: '338465912',
  specialite: { code: '08', libelle: 'CLINIQUES' },
  position: { latitude: 14.6597309, longitude: -17.4383376 },
}
const CASAHOUS: Conventionne = {
  ...MADELEINE,
  code: 'CL009',
  libelle: 'CLINIQUE CASAHOUS',
  adresse: 'Sacre Coeur 3 - Dakar',
  position: null,
}

const OSRM = {
  code: 'Ok',
  routes: [
    {
      distance: 4210,
      duration: 612,
      geometry: {
        coordinates: [
          [-17.4441, 14.6937],
          [-17.4383, 14.6597],
        ],
      },
    },
  ],
}

/** Simule la géolocalisation du téléphone. */
function localiser(reponse: 'ok' | 'refus') {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (succes: PositionCallback, echec: PositionErrorCallback) => {
        if (reponse === 'ok') {
          succes({
            coords: { latitude: 14.6937, longitude: -17.4441, accuracy: 25 },
          } as GeolocationPosition)
        } else {
          echec({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError)
        }
        return 1
      },
      clearWatch: vi.fn(),
    },
  })
}

function afficher(code: string) {
  const props = {
    match: {
      params: { code },
      isExact: true,
      path: '/conventionnes/:code',
      url: `/conventionnes/${code}`,
    },
  } as unknown as ItineraireProps
  return rendreEcran(<Itineraire {...props} />)
}

beforeAll(() => preparerIonic())

beforeEach(() => {
  fetchMock.mockReset()
  // L'annuaire vient du client de l'API ; l'itinéraire, d'OSRM par fetch.
  fetchMock.mockImplementation(async (url) => {
    const adresse = String(url)
    if (adresse.includes('/mobile/conventionnes/')) return reponseJson([MADELEINE, CASAHOUS])
    if (adresse.includes('router.project-osrm.org')) return reponseJson(OSRM)
    throw new Error(`requête inattendue : ${adresse}`)
  })
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  globalThis.fetch = fetchMock
  reinitialiserConventionnes()
})

afterEach(() => {
  globalThis.fetch = globalFetch
  Reflect.deleteProperty(navigator, 'geolocation')
  Reflect.deleteProperty(window, 'isSecureContext')
  document.body.classList.remove('ipm-sans-onglets')
})

describe('Itinéraire', () => {
  it('trace le trajet depuis la position de l’employé, avec temps et distance', async () => {
    localiser('ok')
    afficher('CL008')

    expect(await screen.findByText('Clinique de la Madeleine')).toBeInTheDocument()
    expect(await screen.findByText('10 min')).toBeInTheDocument()
    expect(screen.getByText('4,2 km')).toBeInTheDocument()
    expect(screen.getByText(/à pied/)).toBeInTheDocument()

    const carte = await screen.findByTestId('carte')
    expect(JSON.parse(carte.dataset.destination ?? 'null')).toEqual(MADELEINE.position)
    expect(JSON.parse(carte.dataset.position ?? 'null')).toEqual({
      latitude: 14.6937,
      longitude: -17.4441,
    })
    await waitFor(() => expect(carte.dataset.trace).toBe('oui'))
    // L'itinéraire est demandé de la position de l'employé à celle de la structure.
    const appelOsrm = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes('osrm'))
    expect(appelOsrm).toContain('-17.444100,14.693700;-17.438338,14.659731')
  })

  it('propose le guidage externe et l’appel', async () => {
    localiser('ok')
    afficher('CL008')
    await screen.findByText('Clinique de la Madeleine')

    expect(screen.getByText(/^Guidage dans/)).toBeInTheDocument()
    expect(screen.getByLabelText('Appeler Clinique de la Madeleine')).toHaveAttribute(
      'href',
      'tel:338465912',
    )
    expect(screen.getByLabelText('Retour')).toBeInTheDocument()
    expect(screen.getByLabelText('Recentrer la carte')).toBeInTheDocument()
  })

  it('efface la barre d’onglets tant que la carte est ouverte', async () => {
    localiser('ok')
    const { unmount } = afficher('CL008')
    await screen.findByText('Clinique de la Madeleine')
    unmount()
    expect(document.body.classList.contains('ipm-sans-onglets')).toBe(false)
  })

  it('localisation refusée : on dit comment l’autoriser, la structure reste sur la carte', async () => {
    localiser('refus')
    afficher('CL008')

    expect(await screen.findByText(/Autorisez la localisation/)).toBeInTheDocument()
    const carte = await screen.findByTestId('carte')
    expect(JSON.parse(carte.dataset.destination ?? 'null')).toEqual(MADELEINE.position)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('osrm'))).toBe(false)
  })

  it('page non sécurisée (HTTP) : on l’explique au lieu d’attendre en vain', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    afficher('CL008')

    expect(await screen.findByText(/version de test/)).toBeInTheDocument()
    // Le guidage externe reste le moyen d'y aller.
    expect(screen.getByText(/^Guidage dans/)).toBeInTheDocument()
  })

  it('structure pas encore localisée par l’IPM : le guidage la cherchera par son adresse', async () => {
    localiser('ok')
    afficher('CL009')

    expect(await screen.findByText(/pas encore placé cette structure/)).toBeInTheDocument()
    expect(screen.getByText(/^Guidage dans/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('osrm'))).toBe(false)
  })

  it('code inconnu : structure introuvable, et retour à l’annuaire', async () => {
    localiser('ok')
    afficher('XX999')

    expect(await screen.findByText('Structure introuvable')).toBeInTheDocument()
    expect(screen.getByText('Retour à l’annuaire')).toBeInTheDocument()
  })
})
