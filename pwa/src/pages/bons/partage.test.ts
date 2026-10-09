import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { unBon } from '../../test/fabriques'
import { nomFichierPdf, partagerPdf, partageFichierPossible } from './partage'

const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
const bon = unBon({ id: 7, code: 'BPI000123' })

// jsdom n'a ni navigator.share ni URL.createObjectURL : on les pose le temps d'un test.
function definir(cible: object, nom: string, valeur: unknown) {
  Object.defineProperty(cible, nom, { value: valeur, configurable: true, writable: true })
}

let clics: string[]

beforeEach(() => {
  clics = []
  definir(
    URL,
    'createObjectURL',
    vi.fn(() => 'blob:pdf'),
  )
  definir(URL, 'revokeObjectURL', vi.fn())
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clics.push(this.download)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('nomFichierPdf', () => {
  it('reprend le numéro du bon', () => {
    expect(nomFichierPdf(bon)).toBe('BPI000123.pdf')
    expect(nomFichierPdf({ id: 4, code: '' })).toBe('bon-4.pdf')
  })
})

describe('partagerPdf', () => {
  it('ouvre la feuille de partage avec le fichier quand c’est possible', async () => {
    const share = vi.fn(() => Promise.resolve())
    definir(navigator, 'share', share)
    definir(navigator, 'canShare', () => true)

    await expect(partagerPdf(pdf, bon)).resolves.toBe('partage')
    const donnees = (share.mock.calls[0] as unknown as [ShareData])[0]
    expect(donnees.files?.[0]?.name).toBe('BPI000123.pdf')
    expect(donnees.files?.[0]?.type).toBe('application/pdf')
    expect(clics).toEqual([])
  })

  it('feuille refermée : rien d’autre', async () => {
    definir(navigator, 'share', () => Promise.reject(new DOMException('annulé', 'AbortError')))
    definir(navigator, 'canShare', () => true)
    await expect(partagerPdf(pdf, bon)).resolves.toBe('annule')
    expect(clics).toEqual([])
  })

  it('partage refusé : repli sur le téléchargement', async () => {
    definir(navigator, 'share', () => Promise.reject(new DOMException('refus', 'NotAllowedError')))
    definir(navigator, 'canShare', () => true)
    await expect(partagerPdf(pdf, bon)).resolves.toBe('telecharge')
    expect(clics).toEqual(['BPI000123.pdf'])
  })

  it('sans Web Share : téléchargement direct', async () => {
    expect(partageFichierPossible(new File([pdf], 'x.pdf'))).toBe(false)
    await expect(partagerPdf(pdf, bon)).resolves.toBe('telecharge')
    expect(clics).toEqual(['BPI000123.pdf'])
    expect(URL.createObjectURL).toHaveBeenCalledWith(pdf)
  })
})
