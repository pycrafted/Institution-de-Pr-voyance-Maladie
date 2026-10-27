import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { changerApparence } from '../theme/apparence'
import Splash, { FOND_LANCEMENT, FOND_LANCEMENT_SOMBRE } from './Splash'

function ajouterMeta(couleur: string, media: string): HTMLMetaElement {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = couleur
  meta.media = media
  document.head.appendChild(meta)
  return meta
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
})

describe('Splash', () => {
  it('annonce le chargement aux lecteurs d’écran', () => {
    render(<Splash />)
    expect(screen.getByRole('progressbar', { name: "Chargement d'IPM Mobile" })).toBeInTheDocument()
  })

  it('teinte la barre d’état aux couleurs de la marque le temps du lancement, puis la rend', () => {
    const clair = ajouterMeta('#f7f5f3', '(prefers-color-scheme: light)')
    const sombre = ajouterMeta('#161413', '(prefers-color-scheme: dark)')
    const { unmount } = render(<Splash />)
    expect(clair.content).toBe(FOND_LANCEMENT)
    expect(sombre.content).toBe(FOND_LANCEMENT)
    unmount()
    expect(clair.content).toBe('#f7f5f3')
    expect(sombre.content).toBe('#161413')
  })

  it('suit le mode sombre choisi dans l’application', () => {
    const meta = ajouterMeta('#f7f5f3', '(prefers-color-scheme: light)')
    changerApparence('sombre')
    const { unmount } = render(<Splash />)
    expect(meta.content).toBe(FOND_LANCEMENT_SOMBRE)
    expect(document.documentElement).toHaveClass('ion-palette-dark')
    unmount()
    changerApparence('clair')
    localStorage.clear()
  })
})
