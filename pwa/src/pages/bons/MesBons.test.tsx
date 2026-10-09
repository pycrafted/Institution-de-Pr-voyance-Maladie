import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { reinitialiserBons } from '../../data/bons'
import { enregistrerBonsEnCache, viderCache } from '../../offline/stockage'
import { reponseJson, unBon, unFournisseur } from '../../test/fabriques'
import type { Bon } from '../../types/api'
import MesBons from '../MesBons'
import { preparerIonic, puce, rendreEcran } from './outils-test'

// L'hôte du modal « Nouveau bon » vit dans App (sous le routeur) : ici, on
// ne vérifie que l'appel.
const { ouvrirNouveauBon } = vi.hoisted(() => ({ ouvrirNouveauBon: vi.fn() }))
vi.mock('../../components/NouveauBonModal', () => ({
  useNouveauBon: () => ({ ouvrirNouveauBon }),
}))

const fetchMock = vi.fn<typeof fetch>()
// Les bons répondent comme chaque test le décide ; les lettres de garantie,
// lues en même temps, par la liste `lettres`.
const bonsMock = vi.fn<typeof fetch>()
let lettres: Bon[] = []

const BONS = [
  unBon({ id: 3, code: 'BPI000123', statut: 'valide' }),
  unBon({
    id: 2,
    code: 'BPI000122',
    statut: 'traite',
    beneficiaire: {
      matricule: '1204-01',
      nomComplet: 'AWA DIOP',
      type: { code: '2', libelle: 'CONJOINT' },
    },
    pharmacie: unFournisseur({ code: 'PH002', libelle: "PHARMACIE DE L'AEROPORT" }),
  }),
  unBon({ id: 1, code: 'BPI000045', statut: 'expire', date: '2026-07-30' }),
]

beforeAll(() => preparerIonic())

beforeEach(async () => {
  fetchMock.mockReset()
  bonsMock.mockReset()
  lettres = []
  fetchMock.mockImplementation((entree, init) =>
    String(entree).includes('/lettres-garantie/')
      ? Promise.resolve(reponseJson(lettres))
      : bonsMock(entree, init),
  )
  ouvrirNouveauBon.mockReset()
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  reinitialiserBons()
  await viderCache()
})

/** Le champ de recherche de la charte (§3.8) enveloppe un ion-input. */
function rechercher(texte: string) {
  const saisie = document.querySelector('ion-input')
  if (!saisie) throw new Error('recherche absente')
  fireEvent(saisie, new CustomEvent('ionInput', { detail: { value: texte } }))
}

