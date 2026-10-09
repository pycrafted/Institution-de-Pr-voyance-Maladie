import { describe, expect, it } from 'vitest'

import { unBon, unMoi } from '../test/fabriques'
import {
  effacerSession,
  enregistrerBonsEnCache,
  enregistrerPdfEnCache,
  generationCache,
  enregistrerSession,
  lireBonEnCache,
  lireBonsEnCache,
  lirePdfEnCache,
  lireSession,
  viderCache,
} from './stockage'

describe('stockage hors-ligne', () => {
  it('session : enregistrer, relire, effacer', async () => {
    const { participant, beneficiaires } = unMoi()
    await enregistrerSession({
      jeton: 'J',
      participant,
      beneficiaires,
      depuis: '2026-09-18T10:00:00Z',
    })
    expect((await lireSession())?.participant.matriculeAffiche).toBe('01-1204')
    await effacerSession()
    expect(await lireSession()).toBeUndefined()
  })

  it('bons : dernière liste et détail', async () => {
    await enregistrerBonsEnCache(
      [unBon({ id: 1 }), unBon({ id: 2, code: 'BPI000002' })],
      '2026-09-18T10:00:00Z',
    )
    expect((await lireBonsEnCache())?.le).toBe('2026-09-18T10:00:00Z')
    expect((await lireBonEnCache('bon-pharmacie', 2))?.code).toBe('BPI000002')
    expect(await lireBonEnCache('bon-pharmacie', 3)).toBeUndefined()
  })

  it('PDF : une lettre et un bon de même numéro interne ont chacun le leur', async () => {
    await enregistrerPdfEnCache('bon-pharmacie', 3, new Blob(['bon']), { empreinte: 'B' })
    await enregistrerPdfEnCache('lettre-garantie', 3, new Blob(['lettre']), { empreinte: 'L' })
    expect((await lirePdfEnCache('bon-pharmacie', 3))?.empreinte).toBe('B')
    expect((await lirePdfEnCache('lettre-garantie', 3))?.empreinte).toBe('L')
  })

  it('PDF : conservé en octets, rendu en Blob', async () => {
    await enregistrerPdfEnCache(
      'bon-pharmacie',
      7,
      new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    )
    const lu = await lirePdfEnCache('bon-pharmacie', 7)
    expect(lu?.pdf.type).toBe('application/pdf')
    expect(lu?.pdf.size).toBe(8)
    expect(lu?.empreinte).toBeNull()
  })

  it('PDF : garde l’empreinte du bon imprimé', async () => {
    await enregistrerPdfEnCache('bon-pharmacie', 8, new Blob(['%PDF-1.4']), { empreinte: 'E1' })
    expect((await lirePdfEnCache('bon-pharmacie', 8))?.empreinte).toBe('E1')
  })

  it('PDF : rien n’est écrit si le cache a été vidé depuis le début du téléchargement', async () => {
    const generation = generationCache()
    await viderCache()
    await enregistrerPdfEnCache('bon-pharmacie', 11, new Blob(['%PDF-1.4']), { generation })
    expect(await lirePdfEnCache('bon-pharmacie', 11)).toBeUndefined()
  })

  it('viderCache efface bons et PDF, pas la session', async () => {
    const { participant, beneficiaires } = unMoi()
    await enregistrerSession({ jeton: 'J', participant, beneficiaires, depuis: '' })
    await enregistrerBonsEnCache([unBon()])
    await enregistrerPdfEnCache('bon-pharmacie', 1, new Blob(['x']))
    await viderCache()
    expect(await lireBonsEnCache()).toBeUndefined()
    expect(await lirePdfEnCache('bon-pharmacie', 1)).toBeUndefined()
    expect(await lireSession()).toBeDefined()
    await effacerSession()
  })
})
