import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { reinitialiserBons } from '../../data/bons'
import { enregistrerBonsEnCache, viderCache } from '../../offline/stockage'
import { reponseJson, unBon, unFournisseur } from '../../test/fabriques'
import type { Bon } from '../../types/api'
import MesBons from '../MesBons'
import { preparerIonic, rendreEcran } from './outils-test'

// L'hôte du modal « Nouveau bon » vit dans App (sous le routeur) : ici, on
// ne vérifie que l'appel.
const { ouvrirNouveauBon } = vi.hoisted(() => ({ ouvrirNouveauBon: vi.fn() }))
vi.mock('../../components/NouveauBonModal', () => ({
  useNouveauBon: () => ({ ouvrirNouveauBon }),
}))

const fetchMock = vi.fn<typeof fetch>()
// Les bons répondent comme chaque test le décide ; les lettres de garantie,
// lues en même temps, par la liste `lettres` ; les bons d'optique, par une
// liste vide.
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

const LETTRE = unBon({
  genre: 'lettre-garantie',
  id: 3,
  code: 'LGI000075',
  pharmacie: null,
  prestataire: unFournisseur({ code: 'CL008', libelle: 'CLINIQUE DE LA MADELEINE' }),
  naturePrestation: { code: '00', libelle: 'VISITE' },
})

beforeAll(() => preparerIonic())

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
  ouvrirNouveauBon.mockReset()
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  reinitialiserBons()
  await viderCache()
})

/** Le menu déroulant des types de document, seul filtre de l'écran. */
const menu = () => screen.getByLabelText('Type de document') as HTMLSelectElement
/** Choisit un type par sa clé (« tous », « lettre-garantie »…). */
const choisir = (cle: string) => fireEvent.change(menu(), { target: { value: cle } })

describe('Mes documents', () => {
  it('liste les documents avec type, numéro, bénéficiaire, pharmacie et statut', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    const { container } = rendreEcran(<MesBons />)

    expect(await screen.findByLabelText(/BPI000123/)).toBeInTheDocument()
    expect(screen.getByLabelText(/BPI000122/)).toBeInTheDocument()
    expect(screen.getByLabelText(/BPI000045/)).toBeInTheDocument()
    // Le type de document, en titre de chaque carte (§5).
    expect(screen.getAllByText('Bon de pharmacie')).toHaveLength(BONS.length)
    expect(screen.getByText('Awa Diop')).toBeInTheDocument()
    expect(screen.getByText(/Pharmacie de l'Aeroport/)).toBeInTheDocument()
    // Plus d'en-tête du tout : ni bandeau sombre, ni grand titre - l'écran
    // commence par son menu de types.
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-entete')).toBeNull()
    expect(screen.queryByText(/bons de pharmacie et vos lettres de garantie/)).toBeNull()
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
    await screen.findByLabelText(/BPI000123/)
    expect(screen.queryByText(/Ce mois-ci|Juillet 2026/)).toBeNull()
    const numeros = Array.from(container.querySelectorAll('.ipm-carte-liste')).map(
      // Le numéro ne s'écrit plus sur la carte : il reste dans son nom accessible.
      (carte) => carte.getAttribute('aria-label')?.match(/BPI\d+/)?.[0],
    )
    expect(numeros).toEqual(['BPI000123', 'BPI000045'])
  })

  it('aucun filet : les documents sont des cartes autonomes (§1)', async () => {
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByLabelText(/BPI000123/)

    expect(document.querySelectorAll('.ipm-carte-liste')).toHaveLength(BONS.length)
    expect(document.querySelector('ion-item')).toBeNull()
    expect(document.querySelector('ion-segment')).toBeNull()
  })

  it('ne propose au menu que les types présents', async () => {
    lettres = [LETTRE]
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByLabelText(/LGI000075/)

    await waitFor(() =>
      expect(Array.from(menu().options).map((o) => o.textContent)).toEqual([
        'Tous les documents',
        'Bons de pharmacie',
        'Lettres de garantie',
      ]),
    )
  })

  it('n’offre pas un type dont l’employé n’a aucun document', async () => {
    // « Lettres de garantie » n'aiderait personne.
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByLabelText(/BPI000123/)

    const libelles = Array.from(menu().options).map((o) => o.textContent)
    expect(libelles).toEqual(['Tous les documents', 'Bons de pharmacie'])
  })

  it('filtre sur le type choisi, et revient à tous les documents', async () => {
    lettres = [LETTRE]
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)
    await screen.findByLabelText(/LGI000075/)

    choisir('lettre-garantie')
    await waitFor(() => expect(screen.queryByLabelText(/BPI000123/)).toBeNull())
    expect(screen.getByLabelText(/LGI000075/)).toBeInTheDocument()
    expect(screen.getByText('1 document sur 4')).toBeInTheDocument()

    choisir('bon-pharmacie')
    expect(await screen.findByLabelText(/BPI000123/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/LGI000075/)).toBeNull()

    choisir('tous')
    expect(await screen.findByLabelText(/LGI000075/)).toBeInTheDocument()
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
    expect(await screen.findByLabelText(/BPI000123/)).toBeInTheDocument()
  })

  it('hors réseau : la dernière liste en cache reste affichée', async () => {
    await enregistrerBonsEnCache(BONS, '2026-09-17T08:00:00Z')
    bonsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    rendreEcran(<MesBons />)
    expect(await screen.findByLabelText(/BPI000123/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Serveur injoignable|Hors ligne/),
    )
  })

  it('montre les lettres de garantie avec leur prestataire, et mène à leur détail', async () => {
    lettres = [LETTRE]
    bonsMock.mockResolvedValue(reponseJson(BONS))
    rendreEcran(<MesBons />)

    expect(await screen.findByLabelText(/LGI000075/)).toBeInTheDocument()
    // Même id que le bon BPI000123 : les deux cartes sont là.
    expect(screen.getByLabelText(/BPI000123/)).toBeInTheDocument()
    expect(screen.getByText('Lettre de garantie')).toBeInTheDocument()
    expect(screen.getByText(/Clinique de la Madeleine/)).toBeInTheDocument()
    const carte = screen.getByLabelText(/LGI000075/)
    if (!carte) throw new Error('carte absente')
    fireEvent.click(carte)
    await waitFor(() => expect(window.location.pathname).toBe('/bons/lettres/3'))
    window.history.replaceState(null, '', '/')
  })
})
