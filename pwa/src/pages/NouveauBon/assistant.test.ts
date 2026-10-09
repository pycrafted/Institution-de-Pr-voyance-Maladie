import { describe, expect, it } from 'vitest'

import { unBeneficiaire, unFournisseur, uneSpecialite, unMoi } from '../../test/fabriques'
import {
  bornesDate,
  borneArticles,
  correspond,
  corpsDepuisSaisie,
  erreurDate,
  etatInitial,
  grouperParLettre,
  lienBeneficiaire,
  lireErreursServeur,
  normaliser,
  premiereEtapeEnErreur,
  reducteur,
  type Action,
  type EtatAssistant,
} from './assistant'

const AUJOURDHUI = '2026-09-18'
const conjointe = unMoi().beneficiaires[1]!
const pharmacie = unFournisseur()
const specialite = uneSpecialite()
const prescripteur = unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN' })

function jouer(...actions: Action[]): EtatAssistant {
  return actions.reduce(reducteur, etatInitial(AUJOURDHUI))
}

/** Assistant rempli jusqu'au récapitulatif. */
function jusquAuRecap(): EtatAssistant {
  return jouer(
    { type: 'beneficiaire', beneficiaire: conjointe },
    { type: 'specialite', specialite },
    { type: 'prescripteur', prescripteur },
    { type: 'pharmacie', pharmacie },
    { type: 'articles', nombre: 3 },
    { type: 'continuer', aujourdhui: AUJOURDHUI },
  )
}

describe('parcours de l’assistant', () => {
  it('démarre à l’étape 1, ordonnance du jour, un article', () => {
    const etat = etatInitial(AUJOURDHUI)
    expect(etat.etape).toBe(1)
    expect(etat.saisie.dateOrdonnance).toBe(AUJOURDHUI)
    expect(etat.saisie.nbArticles).toBe(1)
  })

  it('avance d’une étape à chaque choix, la spécialité avant le prescripteur', () => {
    let etat = jouer({ type: 'beneficiaire', beneficiaire: conjointe })
    expect(etat).toMatchObject({ etape: 2, sousEtape: 'specialite', sens: 'avant' })
    etat = reducteur(etat, { type: 'specialite', specialite })
    expect(etat).toMatchObject({ etape: 2, sousEtape: 'prescripteur' })
    etat = reducteur(etat, { type: 'prescripteur', prescripteur })
    expect(etat.etape).toBe(3)
    etat = reducteur(etat, { type: 'pharmacie', pharmacie })
    expect(etat.etape).toBe(4)
    etat = reducteur(etat, { type: 'continuer', aujourdhui: AUJOURDHUI })
    expect(etat.etape).toBe(5)
  })

  it('recule d’abord à la liste des spécialités, puis à l’étape précédente', () => {
    let etat = jouer(
      { type: 'beneficiaire', beneficiaire: conjointe },
      { type: 'specialite', specialite },
    )
    etat = reducteur(etat, { type: 'precedent' })
    expect(etat).toMatchObject({ etape: 2, sousEtape: 'specialite', sens: 'arriere' })
    etat = reducteur(etat, { type: 'precedent' })
    expect(etat.etape).toBe(1)
    // Déjà au début : rien ne bouge.
    expect(reducteur(etat, { type: 'precedent' })).toBe(etat)
  })

  it('revient à la liste des prescripteurs en reculant depuis la pharmacie', () => {
    const etat = reducteur(
      jouer(
        { type: 'beneficiaire', beneficiaire: conjointe },
        { type: 'specialite', specialite },
        { type: 'prescripteur', prescripteur },
      ),
      { type: 'precedent' },
    )
    expect(etat).toMatchObject({ etape: 2, sousEtape: 'prescripteur' })
  })

  it('oublie le prescripteur quand la spécialité change, pas quand elle est reprise', () => {
    const base = jouer(
      { type: 'beneficiaire', beneficiaire: conjointe },
      { type: 'specialite', specialite },
      { type: 'prescripteur', prescripteur },
      { type: 'precedent' },
      { type: 'precedent' },
    )
    expect(reducteur(base, { type: 'specialite', specialite }).saisie.prescripteur).toEqual(
      prescripteur,
    )
    const autre = reducteur(base, { type: 'specialite', specialite: uneSpecialite({ code: '02' }) })
    expect(autre.saisie.prescripteur).toBeNull()
  })

  it('ramène directement au récapitulatif après une modification', () => {
    let etat = reducteur(jusquAuRecap(), { type: 'modifier', etape: 3 })
    expect(etat).toMatchObject({ etape: 3, retourRecap: true, sens: 'arriere' })
    etat = reducteur(etat, { type: 'pharmacie', pharmacie: unFournisseur({ code: 'PH002' }) })
    expect(etat).toMatchObject({ etape: 5, retourRecap: false })
    expect(etat.saisie.pharmacie?.code).toBe('PH002')
  })

  it('reste à l’étape 4 si la date est hors bornes', () => {
    const etat = jouer(
      { type: 'beneficiaire', beneficiaire: conjointe },
      { type: 'specialite', specialite },
      { type: 'prescripteur', prescripteur },
      { type: 'pharmacie', pharmacie },
      { type: 'date', date: '2026-08-01' },
      { type: 'continuer', aujourdhui: AUJOURDHUI },
    )
    expect(etat.etape).toBe(4)
    expect(etat.erreurs.dateOrdonnance).toBe('L’ordonnance a plus de 30 jours.')
    // Corriger la date efface le message.
    expect(
      reducteur(etat, { type: 'date', date: AUJOURDHUI }).erreurs.dateOrdonnance,
    ).toBeUndefined()
  })

  it('borne le nombre d’articles entre 1 et 8', () => {
    expect(jouer({ type: 'articles', nombre: 0 }).saisie.nbArticles).toBe(1)
    expect(jouer({ type: 'articles', nombre: 12 }).saisie.nbArticles).toBe(8)
    expect(borneArticles(Number.NaN)).toBe(1)
    expect(borneArticles(4.4)).toBe(4)
  })
})

