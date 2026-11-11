import { describe, expect, it } from 'vitest'

import { dureeAPied, ecartMetres, formaterDistance, formaterDuree } from './trajet'

const PLATEAU = { latitude: 14.6937, longitude: -17.4441 }
const MADELEINE = { latitude: 14.6597309, longitude: -17.4383376 }

describe('formaterDistance', () => {
  it('parle en mètres de près, en kilomètres de loin', () => {
    expect(formaterDistance(4)).toBe('10 m')
    expect(formaterDistance(846)).toBe('850 m')
    expect(formaterDistance(4210)).toBe('4,2 km')
    expect(formaterDistance(12640)).toBe('13 km')
  })
})

describe('formaterDuree', () => {
  it('en minutes, puis en heures', () => {
    expect(formaterDuree(10)).toBe('1 min')
    expect(formaterDuree(612)).toBe('10 min')
    expect(formaterDuree(3900)).toBe('1 h 05')
    expect(formaterDuree(7200)).toBe('2 h')
  })
})

describe('dureeAPied', () => {
  it('à 4,5 km/h', () => {
    expect(dureeAPied(4500)).toBeCloseTo(3600)
  })
})

describe('ecartMetres', () => {
  it('mesure à vol d’oiseau', () => {
    expect(ecartMetres(PLATEAU, PLATEAU)).toBe(0)
    expect(ecartMetres(PLATEAU, MADELEINE)).toBeGreaterThan(3700)
    expect(ecartMetres(PLATEAU, MADELEINE)).toBeLessThan(3900)
  })
})
