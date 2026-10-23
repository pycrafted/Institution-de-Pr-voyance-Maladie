import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../api'
import { reponseJson, unFournisseur } from '../test/fabriques'
import type { Conventionne } from '../types/api'
import Conventionnes from './Conventionnes'
import { preparerIonic, rendreEcran, simulerReseau } from './conventionnes/outils-test'
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

/** Le menu déroulant des catégories, seul filtre de l'écran. */
const menu = () => screen.getByLabelText('Catégorie') as HTMLSelectElement
/** Choisit une catégorie par son code de spécialité (TOUS : « * »). */
const choisir = (code: string) => fireEvent.change(menu(), { target: { value: code } })

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

  it('commence directement par la recherche, sans en-tête ni retour ni filets (§1)', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    const { container } = rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    // Plus d'en-tête du tout : ni bandeau sombre, ni grand titre.
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-entete')).toBeNull()
    // Un onglet : on en change, on n'en revient pas.
    expect(screen.queryByLabelText('Retour')).toBeNull()
    expect(container.querySelectorAll('.ipm-pile .ipm-carte-liste')).toHaveLength(ANNUAIRE.length)
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-segment')).toBeNull()
  })

  it('liste les catégories présentes, les plus fournies d’abord, avec leur compte', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    const libelles = Array.from(menu().options).map((o) => o.textContent)
    expect(libelles).toEqual([
      'Toutes les catégories (4)',
      'Pharmacies (2)',
      'Cliniques (1)',
      'Laboratoires d’analyses (1)',
    ])
    // Toutes les catégories au départ : l'annuaire entier.
    expect(menu().value).toBe('*')
  })

  it('filtre sur la catégorie choisie, et revient à l’annuaire entier', async () => {
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    choisir('08') // Cliniques
    await waitFor(() => expect(screen.queryByText('Pharmacie du Plateau')).toBeNull())
    expect(screen.getByText('Clinique du Cap')).toBeInTheDocument()
    expect(screen.getByText('1 structure sur 4')).toBeInTheDocument()

    choisir('*')
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(screen.getByText('4 structures')).toBeInTheDocument()
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

  it('propose de revenir à toutes les catégories quand l’une est vide', async () => {
    // Une spécialité de l'annuaire dont aucune structure n'est chargée : le
    // cas se produit quand une structure est désactivée entre deux syncs.
    fetchMock.mockResolvedValue(reponseJson(ANNUAIRE))
    rendreEcran(<Conventionnes />)
    await screen.findByText('Pharmacie du Plateau')

    choisir('99') // aucune structure ne porte ce code
    expect(await screen.findByText('Aucune structure trouvée')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Toutes les catégories'))
    expect(await screen.findByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(menu().value).toBe('*')
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