describe('erreurs du serveur', () => {
  it('ramène à la première étape concernée, avec le message du serveur', () => {
    const etat = reducteur(jusquAuRecap(), {
      type: 'erreurs-serveur',
      champs: {
        pharmacie: ['Pharmacie inconnue ou non conventionnée.'],
        nbArticles: ['Au plus 8 articles.'],
      },
    })
    expect(etat).toMatchObject({ etape: 3, retourRecap: true })
    expect(etat.erreurs.pharmacie).toBe('Pharmacie inconnue ou non conventionnée.')
  })

  it('enchaîne sur le champ suivant à corriger, puis revient au récapitulatif', () => {
    let etat = reducteur(jusquAuRecap(), {
      type: 'erreurs-serveur',
      champs: { beneficiaire: ['Hors famille.'], dateOrdonnance: ['Trop ancienne.'] },
    })
    expect(etat.etape).toBe(1)
    etat = reducteur(etat, { type: 'beneficiaire', beneficiaire: unBeneficiaire() })
    expect(etat.etape).toBe(4)
    etat = reducteur(etat, { type: 'date', date: '2026-09-17' })
    etat = reducteur(etat, { type: 'continuer', aujourdhui: AUJOURDHUI })
    expect(etat.etape).toBe(5)
    expect(etat.erreurs).toEqual({})
  })

  it('rouvre la liste des spécialités si la spécialité est refusée, celle des prescripteurs sinon', () => {
    const recap = jusquAuRecap()
    expect(
      reducteur(recap, {
        type: 'erreurs-serveur',
        champs: { specialite: ['Spécialité inconnue.'] },
      }),
    ).toMatchObject({ etape: 2, sousEtape: 'specialite' })
    expect(
      reducteur(recap, {
        type: 'erreurs-serveur',
        champs: { prescripteur: ['Prescripteur inconnu.'] },
      }),
    ).toMatchObject({ etape: 2, sousEtape: 'prescripteur' })
  })

  it('garde une erreur générale au récapitulatif', () => {
    const etat = reducteur(jusquAuRecap(), {
      type: 'erreurs-serveur',
      champs: { non_field_errors: ['Plafond atteint.'], autreChose: ['Refusé.'] },
    })
    expect(etat.etape).toBe(5)
    expect(etat.erreurs.non_field_errors).toBe('Plafond atteint. Refusé.')
  })

  it('lit les erreurs DRF : premier message non vide par champ', () => {
    expect(lireErreursServeur({ pharmacie: ['', 'Inconnue.', 'Autre.'], nbArticles: [] })).toEqual({
      pharmacie: 'Inconnue.',
    })
    expect(premiereEtapeEnErreur({ nbArticles: 'x', prescripteur: 'y' })).toBe(2)
    expect(premiereEtapeEnErreur({ non_field_errors: 'x' })).toBeNull()
  })
})

