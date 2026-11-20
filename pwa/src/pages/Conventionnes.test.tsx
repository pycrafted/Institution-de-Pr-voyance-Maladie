import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../api'
import { reponseJson, unFournisseur } from '../test/fabriques'
import type { Conventionne } from '../types/api'
import Conventionnes from './Conventionnes'
import { preparerIonic, rendreEcran, simulerReseau } from './conventionnes/outils-test'
import { reinitialiserConventionnes } from './conventionnes/useConventionnes'

// La barre du haut est écrite dans l'écran : elle charge son solde et ses
// notifications, ce qui consommerait les réponses réseau simulées ici. Elle
// a ses propres tests (components/BarreActions.test.tsx).
vi.mock('../components/BarreActions', () => ({ default: () => null }))
// La carte Google (chargement de script, clé) n'a pas sa place sous jsdom :
// on la remplace par la liste des noms qu'elle recevrait, un par point.
vi.mock('./conventionnes/CarteStructures', async () => {
  const { nomStructure } = await import('./conventionnes/recherche')
  return {
    default: ({ structures }: { structures: { code: string }[] }) => (
      <ul aria-label="Points de la carte">
        {structures.map((s) => (
          <li key={s.code}>{nomStructure(s as Parameters<typeof nomStructure>[0])}</li>
        ))}
      </ul>
    ),
  }
})

const fetchMock = vi.fn<typeof fetch>()

const PHARMACIES = { code: '06', libelle: 'PHARMACIES' }
const CLINIQUES = { code: '08', libelle: 'CLINIQUES' }
const LABOS = { code: '28', libelle: 'LABORATOIRES D’ANALYSES' }

const structure = (surcharge: Partial<Conventionne>): Conventionne => ({
  ...unFournisseur(),
  specialite: PHARMACIES,
  position: null,
  ...surcharge,
})

const ANNUAIRE: Conventionne[] = [
  structure({
    code: 'PH001',
    libelle: 'PHARMACIE DU PLATEAU',
    adresse: 'Avenue Lamine Guèye, Dakar',
    telephone: '338210000',
  }),
  structure({
    code: 'PH002',
    libelle: "PHARMACIE DE L'AEROPORT",
    adresse: 'Route de Yoff',
    telephone: '+221 33 820 11 22',
  }),
  structure({
    code: 'CL001',
    libelle: 'CLINIQUE DU CAP',
    adresse: 'Avenue Pasteur, Plateau',
    telephone: '338480000',
    specialite: CLINIQUES,
  }),
  structure({
    code: 'LB001',
    libelle: 'BIO 24',
    adresse: null,
    telephone: null,
    specialite: LABOS,
  }),
]

/** Le menu déroulant des catégories, seul filtre de l'écran. */
/** Choisit une catégorie par son code de spécialité (TOUS : « * »). */
// Les filtres sont des puces (plus un menu déroulant) : on touche celle du code.
const choisir = (code: string) => {
  const puce = document.querySelector(`[data-puce="${code}"]`)
  if (!puce) throw new Error(`Puce ${code} absente`)
  fireEvent.click(puce)
}

beforeAll(() => preparerIonic())

let retablirReseau: (() => void) | null = null

beforeEach(() => {
  fetchMock.mockReset()
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  // La liste est mémorisée d'un affichage à l'autre : chaque test repart à zéro.
  reinitialiserConventionnes()
})

afterEach(() => {
  retablirReseau?.()
  retablirReseau = null
})

describe('Conventionnés', () => {
  it('annonce le chargement, puis un point par structure sur la carte, toutes spécialités', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    const { container } = rendreEcran(<Conventionnes />)

    // Squelettes tant que rien n'est connu (SPEC_DESIGN §6).
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()
    expect(screen.getByText('Bio 24')).toBeInTheDocument()
    // Plus de liste de cartes sous la carte : les structures sont ses points.
    expect(container.querySelector('.ipm-carte-liste')).toBeNull()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/mobile/conventionnes/')
  })

  it('commence par les filtres, la carte en fond, sans en-tête ni retour ni liste (§1)', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    const { container } = rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    // Plus d'en-tête du tout : ni bandeau sombre, ni grand titre.
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-entete')).toBeNull()
    // Un onglet : on en change, on n'en revient pas.
    expect(screen.queryByLabelText('Retour')).toBeNull()
    // Les filtres en tête : « Toutes » puis une puce par spécialité présente.
    expect(container.querySelectorAll('.conventionnes__filtres [data-puce]')).toHaveLength(4)
    // Plus de liste de cartes : les structures sont les points de la carte.
    expect(container.querySelector('.ipm-carte-liste')).toBeNull()
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-segment')).toBeNull()
  })

  it('liste les catégories présentes, les plus fournies d’abord', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    const puces = Array.from(document.querySelectorAll('.conventionnes__filtres [data-puce]'))
    // « Toutes », puis Pharmacies (2), Cliniques (1), Laboratoires (1).
    expect(puces.map((p) => p.getAttribute('data-puce'))).toEqual(['*', '06', '08', '28'])
    expect(puces[0]).toHaveTextContent('Toutes')
    // Toutes au départ : l'annuaire entier.
    expect(puces[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('filtre sur la catégorie choisie, et revient à l’annuaire entier', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    choisir('08') // Cliniques
    await waitFor(() => expect(screen.queryByText('Pharmacie du Plateau')).toBeNull())
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()

    choisir('*')
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
  })

  it('annuaire vide : un état vide illustré, sans menu de catégories', async () => {
    fetchMock.mockResolvedValue(reponseJson([]))
    const { container } = rendreEcran(<Conventionnes />)

    expect(await screen.findByText('Aucune structure conventionnée')).toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()
  })

  it('serveur injoignable : message humain et « Réessayer » qui recharge', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    rendreEcran(<Conventionnes />)

    expect(await screen.findByText('Annuaire indisponible')).toBeInTheDocument()
    expect(screen.getByText(/Vérifiez votre réseau/)).toBeInTheDocument()

    fetchMock.mockReset()
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    fireEvent.click(screen.getByText('Réessayer'))
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
  })

  it('hors ligne : l’annuaire venant du serveur, on le dit sans détour', async () => {
    retablirReseau = simulerReseau(false)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    rendreEcran(<Conventionnes />)

    expect(await screen.findByText('Annuaire indisponible hors ligne')).toBeInTheDocument()
    expect(screen.getByText(/Reconnectez-vous pour la consulter/)).toBeInTheDocument()
    expect(screen.getByText(/Hors ligne/)).toBeInTheDocument()
  })
})
