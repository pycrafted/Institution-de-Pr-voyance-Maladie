import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ErreurApi } from '../../api'
import {
  matriculePourEnvoi,
  nettoyerMatricule,
  useFormulaireIdentification,
  verifierMatricule,
  verifierMotDePasse,
} from './formulaire'

describe('nettoyerMatricule', () => {
  it('ne garde que les chiffres et un tiret', () => {
    expect(nettoyerMatricule('1204')).toBe('1204')
    expect(nettoyerMatricule('01-1204')).toBe('01-1204')
    expect(nettoyerMatricule('a1b2c')).toBe('12')
  })

  it('change les séparateurs courants en tiret', () => {
    expect(nettoyerMatricule('01 1204')).toBe('01-1204')
    expect(nettoyerMatricule('01.1204')).toBe('01-1204')
    expect(nettoyerMatricule('01/1204')).toBe('01-1204')
    expect(nettoyerMatricule('01–1204')).toBe('01-1204')
    expect(nettoyerMatricule('01 -  1204')).toBe('01-1204')
  })

  it('garde le tiret final pendant la frappe, pas le tiret initial', () => {
    expect(nettoyerMatricule('01-')).toBe('01-')
    expect(nettoyerMatricule(' 1204')).toBe('1204')
    expect(matriculePourEnvoi('01-')).toBe('01')
  })

  it('coupe une saisie démesurée', () => {
    expect(nettoyerMatricule('1'.repeat(40))).toHaveLength(20)
  })
})

describe('verifierMatricule', () => {
  it('exige un matricule en chiffres', () => {
    expect(verifierMatricule('')).toBe('Saisissez votre matricule.')
    expect(verifierMatricule('1204')).toBeUndefined()
    expect(verifierMatricule('01-1204')).toBeUndefined()
    expect(verifierMatricule('01-12-04')).toMatch(/en chiffres/)
  })
})

describe('verifierMotDePasse', () => {
  it('exige un mot de passe, sans en juger la forme (le serveur décide)', () => {
    expect(verifierMotDePasse('')).toBe('Saisissez votre mot de passe.')
    expect(verifierMotDePasse('0000')).toBeUndefined()
  })
})

describe('useFormulaireIdentification', () => {
  it('ne montre les erreurs qu’après une tentative, et n’appelle pas le serveur si incomplet', async () => {
    const identifier = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useFormulaireIdentification(identifier))
    expect(result.current.erreurs).toEqual({})
    expect(result.current.controle.matricule).toBe('Saisissez votre matricule.')

    let issue = ''
    await act(async () => {
      issue = await result.current.envoyer()
    })
    expect(issue).toBe('invalide')
    expect(identifier).not.toHaveBeenCalled()
    expect(result.current.erreurs.matricule).toBe('Saisissez votre matricule.')
    expect(result.current.erreurs.motDePasse).toBe('Saisissez votre mot de passe.')
  })

  it('envoie le matricule nettoyé et le mot de passe', async () => {
    const identifier = vi.fn((_matricule: string, _motDePasse: string) => Promise.resolve())
    const { result } = renderHook(() => useFormulaireIdentification(identifier))
    act(() => {
      result.current.changerMatricule('01 1204-')
      result.current.changerMotDePasse('0000')
    })
    expect(result.current.matricule).toBe('01-1204-')

    let issue = ''
    await act(async () => {
      issue = await result.current.envoyer()
    })
    expect(issue).toBe('ok')
    expect(identifier).toHaveBeenCalledWith('01-1204', '0000')
    expect(result.current.envoi).toBe(false)
  })

  it('affiche le message du serveur, et l’efface dès qu’on corrige', async () => {
    const identifier = vi.fn(() =>
      Promise.reject(
        new ErreurApi('non-autorise', {
          statut: 401,
          message: 'Matricule ou mot de passe incorrect.',
        }),
      ),
    )
    const { result } = renderHook(() => useFormulaireIdentification(identifier))
    act(() => {
      result.current.changerMatricule('1204')
      result.current.changerMotDePasse('0001')
    })

    let issue = ''
    await act(async () => {
      issue = await result.current.envoyer()
    })
    expect(issue).toBe('refuse')
    expect(result.current.erreurServeur).toBe('Matricule ou mot de passe incorrect.')

    act(() => result.current.changerMotDePasse('0000'))
    expect(result.current.erreurServeur).toBeNull()
  })

  it('ignore une requête annulée', async () => {
    const identifier = vi.fn(() => Promise.reject(new ErreurApi('annulee')))
    const { result } = renderHook(() => useFormulaireIdentification(identifier))
    act(() => {
      result.current.changerMatricule('1204')
      result.current.changerMotDePasse('0000')
    })
    let issue = ''
    await act(async () => {
      issue = await result.current.envoyer()
    })
    expect(issue).toBe('annule')
    expect(result.current.erreurServeur).toBeNull()
  })

  it('refuse un second envoi pendant le premier', async () => {
    let terminer: () => void = () => {}
    const identifier = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          terminer = resolve
        }),
    )
    const { result } = renderHook(() => useFormulaireIdentification(identifier))
    act(() => {
      result.current.changerMatricule('1204')
      result.current.changerMotDePasse('0000')
    })

    let premier: Promise<string> = Promise.resolve('')
    act(() => {
      premier = result.current.envoyer()
    })
    let second = ''
    await act(async () => {
      second = await result.current.envoyer()
    })
    expect(second).toBe('occupe')
    await act(async () => {
      terminer()
      await premier
    })
    expect(identifier).toHaveBeenCalledTimes(1)
  })
})
