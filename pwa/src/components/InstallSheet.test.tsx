import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CLE_FERMETURE,
  ContenuInstallation,
  doitProposer,
  JOURS_AVANT_NOUVELLE_PROPOSITION,
  lireFermeture,
  memoriserFermeture,
  saisieEnCours,
} from './InstallSheet'

const JOUR = 86_400_000
const MAINTENANT = Date.UTC(2026, 8, 18, 10)

describe('doitProposer', () => {
  const base = {
    installee: false,
    plateforme: 'ios' as const,
    possible: false,
    fermeeLe: null,
    maintenant: MAINTENANT,
  }

  it('jamais dans l’application installée', () => {
    expect(doitProposer({ ...base, installee: true })).toBe(false)
    expect(doitProposer({ ...base, plateforme: 'android', possible: true, installee: true })).toBe(
      false,
    )
  })

  it('toujours sur iOS, sur Android seulement avec l’invitation du navigateur', () => {
    expect(doitProposer(base)).toBe(true)
    expect(doitProposer({ ...base, plateforme: 'android' })).toBe(false)
    expect(doitProposer({ ...base, plateforme: 'android', possible: true })).toBe(true)
    expect(doitProposer({ ...base, plateforme: 'autre' })).toBe(false)
  })

  it('pas avant quelques jours après un refus', () => {
    expect(doitProposer({ ...base, fermeeLe: MAINTENANT - JOUR })).toBe(false)
    expect(
      doitProposer({
        ...base,
        fermeeLe: MAINTENANT - (JOURS_AVANT_NOUVELLE_PROPOSITION + 1) * JOUR,
      }),
    ).toBe(true)
  })
})

describe('mémorisation du refus', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('relit la date enregistrée', () => {
    expect(lireFermeture()).toBeNull()
    memoriserFermeture(new Date(MAINTENANT))
    expect(lireFermeture()).toBe(MAINTENANT)
  })

  it('ignore une valeur illisible', () => {
    window.localStorage.setItem(CLE_FERMETURE, 'nimportequoi')
    expect(lireFermeture()).toBeNull()
  })

  it('ne plante pas si le stockage est interdit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => memoriserFermeture()).not.toThrow()
    expect(lireFermeture()).toBeNull()
  })
})

describe('saisieEnCours', () => {
  it('vrai seulement quand un champ a le focus', () => {
    expect(saisieEnCours()).toBe(false)
    const champ = document.createElement('input')
    document.body.appendChild(champ)
    champ.focus()
    expect(saisieEnCours()).toBe(true)
    champ.blur()
    expect(saisieEnCours()).toBe(false)
    champ.remove()
  })
})

describe('ContenuInstallation', () => {
  it('iOS : les trois étapes du partage, sans bouton « Installer »', () => {
    const onFermer = vi.fn()
    render(
      <ContenuInstallation
        plateforme="ios"
        possible={false}
        onInstaller={vi.fn()}
        onFermer={onFermer}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Installer IPM Mobile' })).toBeInTheDocument()
    expect(screen.getByText('Partager')).toBeInTheDocument()
    expect(screen.getAllByText('Sur l’écran d’accueil').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ajouter').length).toBeGreaterThan(0)
    expect(screen.queryByText('Installer')).toBeNull()
    fireEvent.click(screen.getByText('Compris'))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('Android : installation en un geste', () => {
    const onInstaller = vi.fn()
    const onFermer = vi.fn()
    render(
      <ContenuInstallation
        plateforme="android"
        possible
        onInstaller={onInstaller}
        onFermer={onFermer}
      />,
    )
    fireEvent.click(screen.getByText('Installer'))
    expect(onInstaller).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Plus tard'))
    expect(onFermer).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Partager')).toBeNull()
  })

  it('autre navigateur : passer par son menu', () => {
    render(
      <ContenuInstallation
        plateforme="autre"
        possible={false}
        onInstaller={vi.fn()}
        onFermer={vi.fn()}
      />,
    )
    expect(screen.getByText('Installer l’application')).toBeInTheDocument()
    expect(screen.queryByText('Installer')).toBeNull()
  })

  it('se referme par la croix', () => {
    const onFermer = vi.fn()
    render(
      <ContenuInstallation
        plateforme="ios"
        possible={false}
        onInstaller={vi.fn()}
        onFermer={onFermer}
      />,
    )
    fireEvent.click(screen.getByLabelText('Fermer'))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })
})