describe('corps envoyé au serveur', () => {
  it('reprend les codes et matricules attendus par l’API', () => {
    expect(corpsDepuisSaisie(jusquAuRecap().saisie)).toEqual({
      beneficiaire: '1204-01',
      pharmacie: 'PH001',
      specialite: '01',
      prescripteur: 'MG001',
      nbArticles: 3,
      dateOrdonnance: AUJOURDHUI,
    })
  })

  it('refuse une saisie incomplète', () => {
    expect(corpsDepuisSaisie(etatInitial(AUJOURDHUI).saisie)).toBeNull()
  })
})

describe('dates', () => {
  it('accepte de J-30 à aujourd’hui, bornes comprises', () => {
    expect(bornesDate(AUJOURDHUI)).toEqual({ min: '2026-08-19', max: AUJOURDHUI })
    expect(erreurDate('2026-08-19', AUJOURDHUI)).toBeUndefined()
    expect(erreurDate(AUJOURDHUI, AUJOURDHUI)).toBeUndefined()
    expect(erreurDate('2026-08-18', AUJOURDHUI)).toBe('L’ordonnance a plus de 30 jours.')
    expect(erreurDate('2026-09-19', AUJOURDHUI)).toBe(
      'La date de l’ordonnance ne peut pas être dans le futur.',
    )
    expect(erreurDate('', AUJOURDHUI)).toBe('Choisissez la date de l’ordonnance.')
  })

  it('franchit correctement un changement de mois et d’année', () => {
    expect(bornesDate('2026-01-10').min).toBe('2025-12-11')
  })
})

describe('recherche et affichage', () => {
  it('ignore accents, casse et ordre des mots', () => {
    expect(normaliser('  Médecine   GÉNÉRALE ')).toBe('medecine generale')
    expect(correspond('generale méd', 'MEDECINE GENERALE')).toBe(true)
    expect(correspond('plateau pharm', 'PHARMACIE DU PLATEAU', null)).toBe(true)
    expect(correspond('fann', 'PHARMACIE DU PLATEAU', 'Avenue Lamine Guèye')).toBe(false)
    expect(correspond('guey', 'PHARMACIE DU PLATEAU', 'Avenue Lamine Guèye')).toBe(true)
    expect(correspond('   ', 'X')).toBe(true)
    expect(correspond('l aeroport', "PHARMACIE DE L'AEROPORT")).toBe(true)
  })

  it('regroupe par initiale, « # » en dernier', () => {
    const groupes = grouperParLettre(['Beta', '2 Mai', 'alpha', 'Élan', 'Bravo'], (x) => x)
    expect(groupes).toEqual([
      { lettre: 'A', elements: ['alpha'] },
      { lettre: 'B', elements: ['Beta', 'Bravo'] },
      { lettre: 'E', elements: ['Élan'] },
      { lettre: '#', elements: ['2 Mai'] },
    ])
  })

  it('nomme le lien avec le participant', () => {
    expect(lienBeneficiaire(unBeneficiaire())).toBe('Vous-même')
    expect(lienBeneficiaire(conjointe)).toBe('Conjointe')
    expect(lienBeneficiaire(unBeneficiaire({ estParticipant: false, type: null }))).toBe(
      'Ayant droit',
    )
  })
})
