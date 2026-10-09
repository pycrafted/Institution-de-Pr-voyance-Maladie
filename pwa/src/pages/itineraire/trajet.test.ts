import { describe, expect, it } from 'vitest'

import {
  dureeAPied,
  ecartMetres,
  formaterDistance,
  formaterDuree,
  lireTrajet,
  SERVEUR_ITINERAIRE,
  urlItineraire,
} from './trajet'

const PLATEAU = { latitude: 14.6937, longitude: -17.4441 }
const MADELEINE = { latitude: 14.6597309, longitude: -17.4383376 }

describe('urlItineraire', () => {
  it('demande longitude puis latitude, comme OSRM l’attend', () => {
    expect(urlItineraire(PLATEAU, MADELEINE)).toBe(
      `${SERVEUR_ITINERAIRE}/route/v1/driving/-17.444100,14.693700;-17.438338,14.659731` +
        '?overview=full&geometries=geojson&alternatives=false&steps=false',
    )
  })
})

describe('lireTrajet', () => {
  it('lit distance, durée, et remet le tracé dans l’ordre des cartes', () => {
    const trajet = lireTrajet({
      code: 'Ok',
      routes: [
        {
          distance: 4210.5,
          duration: 612.3,
          geometry: {
            coordinates: [
              [-17.4441, 14.6937],
              [-17.44, 14.68],
              [-17.4383, 14.6597],
            ],
          },
        },
      ],
    })
    expect(trajet).toEqual({
      distance: 4210.5,
      duree: 612.3,
      trace: [
        [14.6937, -17.4441],
        [14.68, -17.44],
        [14.6597, -17.4383],
      ],
    })
  })

  it('refuse une réponse sans itinéraire', () => {
    expect(lireTrajet({ code: 'NoRoute', routes: [] })).toBeNull()
    expect(lireTrajet({ code: 'Ok', routes: [] })).toBeNull()
    expect(lireTrajet({ code: 'Ok', routes: [{ distance: 1, duration: 1 }] })).toBeNull()
    expect(lireTrajet(null)).toBeNull()
    expect(lireTrajet('<html>erreur</html>')).toBeNull()
  })
})

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
