import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { configurerClient } from '../../api'
import { reinitialiserBons } from '../../data/bons'
import { viderCache } from '../../offline/stockage'
import { reponseJson, unBon } from '../../test/fabriques'
import DetailBon, { type DetailBonProps } from '../DetailBon'
import { preparerIonic, rendreEcran } from './outils-test'

// La visionneuse (pdf.js) a ses propres tests : ici, un simple témoin.
// (createElement importé dans la fabrique : vi.mock est remonté avant les imports.)
vi.mock('../../components/PdfViewer', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ pdf, libellesPages }: { pdf: Blob; libellesPages?: string[] }) =>
      createElement(
        'div',
        { 'data-testid': 'visionneuse' },
        `${pdf.type} ${libellesPages?.join('/') ?? ''}`,
      ),
  }
})

const fetchMock = vi.fn<typeof fetch>()

function reponsePdf(): Response {
  // Corps en texte : le Blob de jsdom n'est pas reconnu par le Response de Node.
  return new Response('%PDF-1.7', {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  })
}

/** Le serveur : la fiche du bon, et son PDF (ou une panne réseau). */
function serveur(bon: unknown, { pdf = true, statut = 200 } = {}) {
  fetchMock.mockImplementation((entree) => {
    const url = String(entree)
    if (url.includes('/pdf/')) {
      return pdf ? Promise.resolve(reponsePdf()) : Promise.reject(new TypeError('Failed to fetch'))
    }
    return Promise.resolve(reponseJson(bon, statut))
  })
}

function afficher(id: string) {
  const props = { match: { params: { id }, isExact: true, path: '/bons/:id', url: `/bons/${id}` } }
  return rendreEcran(<DetailBon {...(props as unknown as DetailBonProps)} />)
}

beforeAll(() => preparerIonic())

beforeEach(async () => {
  fetchMock.mockReset()
  configurerClient({ apiBase: '/api', jeton: 'J', fetch: fetchMock, surSessionExpiree: null })
  reinitialiserBons()
  await viderCache()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('Détail du bon', () => {
  it('montre numéro, statut, validité et le PDF officiel', async () => {
    serveur(unBon({ id: 4, code: 'BPI000123', statut: 'valide', valableJusquAu: '2099-10-18' }))
    afficher('4')

    expect(await screen.findByRole('heading', { level: 1, name: 'BPI000123' })).toBeInTheDocument()
    expect(screen.getByText('Valide')).toBeInTheDocument()
    expect(screen.getByText(/Valable jusqu’au 18 oct\. 2099/)).toBeInTheDocument()

    expect(await screen.findByTestId('visionneuse')).toHaveTextContent(
      'application/pdf Original/Copie',
    )
  })

  it('ne répète pas en cartes ce que le PDF porte déjà', async () => {
    // Bénéficiaire, prescripteur, pharmacie, ordonnance, émission : tout cela
    // est écrit sur le bon officiel affiché juste au-dessus. L'écran ne garde
    // que le bandeau, l'aperçu et les deux actions.
    serveur(unBon({ id: 4, code: 'BPI000123' }))
    afficher('4')
    await screen.findByTestId('visionneuse')

    expect(document.querySelector('.ipm-bandeau--rouge')).toBeNull()
    expect(document.querySelector('ion-item')).toBeNull()
    expect(document.querySelector('ion-list')).toBeNull()
    expect(document.querySelectorAll('.ipm-carte-liste')).toHaveLength(0)
    expect(screen.queryByText('Pharmacie du Plateau')).toBeNull()
    expect(screen.queryByText(/Prescripteur ·/)).toBeNull()
  })

  it('« Partager / Imprimer » passe le PDF à la feuille de partage', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    serveur(unBon({ id: 4, code: 'BPI000123' }))
    afficher('4')

    await screen.findByTestId('visionneuse')
    fireEvent.click(screen.getByText('Partager / Imprimer'))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const donnees = (share.mock.calls[0] as unknown as [ShareData])[0]
    expect(donnees.files?.[0]?.name).toBe('BPI000123.pdf')
  })

  it('PDF impossible à télécharger : aperçu indisponible, le reste s’affiche', async () => {
    serveur(unBon({ id: 4, code: 'BPI000123' }), { pdf: false })
    afficher('4')

    expect(await screen.findByText('Aperçu indisponible hors ligne')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'BPI000123' })).toBeInTheDocument()
    expect(screen.queryByTestId('visionneuse')).toBeNull()
  })

  it('bon d’un autre ou supprimé : « Bon introuvable »', async () => {
    serveur({ detail: 'Pas trouvé.' }, { statut: 404, pdf: false })
    afficher('99')
    expect(await screen.findByText('Bon introuvable')).toBeInTheDocument()
  })

  it('identifiant illisible : introuvable sans appel au serveur', async () => {
    afficher('abc')
    expect(await screen.findByText('Bon introuvable')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
