import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../api'
import { reponseJson, unFournisseur } from '../test/fabriques'
import type { Conventionne } from '../types/api'
import Conventionnes from './Conventionnes'
import { preparerIonic, rechercher, rendreEcran, simulerReseau } from './conventionnes/outils-test'
import { reinitialiserConventionnes } from './conventionnes/useConventionnes'

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

/** La puce de filtre d'une spécialité (rôle « tab » de PucesFiltre). */
const puce = (nom: RegExp) => screen.getByRole('tab', { name: nom })

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
  it('annonce le chargement, puis une carte par structure, toutes spécialités', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    const { container } = rendreEcran(<Conventionnes />)

    // Squelettes tant que rien n'est connu (SPEC_DESIGN §6).
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()
    expect(screen.getByText('Bio 24')).toBeInTheDocument()
    // La spécialité est écrite sur chaque carte (et sur sa puce de filtre).
    const specialites = Array.from(container.querySelectorAll('.conventionnes__specialite')).map(
      (s) => s.textContent,
    )
    expect(specialites).toEqual([
      'Pharmacies',
      'Pharmacies',
      'Cliniques',
      'Laboratoires d’analyses',
    ])
    expect(screen.getByText('4 structures')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/mobile/conventionnes/')
  })

  it('s’intitule « Conventionnés », en bandeau compact, sans retour ni filets (§1)', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    const { container } = rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    expect(container.querySelector('.ipm-bandeau')).toHaveClass('ipm-bandeau--compact')
    expect(container.querySelector('.ipm-bandeau__titre')).toHaveTextContent('Conventionnés')
    // Un onglet : on en change, on n'en revient pas.
    expect(screen.queryByLabelText('Retour')).toBeNull()
    expect(container.querySelectorAll('.ipm-pile .ipm-carte-liste')).toHaveLength(ANNUAIRE.length)
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-segment')).toBeNull()
  })

  it('propose un filtre par spécialité présente, les plus fournies d’abord', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    const libelles = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(libelles).toEqual(['Tous4', 'Pharmacies2', 'Cliniques1', 'Laboratoires d’analyses1'])
    expect(puce(/^Tous/)).toHaveAttribute('aria-selected', 'true')
  })

  it('filtre par spécialité, et « Tous » rend l’annuaire entier', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    fireEvent.click(puce(/^Cliniques/))
    await waitFor(() => expect(screen.queryByText('Pharmacie du Plateau')).toBeNull())
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()
    expect(screen.getByText('1 structure sur 4')).toBeInTheDocument()

    fireEvent.click(puce(/^Tous/))
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(screen.getByText('4 structures')).toBeInTheDocument()
  })

  it('combine la recherche et le filtre', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    // « plateau » : une pharmacie et une clinique…
    rechercher('plateau')
    await waitFor(() => expect(screen.queryByText('Bio 24')).toBeNull())
    expect(screen.getByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()

    // … et parmi les pharmacies seulement, la seule pharmacie.
    fireEvent.click(puce(/^Pharmacies/))
    await waitFor(() => expect(screen.queryByText('Clinique du Cap')).toBeNull())
    expect(screen.getByText('Pharmacie du Plateau')).toBeInTheDocument()
  })

  it('appelle d’un toucher, et le dit quand le numéro manque', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    expect(screen.getByLabelText('Appeler Clinique du Cap')).toHaveAttribute(
      'href',
      'tel:338480000',
    )
    expect(screen.getByLabelText("Appeler Pharmacie de l'Aeroport")).toHaveAttribute(
      'href',
      'tel:+221338201122',
    )
    expect(screen.queryByLabelText('Appeler Bio 24')).toBeNull()
    expect(screen.getByText('Téléphone non communiqué')).toBeInTheDocument()
    expect(screen.getByText('Adresse non communiquée')).toBeInTheDocument()
  })

  it('chaque structure a son bouton « S’y rendre », qui ouvre la carte dans l’application', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    const cap = screen.getByLabelText('S’y rendre : itinéraire vers Clinique du Cap')
    // Un bouton de l'application, et non un lien qui la quitte.
    expect(cap.tagName).toBe('BUTTON')
    expect(cap).not.toHaveAttribute('href')
    fireEvent.click(cap)
    await waitFor(() => expect(window.location.pathname).toBe('/conventionnes/CL001'))
    // Deux boutons par structure qui a un numéro, un seul sinon.
    expect(screen.getAllByLabelText(/^S’y rendre/)).toHaveLength(ANNUAIRE.length)
    expect(screen.getAllByLabelText(/^Appeler/)).toHaveLength(3)
  })

  it('propose « Tout afficher » quand rien ne correspond, et remet le filtre à « Tous »', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    fireEvent.click(puce(/^Cliniques/))
    rechercher('yoff')
    expect(await screen.findByText('Aucune structure trouvée')).toBeInTheDocument()
    expect(screen.getByText(/parmi les cliniques/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tout afficher'))
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(puce(/^Tous/)).toHaveAttribute('aria-selected', 'true')
  })

  it('annuaire vide : un état vide illustré, sans recherche ni filtres', async () => {
    fetchMock.mockResolvedValue(reponseJson([]))
    const { container } = rendreEcran(<Conventionnes />)

    expect(await screen.findByText('Aucune structure conventionnée')).toBeInTheDocument()
    expect(container.querySelector('ion-input')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
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
