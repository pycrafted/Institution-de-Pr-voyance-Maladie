import { describe, expect, it } from 'vitest'

import {
  age,
  ajouterJours,
  matriculeSansSociete,
  aujourdhuiISO,
  capitaliser,
  dateCourte,
  dateLongue,
  dateMoyenne,
  dateRelative,
  ecartJours,
  initiales,
  lireDate,
  pluriel,
  premierPrenom,
  telephone,
  versDateISO,
} from './format'

// Midi local : aucun risque de basculer de jour selon le fuseau de la machine.
const MAINTENANT = new Date(2026, 8, 18, 12, 0, 0)

describe('dates', () => {
  it('lit « AAAA-MM-JJ » en date locale, sans décalage de fuseau', () => {
    const date = lireDate('2026-01-01')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(1)
    expect(lireDate('')).toBeNull()
    expect(lireDate('n’importe quoi')).toBeNull()
  })

  it('aller-retour Date ↔ ISO', () => {
    expect(versDateISO(new Date(2026, 1, 3))).toBe('2026-02-03')
    expect(aujourdhuiISO(MAINTENANT)).toBe('2026-09-18')
  })

  it('ajoute des jours en traversant les mois et années', () => {
    expect(ajouterJours('2026-09-18', 30)).toBe('2026-10-18')
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('écart en jours', () => {
    expect(ecartJours('2026-09-18', '2026-10-18')).toBe(30)
    expect(ecartJours('2026-09-18', '2026-09-17')).toBe(-1)
  })

  it('formats français', () => {
    expect(dateCourte('2026-09-18')).toBe('18/09/2026')
    expect(dateMoyenne('2026-09-18')).toMatch(/^18 sept\.? 2026$/)
    expect(dateLongue('2026-09-18')).toBe('vendredi 18 septembre 2026')
    expect(dateCourte(null)).toBe('')
  })

  it('dates relatives', () => {
    expect(dateRelative('2026-09-18', MAINTENANT)).toBe("Aujourd'hui")
    expect(dateRelative('2026-09-17', MAINTENANT)).toBe('Hier')
    expect(dateRelative('2026-09-19', MAINTENANT)).toBe('Demain')
    expect(dateRelative('2026-08-01', MAINTENANT)).toMatch(/^1 août 2026$/)
  })
})

describe('personnes', () => {
  it('âge', () => {
    expect(age(64)).toBe('64 ans')
    expect(age(1)).toBe('1 an')
    expect(age(0)).toBe("Moins d'un an")
    expect(age(null)).toBe('')
  })

  it('premier prénom capitalisé, pour saluer', () => {
    expect(premierPrenom('MOUSTAPHA ABDOU')).toBe('Moustapha')
    expect(premierPrenom('  awa ')).toBe('Awa')
    expect(premierPrenom(null)).toBe('')
  })

  it('capitalise les noms composés', () => {
    expect(capitaliser('JEAN-PIERRE N’DIAYE')).toBe('Jean-Pierre N’Diaye')
    expect(capitaliser('élodie')).toBe('Élodie')
  })

  it('initiales', () => {
    expect(initiales('Moustapha DIOP')).toBe('MD')
    expect(initiales('Awa Marie DIOP')).toBe('AD')
    expect(initiales('awa')).toBe('A')
    expect(initiales('')).toBe('?')
  })
})

describe('divers', () => {
  it('pluriel', () => {
    expect(pluriel(1, 'article')).toBe('1 article')
    expect(pluriel(3, 'article')).toBe('3 articles')
    expect(pluriel(2, 'bénéficiaire')).toBe('2 bénéficiaires')
  })

  it('téléphones sénégalais', () => {
    expect(telephone('338490000')).toBe('33 849 00 00')
    expect(telephone('+221 77 123 45 67')).toBe('+221 77 123 45 67')
    expect(telephone('221771234567')).toBe('+221 77 123 45 67')
    expect(telephone('12')).toBe('12')
    expect(telephone(null)).toBe('')
  })
})

describe('matriculeSansSociete', () => {
  it('retire le code de la société devant le matricule d’un bénéficiaire', () => {
    expect(matriculeSansSociete('01-949-31')).toBe('949-31')
    expect(matriculeSansSociete('949')).toBe('949')
  })
})
