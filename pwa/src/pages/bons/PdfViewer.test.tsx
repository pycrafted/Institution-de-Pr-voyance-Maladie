import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PdfViewer from '../../components/PdfViewer'
import { ouvrirPdf, type DocumentPdf } from './pdfjs'

// pdf.js ne tourne pas dans jsdom (ni worker ni canvas) : on simule le
// document et ses pages, et l'on vérifie ce que la visionneuse en fait.
vi.mock('./pdfjs', () => ({ ouvrirPdf: vi.fn() }))

function faussePage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  }
}

const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })

beforeEach(() => {
  vi.mocked(ouvrirPdf).mockReset()
})

describe('PdfViewer', () => {
  it('rend chaque page, avec ses libellés Original / Copie', async () => {
    const pages = [faussePage(), faussePage()]
    const fermer = vi.fn()
    vi.mocked(ouvrirPdf).mockResolvedValue({
      document: {
        numPages: 2,
        getPage: (n: number) => Promise.resolve(pages[n - 1]),
      } as unknown as DocumentPdf,
      fermer,
    })

    const { unmount } = render(
      <PdfViewer
        pdf={pdf}
        libellesPages={['Original', 'Copie']}
        titre="Bon de pharmacie BPI000123"
      />,
    )

    expect(await screen.findByText('Original')).toBeInTheDocument()
    expect(screen.getByText('Copie')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /BPI000123, Original \(page 1 sur 2\)/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Copie \(page 2 sur 2\)/ })).toBeInTheDocument()
    expect(screen.getByText(/Pincez pour zoomer/)).toBeInTheDocument()
    // §1 : le sélecteur de page est en puces pilules, plus en ion-segment.
    expect(document.querySelector('ion-segment')).toBeNull()
    expect(document.querySelectorAll('.ipm-puce')).toHaveLength(2)

    await waitFor(() => {
      expect(pages[0]?.render).toHaveBeenCalled()
      expect(pages[1]?.render).toHaveBeenCalled()
    })
    // Rendu à la densité de l'écran : le canvas est plus grand que la largeur affichée.
    const parametres = (
      pages[0]?.render.mock.calls[0] as unknown as [{ canvas: HTMLCanvasElement }]
    )[0]
    expect(parametres.canvas.width).toBeGreaterThanOrEqual(360)

    unmount()
    expect(fermer).toHaveBeenCalled()
  })

  it('une seule page : pas de sélecteur de page', async () => {
    const page = faussePage()
    vi.mocked(ouvrirPdf).mockResolvedValue({
      document: { numPages: 1, getPage: () => Promise.resolve(page) } as unknown as DocumentPdf,
      fermer: vi.fn(),
    })
    render(<PdfViewer pdf={pdf} />)
    expect(await screen.findByRole('img', { name: /Page 1 \(page 1 sur 1\)/ })).toBeInTheDocument()
    expect(screen.queryByText('Copie')).toBeNull()
    expect(screen.getByText('Pincez pour zoomer')).toBeInTheDocument()
  })

  it('PDF illisible : message clair au lieu de l’aperçu', async () => {
    vi.mocked(ouvrirPdf).mockRejectedValue(new Error('Invalid PDF structure'))
    render(<PdfViewer pdf={pdf} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/ne peut pas s’afficher/)
  })
})
