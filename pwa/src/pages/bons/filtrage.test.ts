import { describe, expect, it } from 'vitest'

import { unBon, unFournisseur } from '../../test/fabriques'
import { compterParType, estFiltreType, filtrerBons, normaliser } from './filtrage'

const bons = [
  unBon({ id: 3, code: 'BPI000123', statut: 'valide', date: '2026-09-18' }),
  unBon({
    id: 2,
    code: 'BPI000122',
    statut: 'traite',
    date: '2026-09-02',
    beneficiaire: {
      matricule: '1204-01',
      nomComplet: 'Awa DIOP',
      type: { code: '2', libelle: 'CONJOINT' },
    },
    pharmacie: unFournisseur({ code: 'PH002', libelle: "PHARMACIE DE L'AÉROPORT" }),
  }),
  unBon({ id: 1, code: 'BPI000045', statut: 'expire', date: '2026-07-30' }),
  unBon({
    id: 4,
    genre: 'lettre-garantie',
    code: 'LGI000007',
    statut: 'valide',
    date: '2026-09-20',
    pharmacie: null,
    prestataire: unFournisseur({ code: 'CL008', libelle: 'CLINIQUE NORD FOIRE' }),
  }),
]

describe('normaliser', () => {
  it('retire accents, casse et apostrophes', () => {
    expect(normaliser("  PHARMACIE DE L'AÉROPORT ")).toBe('pharmacie de l aeroport')
    expect(normaliser(null)).toBe('')
  })
})

describe('filtrerBons', () => {
  it('sans filtre ni recherche : tout', () => {
    expect(filtrerBons(bons, 'tous', '')).toHaveLength(4)
  })

  it('filtre par type de document', () => {
    expect(filtrerBons(bons, 'lettre-garantie', '').map((b) => b.id)).toEqual([4])
    expect(filtrerBons(bons, 'bon-pharmacie', '').map((b) => b.id)).toEqual([3, 2, 1])
  })

  it('recherche sans accents sur la pharmacie et le bénéficiaire, tous les mots', () => {
    expect(filtrerBons(bons, 'tous', 'aeroport').map((b) => b.id)).toEqual([2])
    expect(filtrerBons(bons, 'tous', 'awa aéroport').map((b) => b.id)).toEqual([2])
    expect(filtrerBons(bons, 'tous', 'awa plateau')).toEqual([])
  })

  it('recherche par numéro, avec ou sans les zéros', () => {
    expect(filtrerBons(bons, 'tous', '123').map((b) => b.id)).toEqual([3])
    expect(filtrerBons(bons, 'tous', 'bpi000045').map((b) => b.id)).toEqual([1])
  })

  it('combine le type et la recherche', () => {
    expect(filtrerBons(bons, 'bon-pharmacie', 'aeroport').map((b) => b.id)).toEqual([2])
    expect(filtrerBons(bons, 'lettre-garantie', 'aeroport')).toEqual([])
  })

  it('recherche par date affichée', () => {
    expect(filtrerBons(bons, 'tous', '30/07/2026').map((b) => b.id)).toEqual([1])
  })
})

describe('compterParType', () => {
  it('compte chaque type et le total', () => {
    expect(compterParType(bons)).toEqual({
      tous: 4,
      'bon-pharmacie': 3,
      'lettre-garantie': 1,
    })
  })
})

describe('estFiltreType', () => {
  it('reconnaît les valeurs du menu', () => {
    expect(estFiltreType('tous')).toBe(true)
    expect(estFiltreType('lettre-garantie')).toBe(true)
    // Un statut n'est plus une catégorie : le menu range par type.
    expect(estFiltreType('valide')).toBe(false)
    expect(estFiltreType(2)).toBe(false)
  })
})
