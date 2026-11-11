import { describe, expect, it } from 'vitest'

import { unFournisseur } from '../../test/fabriques'
import type { Conventionne } from '../../types/api'
import {
  filtrerConventionnes,
  filtresSpecialites,
  libelleSpecialite,
  lienItineraire,
  lienTelephone,
  nomStructure,
  normaliser,
  TOUS,
} from './recherche'

const PHARMACIES = { code: '06', libelle: 'PHARMACIES' }
const CLINIQUES = { code: '08', libelle: 'CLINIQUES' }
const LABOS = { code: '28', libelle: 'LABORATOIRES D’ANALYSES' }

const structure = (surcharge: Partial<Conventionne>): Conventionne => ({
  ...unFournisseur(),
  specialite: PHARMACIES,
  position: null,
  ...surcharge,
})

const PLATEAU = structure({
  code: 'PH001',
  libelle: 'PHARMACIE DU PLATEAU',
  adresse: 'Avenue Lamine Guèye, Dakar',
})
const AEROPORT = structure({
  code: 'PH002',
  libelle: "PHARMACIE DE L'AÉROPORT",
  adresse: 'Route de Yoff',
})
const CAP = structure({
  code: 'CL001',
  libelle: 'CLINIQUE DU CAP',
  adresse: 'Avenue Pasteur, Plateau',
  specialite: CLINIQUES,
})
const BIO = structure({ code: 'LB001', libelle: 'BIO 24', adresse: null, specialite: LABOS })
const TOUTES = [PLATEAU, AEROPORT, CAP, BIO]

describe('normaliser', () => {
  it('ôte accents, apostrophes et majuscules', () => {
    expect(normaliser("PHARMACIE DE L'AÉROPORT")).toBe('pharmacie de l aeroport')
    expect(normaliser('  Guèye   Dakar ')).toBe('gueye dakar')
    expect(normaliser(null)).toBe('')
  })
})

describe('filtrerConventionnes', () => {
  it('rend tout sans recherche ni filtre', () => {
    expect(filtrerConventionnes(TOUTES, '   ')).toHaveLength(4)
    expect(filtrerConventionnes(TOUTES, '', TOUS)).toHaveLength(4)
  })

  it('filtre par spécialité', () => {
    expect(filtrerConventionnes(TOUTES, '', '06')).toEqual([PLATEAU, AEROPORT])
    expect(filtrerConventionnes(TOUTES, '', '08')).toEqual([CAP])
  })

  it('cherche dans le nom, l’adresse et la spécialité, sans accents', () => {
    expect(filtrerConventionnes(TOUTES, 'aeroport')).toEqual([AEROPORT])
    expect(filtrerConventionnes(TOUTES, 'gueye')).toEqual([PLATEAU])
    expect(filtrerConventionnes(TOUTES, 'laboratoire')).toEqual([BIO])
  })

  it('exige tous les mots, et combine recherche et filtre', () => {
    // « plateau » : la pharmacie du Plateau ET la clinique d'avenue Pasteur, Plateau.
    expect(filtrerConventionnes(TOUTES, 'plateau')).toEqual([PLATEAU, CAP])
    expect(filtrerConventionnes(TOUTES, 'plateau', '08')).toEqual([CAP])
    expect(filtrerConventionnes(TOUTES, 'plateau clinique')).toEqual([CAP])
  })
})

describe('filtresSpecialites', () => {
  it('une puce par spécialité présente, les plus fournies d’abord', () => {
    expect(filtresSpecialites(TOUTES)).toEqual([
      { code: '06', libelle: 'Pharmacies', nombre: 2 },
      { code: '08', libelle: 'Cliniques', nombre: 1 },
      { code: '28', libelle: 'Laboratoires d’analyses', nombre: 1 },
    ])
  })

  it('ignore les structures sans spécialité et l’annuaire vide', () => {
    expect(filtresSpecialites([structure({ specialite: null })])).toEqual([])
    expect(filtresSpecialites([])).toEqual([])
  })
})

describe('libelleSpecialite', () => {
  it('écrit une catégorie comme une phrase, pas comme un nom propre', () => {
    expect(libelleSpecialite('LABORATOIRES D’ANALYSES')).toBe('Laboratoires d’analyses')
    expect(libelleSpecialite('SAGES-FEMMES')).toBe('Sages-femmes')
    expect(libelleSpecialite('  CENTRES   DE SANTE ')).toBe('Centres de sante')
    expect(libelleSpecialite(null)).toBe('')
  })
})

describe('lienItineraire', () => {
  const localisee = structure({ position: { latitude: 14.6597, longitude: -17.4383 } })

  it('mène à la position de la fiche, depuis celle du téléphone', () => {
    // Aucune origine dans le lien : la carte part de là où est l'employé.
    expect(lienItineraire(localisee)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=14.6597%2C-17.4383&travelmode=driving',
    )
  })

  it('sans position, confie le nom et l’adresse à la carte', () => {
    expect(lienItineraire(CAP)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent('Clinique du Cap, Avenue Pasteur, Plateau, Sénégal') +
        '&travelmode=driving',
    )
    // Sans adresse non plus : le nom et le pays suffisent à la carte.
    expect(lienItineraire(BIO)).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Bio 24, Sénégal')}&travelmode=driving`,
    )
  })

  it('rien à chercher : pas de lien', () => {
    expect(lienItineraire(structure({ libelle: '', adresse: null }))).toBeNull()
  })
})

describe('lienTelephone', () => {
  it('garde le numéro tel quel, sans inventer d’indicatif', () => {
    expect(lienTelephone('33 856 40 53')).toBe('tel:338564053')
    expect(lienTelephone('+221 77 000 00 01')).toBe('tel:+221770000001')
  })

  it('refuse ce qui n’est pas composable', () => {
    expect(lienTelephone('')).toBeNull()
    expect(lienTelephone(null)).toBeNull()
    expect(lienTelephone('néant')).toBeNull()
    expect(lienTelephone('12 34')).toBeNull()
  })
})

describe('nomStructure', () => {
  it('rend le nom lisible, ou le code à défaut', () => {
    expect(nomStructure(CAP)).toBe('Clinique du Cap')
    expect(nomStructure(structure({ code: 'X9', libelle: '' }))).toBe('X9')
  })
})
