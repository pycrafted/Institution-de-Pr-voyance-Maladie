import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'
import Profil from './Profil'

// Ionic ne sait pas présenter une fenêtre sous jsdom (framework delegate
// absent) : la feuille « À propos » est simulée, le vrai composant étant
// couvert par components/composants.test.tsx.
vi.mock('../components/Feuille', () => ({
  default: ({
    ouverte,
    titre,
    children,
  }: {
    ouverte: boolean
    titre?: ReactNode
    children: ReactNode
  }) =>
    ouverte ? (
      <div role="dialog" aria-label="Feuille">
        {titre}
        {children}
      </div>
    ) : null,
}))

beforeAll(() => preparerIonic())

describe('Profil', () => {
  it('ne répète pas la carte d’adhérent : elle est à l’accueil', () => {
    const { container } = rendreEcran(<Profil />)
    expect(container.querySelector('.ipm-carte-identite')).toBeNull()
    // Ni l'identité, ni le portrait, ni son sélecteur de fichier.
    expect(screen.queryByLabelText(/ma photo/i)).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    // L'écran commence par les informations de l'employé.
    expect(screen.getByText('Mes informations')).toBeInTheDocument()
  })

  it('détaille les informations de l’employé en tête d’écran', () => {
    const { container } = rendreEcran(<Profil />)
    // Plus de puces sous une carte : une rubrique par ligne.
    expect(container.querySelector('.profil__reperes')).toBeNull()
    expect(screen.getByText('Mes informations')).toBeInTheDocument()
    const infos = container.querySelector('.profil__infos') as HTMLElement
    expect(within(infos).getByText('Moustapha DIOP')).toBeInTheDocument()
    expect(within(infos).getByText('1204')).toBeInTheDocument()
    expect(within(infos).getByText('Homme')).toBeInTheDocument()
    expect(within(infos).getByText('1 janv. 1962 · 64 ans')).toBeInTheDocument()
    // Le téléphone et le courriel se touchent.
    expect(within(infos).getByText('77 123 45 67').closest('a')).toHaveAttribute(
      'href',
      'tel:771234567',
    )
    // Elle ouvre l'écran ; les réglages suivent (les ayants droit sont sur l'accueil).
    const titres = Array.from(container.querySelectorAll('.ipm-titre-section')).map(
      (t) => t.textContent,
    )
    expect(titres).toEqual(['Mes informations', 'Ayants droit', 'Réglages'])
  })

  it('ouvre l’écran directement sur ses sections, sans en-tête ni toolbar ni liste à filets', () => {
    const { container } = rendreEcran(<Profil />)
    // Plus d'en-tête du tout : ni bandeau sombre, ni grand titre.
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-entete')).toBeNull()
    // §1 : ni gros titre noir sur fond gris, ni ion-item, ni ion-list.
    expect(container.querySelector('ion-toolbar')).toBeNull()
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-list')).toBeNull()
  })

  it('montre les ayants droit, chacun en carte avec sa photo ou ses initiales', () => {
    // La fabrique donne le titulaire + une conjointe : seule la conjointe est
    // un ayant droit.
    const { container } = rendreEcran(<Profil />)
    expect(screen.getByText('Ayants droit')).toBeInTheDocument()
    expect(screen.getByText('Awa DIOP')).toBeInTheDocument()
    expect(container.querySelectorAll('.ipm-pile .ipm-avatar').length).toBeGreaterThanOrEqual(1)
  })

  it('n’affiche pas la section sans ayant droit', () => {
    rendreEcran(<Profil />, uneSession({ beneficiaires: [] }))
    expect(screen.queryByText('Ayants droit')).toBeNull()
  })

  it('ne propose plus « Assistance » ni « À propos »', () => {
    rendreEcran(<Profil />)
    expect(screen.queryByText('Assistance')).toBeNull()
    expect(screen.queryByText('À propos')).toBeNull()
  })

  it('« Télécharger l’application » : sans invitation du navigateur, mène aux explications', async () => {
    rendreEcran(<Profil />)
    fireEvent.click(await screen.findByText('Télécharger l’application'))
    await waitFor(() => expect(window.location.pathname).toBe('/telecharger'))
    window.history.replaceState(null, '', '/')
  })

  it('déconnecte aussitôt, sans question', async () => {
    const session = uneSession()
    rendreEcran(<Profil />, session)
    fireEvent.click(await screen.findByText('Se déconnecter'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.deconnecter).toHaveBeenCalledWith('volontaire')
  })
})
