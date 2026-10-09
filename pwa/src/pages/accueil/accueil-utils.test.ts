import { describe, expect, it } from 'vitest'

import { libelleLisible } from './accueil-utils'

describe('libelleLisible', () => {
  it('rend lisibles les libellés en majuscules du référentiel', () => {
    expect(libelleLisible('PHARMACIE DU PLATEAU')).toBe('Pharmacie du Plateau')
    expect(libelleLisible("PHARMACIE DE L'AVENUE")).toBe("Pharmacie de l'Avenue")
    expect(libelleLisible('CLINIQUE DE LA MADELEINE')).toBe('Clinique de la Madeleine')
  })

  it('garde les sigles (mot unique et court)', () => {
    expect(libelleLisible('SAR')).toBe('SAR')
    // Sigles préservés comme sur le reste de l'application (et sur le PDF).
    expect(libelleLisible('IPM SAR PERSONNEL MOO')).toBe('IPM SAR Personnel Moo')
    expect(libelleLisible('IPRES')).toBe('IPRES')
    expect(libelleLisible('PHARMACIES')).toBe('Pharmacies')
  })

  it('laisse tel quel un libellé déjà en casse mixte, et vide ce qui manque', () => {
    expect(libelleLisible('Pharmacie Guigon')).toBe('Pharmacie Guigon')
    expect(libelleLisible(null)).toBe('')
    expect(libelleLisible('   ')).toBe('')
  })
})
