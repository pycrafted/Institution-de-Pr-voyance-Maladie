import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  basculerApparence,
  changerApparence,
  reinitialiserApparence,
  useApparence,
} from './apparence'

const racine = () => document.documentElement

afterEach(() => {
  localStorage.clear()
  reinitialiserApparence()
})

describe('apparence', () => {
  it('est claire par défaut, quel que soit le réglage du téléphone', () => {
    localStorage.clear()
    reinitialiserApparence()
    const { result } = renderHook(() => useApparence())
    expect(result.current).toBe('clair')
    expect(racine()).not.toHaveClass('ion-palette-dark')
  })

  it('bascule en sombre, et garde le choix pour le prochain lancement', () => {
    const { result } = renderHook(() => useApparence())
    act(() => basculerApparence())
    expect(result.current).toBe('sombre')
    expect(racine()).toHaveClass('ion-palette-dark')
    expect(localStorage.getItem('ipm.apparence')).toBe('sombre')

    reinitialiserApparence()
    expect(racine()).toHaveClass('ion-palette-dark')
  })

  it('revient au clair', () => {
    changerApparence('sombre')
    const { result } = renderHook(() => useApparence())
    act(() => basculerApparence())
    expect(result.current).toBe('clair')
    expect(racine()).not.toHaveClass('ion-palette-dark')
  })
})
