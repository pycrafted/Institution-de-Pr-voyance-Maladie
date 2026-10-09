import { describe, expect, it } from 'vitest'

import {
  basculerZoom,
  contraindre,
  ECHELLE_DOUBLE_TAP,
  ECHELLE_MAX,
  echelleElastique,
  facteurRendu,
  IDENTITE,
  zoomerAutour,
} from './zoom'

describe('zoomerAutour', () => {
  it('garde immobile le point sous les doigts', () => {
    const t = zoomerAutour(IDENTITE, 2, { x: 100, y: 50 })
    expect(t).toEqual({ echelle: 2, x: -100, y: -50 })
    // Le point (100, 50) du contenu est toujours affiché en (100, 50).
    expect(t.x + 100 * t.echelle).toBe(100)
    expect(t.y + 50 * t.echelle).toBe(50)
  })
})

describe('contraindre', () => {
  it('revient à l’identité en dessous de 1', () => {
    expect(contraindre({ echelle: 0.7, x: 12, y: 3 }, 360, 500)).toEqual(IDENTITE)
  })

  it('plafonne l’échelle et ne laisse pas de vide autour de la page', () => {
    expect(contraindre({ echelle: 9, x: 0, y: 0 }, 360, 500).echelle).toBe(ECHELLE_MAX)
    expect(contraindre({ echelle: 2, x: 50, y: 20 }, 360, 500)).toEqual({ echelle: 2, x: 0, y: 0 })
    expect(contraindre({ echelle: 2, x: -900, y: -900 }, 360, 500)).toEqual({
      echelle: 2,
      x: -360,
      y: -500,
    })
  })
})

describe('basculerZoom', () => {
  it('zoome au double tapotement, puis revient à la page entière', () => {
    const zoome = basculerZoom(IDENTITE, { x: 180, y: 250 }, 360, 500)
    expect(zoome.echelle).toBe(ECHELLE_DOUBLE_TAP)
    expect(basculerZoom(zoome, { x: 10, y: 10 }, 360, 500)).toEqual(IDENTITE)
  })
})

describe('echelleElastique', () => {
  it('amortit le dépassement', () => {
    expect(echelleElastique(2)).toBe(2)
    expect(echelleElastique(0.5)).toBeGreaterThan(0.5)
    expect(echelleElastique(0.5)).toBeLessThan(1)
    expect(echelleElastique(6)).toBeLessThan(6)
  })
})

describe('facteurRendu', () => {
  it('densité × zoom quand le canvas reste raisonnable', () => {
    expect(facteurRendu(360, 1.414, 3, 1)).toBe(3)
    expect(facteurRendu(360, 1.414, 0, 1)).toBe(1)
  })

  it('réduit le facteur au-delà du plafond de pixels', () => {
    const facteur = facteurRendu(400, 1.414, 3, 4)
    const largeur = 400 * facteur
    expect(facteur).toBeLessThan(12)
    expect(largeur * largeur * 1.414).toBeLessThanOrEqual(16_000_001)
  })
})