describe('Mes documents', () => {
  it('liste les documents avec type, numéro, bénéficiaire, pharmacie et statut', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    const { container } = rendreEcran(<MesBons />)

    expect(await screen.findByText('BPI000123')).toBeInTheDocument()
    expect(screen.getByText('BPI000122')).toBeInTheDocument()
    expect(screen.getByText('BPI000045')).toBeInTheDocument()
    // Le type de document, en titre de chaque carte (§5).
    expect(screen.getAllByText('Bon de pharmacie')).toHaveLength(BONS.length)
    expect(screen.getByText(/Awa Diop · Conjoint/)).toBeInTheDocument()
    expect(screen.getByText(/Pharmacie de l'Aeroport/)).toBeInTheDocument()
    // Le sous-titre dit le nombre, et rien d'autre.
    // Le sous-titre décrit l'écran ; le compte est sur les puces et en bas.
    expect(container.querySelector('.ipm-bandeau__sous-titre')).toHaveTextContent(
      /bons de pharmacie et vos lettres de garantie/,
    )
    expect(screen.queryByText(/demandés ou émis/)).toBeNull()
  })

  it('liste tout d’un trait, du plus récent au plus ancien, sans intercalaire de mois', async () => {
    bonsMock.mockResolvedValue(
      reponseJson([
        unBon({ id: 1, code: 'BPI000045', date: '2026-07-30' }),
        unBon({ id: 3, code: 'BPI000123', date: '2026-09-18' }),
      ]),
    )
    const { container } = rendreEcran(<MesBons />)
    await screen.findByText('BPI000123')
    expect(screen.queryByText(/Ce mois-ci|Juillet 2026/)).toBeNull()
    const numeros = Array.from(container.querySelectorAll('.ipm-carte-liste')).map(
      (carte) => carte.textContent?.match(/BPI\d+/)?.[0],
    )
    expect(numeros).toEqual(['BPI000123', 'BPI000045'])
  })

  it('aucun filet : les documents sont des cartes autonomes (§1)', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByText('BPI000123')

    expect(document.querySelectorAll('.ipm-carte-liste')).toHaveLength(BONS.length)
    expect(document.querySelector('ion-item')).toBeNull()
    expect(document.querySelector('ion-segment')).toBeNull()
  })

  it('filtre par statut avec les puces', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByText('BPI000123')

    fireEvent.click(puce('traite'))
    await waitFor(() => expect(screen.queryByText('BPI000123')).toBeNull())
    expect(screen.getByText('BPI000122')).toBeInTheDocument()
    expect(screen.getByText('1 document sur 3')).toBeInTheDocument()
  })

  it('recherche, puis « Tout afficher » quand rien ne correspond', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByText('BPI000123')

    rechercher('aéroport')
    await waitFor(() => expect(screen.queryByText('BPI000123')).toBeNull())
    expect(screen.getByText('BPI000122')).toBeInTheDocument()

    rechercher('zzz')
    expect(await screen.findByText('Aucun document trouvé')).toBeInTheDocument()
    expect(screen.getByText(/ne correspond à « zzz »/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tout afficher'))
    expect(await screen.findByText('BPI000123')).toBeInTheDocument()
  })

  it('aucun document : état vide avec « Nouveau bon »', async () => {
    bonsMock.mockResolvedValue(reponseJson([]))
    rendreEcran(<MesBons />)
    expect(await screen.findByText('Aucun document pour l’instant')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Nouveau bon'))
    expect(ouvrirNouveauBon).toHaveBeenCalled()
  })

  it('serveur injoignable sans cache : erreur et « Réessayer »', async () => {
    bonsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    rendreEcran(<MesBons />)
    expect(await screen.findByText('Impossible d’afficher vos documents')).toBeInTheDocument()

    bonsMock.mockReset()
    bonsMock.mockResolvedValue(reponseJson(BONS))
    fireEvent.click(screen.getByText('Réessayer'))
    expect(await screen.findByText('BPI000123')).toBeInTheDocument()
  })

  it('hors réseau : la dernière liste en cache reste affichée', async () => {
    await enregistrerBonsEnCache(BONS, '2026-09-17T08:00:00Z')
    bonsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    rendreEcran(<MesBons />)
    expect(await screen.findByText('BPI000123')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Serveur injoignable|Hors ligne/),
    )
  })

  it('montre les lettres de garantie avec leur prestataire, et mène à leur détail', async () => {
    lettres = [
      unBon({
        genre: 'lettre-garantie',
        id: 3,
        code: 'LGI000075',
        pharmacie: null,
        prestataire: unFournisseur({ code: 'CL008', libelle: 'CLINIQUE DE LA MADELEINE' }),
        naturePrestation: { code: '00', libelle: 'VISITE' },
      }),
    ]
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)

    expect(await screen.findByText('LGI000075')).toBeInTheDocument()
    // Même id que le bon BPI000123 : les deux cartes sont là.
    expect(screen.getByText('BPI000123')).toBeInTheDocument()
    expect(screen.getByText('Lettre de garantie')).toBeInTheDocument()
    expect(screen.getByText(/Clinique de la Madeleine/)).toBeInTheDocument()
    const carte = screen.getByText('LGI000075').closest('button')
    if (!carte) throw new Error('carte absente')
    fireEvent.click(carte)
    await waitFor(() => expect(window.location.pathname).toBe('/bons/lettres/3'))
    window.history.replaceState(null, '', '/')

    rechercher('visite')
    await waitFor(() => expect(screen.queryByText('BPI000123')).toBeNull())
    expect(screen.getByText('LGI000075')).toBeInTheDocument()
  })
})
