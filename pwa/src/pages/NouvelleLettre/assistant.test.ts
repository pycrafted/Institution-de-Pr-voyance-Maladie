import { describe, expect, it } from 'vitest'

import { unFournisseur, uneSpecialite, unMoi } from '../../test/fabriques'
import {
  corpsDepuisSaisie,
  saisieComplete,
  erreurDate,
  etatInitial,
  reducteur,
  type Action,
  type EtatAssistant,
} from './assistant'

const AUJOURDHUI = '2026-09-18'
const moi = unMoi()
const AWA = moi.beneficiaires[1]!
const CARDIO = uneSpecialite({ code: '09', libelle: 'CARDIOLOGUES' })
const GENERALISTES = uneSpecialite({ code: '00', libelle: 'GENERALISTES' })
const CLINIQUE = unFournisseur({ code: 'CL008', libelle: 'CLINIQUE DE LA MADELEINE' })
const DOCTEUR = unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN' })
const VISITE = { code: '00', libelle: 'VISITE' }

function jouer(...actions: Action[]): EtatAssistant {
  return actions.reduce(reducteur, etatInitial(AUJOURDHUI))
}

/** Tout le parcours jusqu'au récapitulatif. */
const PARCOURS: Action[] = [
  { type: 'beneficiaire', beneficiaire: AWA },
  { type: 'specialitePrestataire', specialite: CARDIO },
  { type: 'prestataire', prestataire: CLINIQUE },
  { type: 'nature', nature: VISITE },
  { type: 'specialite', specialite: GENERALISTES },
  { type: 'prescripteur', prescripteur: DOCTEUR },
  { type: 'continuer', aujourdhui: AUJOURDHUI },
]

describe('assistant de la lettre de garantie', () => {
  it('passe par les six étapes, en deux temps pour le prestataire et le prescripteur', () => {
    const etapes = PARCOURS.map((_, rang) => {
      const etat = jouer(...PARCOURS.slice(0, rang + 1))
      return `${etat.etape}${etat.etape === 2 || etat.etape === 4 ? `:${etat.sousEtape}` : ''}`
    })
    expect(etapes).toEqual([
      '2:specialite',
      '2:fournisseur',
      '3',
      '4:specialite',
      '4:fournisseur',
      '5',
      '6',
    ])
  })

  it('rend le corps attendu par l’API', () => {
    const etat = jouer(...PARCOURS)
    expect(corpsDepuisSaisie(etat.saisie)).toEqual({
      beneficiaire: AWA.matricule,
      specialitePrestataire: '09',
      prestataire: 'CL008',
      naturePrestation: '00',
      specialite: '00',
      prescripteur: 'MG001',
      nbArticles: 1,
      datePrescription: AUJOURDHUI,
    })
  })

  it('n’exige que le bénéficiaire, comme l’écran IPM', () => {
    // Prestataire, nature, prescripteur et prescription se renseignent plus
    // tard : seul le bénéficiaire porte l'astérisque.
    const etat = jouer({ type: 'beneficiaire', beneficiaire: AWA })
    expect(saisieComplete(etat.saisie)).toBe(true)
    expect(corpsDepuisSaisie(etat.saisie)).toEqual({
      beneficiaire: AWA.matricule,
      nbArticles: 1,
      datePrescription: AUJOURDHUI,
    })
  })

  it('une autre spécialité efface la structure choisie', () => {
    const etat = jouer(
      { type: 'beneficiaire', beneficiaire: AWA },
      { type: 'specialitePrestataire', specialite: CARDIO },
      { type: 'prestataire', prestataire: CLINIQUE },
      { type: 'precedent' },
      { type: 'precedent' },
      { type: 'specialitePrestataire', specialite: GENERALISTES },
    )
    expect(etat.saisie.prestataire).toBeNull()
    expect(etat.sousEtape).toBe('fournisseur')
  })

  it('en revenant sur une étape en deux temps, retrouve la liste des structures', () => {
    const etat = jouer(...PARCOURS.slice(0, 3), { type: 'precedent' })
    expect(etat.etape).toBe(2)
    expect(etat.sousEtape).toBe('fournisseur')
  })

  it('« Modifier » depuis le récapitulatif y ramène après le choix', () => {
    const etat = jouer(
      ...PARCOURS,
      { type: 'modifier', etape: 3 },
      { type: 'nature', nature: { code: '01', libelle: 'ANALYSES BIO-MEDICALES' } },
    )
    expect(etat.etape).toBe(6)
    expect(etat.saisie.nature?.code).toBe('01')
  })

  it('une erreur du serveur ramène à l’étape du champ, dans la bonne sous-étape', () => {
    const etat = jouer(...PARCOURS, {
      type: 'erreurs-serveur',
      champs: { prestataire: ['Ce prestataire n’est pas de la spécialité choisie.'] },
    })
    expect(etat.etape).toBe(2)
    expect(etat.sousEtape).toBe('fournisseur')
    expect(etat.erreurs.prestataire).toMatch(/spécialité/)
    // Corrigée, on revient au récapitulatif.
    const corrige = reducteur(etat, { type: 'prestataire', prestataire: CLINIQUE })
    expect(corrige.etape).toBe(6)
  })

  it('refuse une prescription de plus de 30 jours ou dans le futur', () => {
    expect(erreurDate('2026-08-19', AUJOURDHUI)).toBeUndefined()
    expect(erreurDate('2026-08-18', AUJOURDHUI)).toMatch(/30 jours/)
    expect(erreurDate('2026-09-19', AUJOURDHUI)).toMatch(/futur/)
    const etat = jouer(
      ...PARCOURS.slice(0, 6),
      { type: 'date', date: '2026-08-01' },
      {
        type: 'continuer',
        aujourdhui: AUJOURDHUI,
      },
    )
    expect(etat.etape).toBe(5)
    expect(etat.erreurs.datePrescription).toMatch(/30 jours/)
  })
})
