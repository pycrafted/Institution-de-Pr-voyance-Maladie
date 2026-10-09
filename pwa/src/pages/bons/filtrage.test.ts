import { describe, expect, it } from 'vitest'

import { unBon, unFournisseur } from '../../test/fabriques'
import { compterParStatut, estFiltreStatut, filtrerBons, normaliser } from './filtrage'

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
]

describe('normaliser', () => {
  it('retire accents, casse et apostrophes', () => {
    expect(normaliser("  PHARMACIE DE L'AÉROPORT ")).toBe('pharmacie de l aeroport')
    expect(normaliser(null)).toBe('')
  })
})

describe('filtrerBons', () => {
  it('sans filtre ni recherche : tout', () => {
    expect(filtrerBons(bons, 'tous', '')).toHaveLength(3)
  })

  it('filtre par statut', () => {
    expect(filtrerBons(bons, 'traite', '').map((b) => b.id)).toEqual([2])
    expect(filtrerBons(bons, 'annule', '')).toEqual([])
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

  it('combine statut et recherche', () => {
    expect(filtrerBons(bons, 'valide', 'awa')).toEqual([])
  })

  it('recherche par date affichée', () => {
    expect(filtrerBons(bons, 'tous', '30/07/2026').map((b) => b.id)).toEqual([1])
  })
})

describe('compterParStatut', () => {
  it('compte chaque statut et le total', () => {
    expect(compterParStatut(bons)).toEqual({ tous: 3, valide: 1, traite: 1, expire: 1, annule: 0 })
  })
})

describe('estFiltreStatut', () => {
  it('reconnaît les valeurs du segment', () => {
    expect(estFiltreStatut('tous')).toBe(true)
    expect(estFiltreStatut('valide')).toBe(true)
    expect(estFiltreStatut('autre')).toBe(false)
    expect(estFiltreStatut(2)).toBe(false)
  })
})
