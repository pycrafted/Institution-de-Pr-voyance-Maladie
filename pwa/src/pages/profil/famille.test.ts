import { describe, expect, it } from 'vitest'

import { unBeneficiaire } from '../../test/fabriques'
import { detailBeneficiaire, libelleLien, libelleSexe } from './famille'

describe('libelleLien', () => {
  it('« Titulaire » pour le participant lui-même', () => {
    expect(libelleLien(unBeneficiaire())).toBe('Titulaire')
  })

  it('accorde le lien au sexe du bénéficiaire', () => {
    const conjoint = { code: '2', libelle: 'CONJOINT' }
    expect(libelleLien(unBeneficiaire({ estParticipant: false, type: conjoint, sexe: 'F' }))).toBe(
      'Conjointe',
    )
    expect(libelleLien(unBeneficiaire({ estParticipant: false, type: conjoint, sexe: 'M' }))).toBe(
      'Conjoint',
    )
    expect(
      libelleLien(
        unBeneficiaire({
          estParticipant: false,
          type: { code: '3', libelle: 'ÉPOUSE' },
          sexe: 'F',
        }),
      ),
    ).toBe('Épouse')
  })

  it('sexe inconnu : le genre du libellé décide', () => {
    expect(libelleLien({ type: { code: '2', libelle: 'EPOUSE' } })).toBe('Épouse')
    expect(libelleLien({ type: { code: '5', libelle: 'ASCENDANT' } })).toBe('Ascendant')
    expect(libelleLien({ type: { code: '5', libelle: 'ASCENDANT' }, sexe: 'F' })).toBe('Ascendante')
  })

  it('rend lisible un lien inconnu et nomme un lien absent', () => {
    expect(
      libelleLien(
        unBeneficiaire({ estParticipant: false, type: { code: '9', libelle: 'NEVEU ADOPTE' } }),
      ),
    ).toBe('Neveu Adopte')
    expect(libelleLien(unBeneficiaire({ estParticipant: false, type: null }))).toBe('Ayant droit')
  })
})

describe('libelleSexe', () => {
  it('Homme, Femme ou rien', () => {
    expect(libelleSexe('M')).toBe('Homme')
    expect(libelleSexe('F')).toBe('Femme')
    expect(libelleSexe('')).toBe('')
    expect(libelleSexe(null)).toBe('')
  })
})

describe('detailBeneficiaire', () => {
  it('lien et âge, sans séparateur orphelin', () => {
    const awa = unBeneficiaire({
      estParticipant: false,
      type: { code: '2', libelle: 'CONJOINT' },
      sexe: 'F',
      age: 58,
    })
    expect(detailBeneficiaire(awa)).toBe('Conjointe · 58 ans · 1204')
    expect(detailBeneficiaire({ ...awa, age: null })).toBe('Conjointe · 1204')
  })
})
