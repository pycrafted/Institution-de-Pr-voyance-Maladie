import { describe, expect, it } from 'vitest'

import { unParticipant } from '../../test/fabriques'
import { informationsDuParticipant } from './informations'

describe('informationsDuParticipant', () => {
  it('détaille la fiche, dans l’ordre, en noms propres', () => {
    const infos = informationsDuParticipant(unParticipant())
    expect(infos.map((i) => i.libelle)).toEqual([
      'Nom et prénom(s)',
      'Matricule',
      'Date de naissance',
      'Lieu de naissance',
      'Sexe',
      'Situation familiale',
      'Société',
      'Dossier IPM',
      'Téléphone',
      'Adresse e-mail',
      'Adresse',
    ])
    const valeur = (cle: string) => infos.find((i) => i.cle === cle)?.valeur
    expect(valeur('nom')).toBe('Moustapha DIOP')
    expect(valeur('matricule')).toBe('1204')
    expect(valeur('naissance')).toBe('1 janv. 1962 · 64 ans')
    expect(valeur('lieu')).toBe('Dakar')
    expect(valeur('sexe')).toBe('Homme')
    expect(valeur('adresse')).toBe('Point E, Dakar')
  })

  it('donne toute la largeur aux rubriques longues', () => {
    const larges = informationsDuParticipant(unParticipant())
      .filter((i) => i.large)
      .map((i) => i.cle)
    expect(larges).toEqual(['nom', 'societe', 'email', 'adresse'])
  })

  it('appelle et écrit : le téléphone et le courriel portent leur lien', () => {
    const infos = informationsDuParticipant(unParticipant())
    expect(infos.find((i) => i.cle === 'telephone')?.lien).toBe('tel:771234567')
    expect(infos.find((i) => i.cle === 'email')?.lien).toBe('mailto:moustapha.diop@example.sn')
  })

  it('tait ce que l’IPM n’a pas renseigné', () => {
    const infos = informationsDuParticipant(
      unParticipant({
        telephone: null,
        email: null,
        adresse: null,
        lieuNaissance: null,
        situationFamiliale: null,
        sexe: '',
        etat: null,
      }),
    )
    expect(infos.map((i) => i.cle)).toEqual(['nom', 'matricule', 'naissance', 'societe'])
  })
})
