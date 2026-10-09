import { describe, expect, it } from 'vitest'

import { documentParCle } from '../../services/catalogue'
import { unBon } from '../../test/fabriques'
import { libelleBeneficiaire, nomPropre, typeDocument } from './affichage'

describe('nomPropre', () => {
  it('adoucit les majuscules d’IPM, particules en minuscules', () => {
    expect(nomPropre('PHARMACIE DE LA GARE')).toBe('Pharmacie de la Gare')
    expect(nomPropre("PHARMACIE N'DIAYE")).toBe("Pharmacie N'Diaye")
    expect(nomPropre('DE LA SOURCE')).toBe('De la Source')
  })

  it('garde les sigles', () => {
    expect(nomPropre('IPM SAR PERSONNEL MOO')).toBe('IPM SAR Personnel Moo')
    expect(nomPropre('CLINIQUE SAR')).toBe('Clinique SAR')
    expect(nomPropre('CABINET SCP')).toBe('Cabinet SCP')
  })

  it('laisse un libellé déjà en casse mixte, et gère le vide', () => {
    expect(nomPropre('Pharmacie du Port')).toBe('Pharmacie du Port')
    expect(nomPropre(null)).toBe('')
    expect(nomPropre('  ')).toBe('')
  })
})

describe('libelleBeneficiaire', () => {
  it('nom et lien', () => {
    expect(libelleBeneficiaire(unBon())).toBe('Moustapha DIOP · Titulaire')
    expect(
      libelleBeneficiaire(
        unBon({ beneficiaire: { matricule: '1', nomComplet: 'AWA DIOP', type: null } }),
      ),
    ).toBe('Awa Diop')
    expect(libelleBeneficiaire(unBon({ beneficiaire: null }))).toBe('Bénéficiaire inconnu')
  })

  it('même lien que l’accueil et le profil, accents compris, sans connaître le sexe', () => {
    const epouse = unBon({
      beneficiaire: {
        matricule: '2',
        nomComplet: 'NDEYE KANE',
        type: { code: '2', libelle: 'EPOUSE' },
      },
    })
    expect(libelleBeneficiaire(epouse)).toBe('Ndeye Kane · Épouse')
  })
})

describe('typeDocument', () => {
  it('donne le type affiché par la carte, pris dans le catalogue', () => {
    const type = typeDocument(unBon())
    expect(type.libelle).toBe('Bon de pharmacie')
    // Même icône que la carte de service de l'accueil : un seul catalogue.
    expect(type.icone).toBe(documentParCle('bon-pharmacie')?.icone)
  })
})
