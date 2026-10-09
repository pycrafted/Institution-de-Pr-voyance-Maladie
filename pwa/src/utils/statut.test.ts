import { describe, expect, it } from 'vitest'

import {
  explicationStatut,
  infoStatut,
  joursRestants,
  libelleValidite,
  ORDRE_STATUTS,
  STATUTS,
} from './statut'

const MAINTENANT = new Date(2026, 8, 18, 12, 0, 0)

describe('statuts', () => {
  it('couleurs de la SPEC : valide vert, expiré gris, annulé rouge, traité bleu', () => {
    expect(STATUTS.valide.couleur).toBe('success')
    expect(STATUTS.expire.couleur).toBe('medium')
    expect(STATUTS.annule.couleur).toBe('danger')
    expect(STATUTS.traite.couleur).toBe('secondary')
  })

  it('libellés français et ordre des filtres', () => {
    expect(ORDRE_STATUTS.map((s) => infoStatut(s).libelle)).toEqual([
      'Valide',
      'Traité',
      'Expiré',
      'Annulé',
    ])
  })

  it('jours restants seulement pour un bon valide', () => {
    expect(joursRestants('valide', '2026-10-18', MAINTENANT)).toBe(30)
    expect(joursRestants('valide', '2026-09-18', MAINTENANT)).toBe(0)
    expect(joursRestants('traite', '2026-10-18', MAINTENANT)).toBeNull()
    // Incohérence possible entre l'horloge du téléphone et celle du serveur.
    expect(joursRestants('valide', '2026-09-17', MAINTENANT)).toBeNull()
  })

  it('libellé de validité', () => {
    expect(libelleValidite('valide', '2026-09-18', MAINTENANT)).toBe("Expire aujourd'hui")
    expect(libelleValidite('valide', '2026-09-19', MAINTENANT)).toBe('Expire demain')
    expect(libelleValidite('valide', '2026-09-28', MAINTENANT)).toBe('Encore 10 jours')
    expect(libelleValidite('expire', '2026-09-01', MAINTENANT)).toBe('')
  })
})

describe('explicationStatut', () => {
  it('parle de pharmacie pour un bon, de prestataire pour une lettre', () => {
    expect(explicationStatut('valide', 'bon-pharmacie')).toMatch(/pharmacie/)
    expect(explicationStatut('valide', 'lettre-garantie')).toMatch(/prestataire/)
    expect(explicationStatut('annule', 'lettre-garantie')).toMatch(/lettre/)
  })
})
