import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { VERSION } from '../version'
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
    // Elle ouvre l'écran, les réglages suivent.
    const titres = Array.from(container.querySelectorAll('.ipm-titre-section')).map(
      (t) => t.textContent,
    )
    expect(titres.slice(0, 2)).toEqual(['Mes informations', 'Réglages'])
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

  it('ne liste plus la famille : ses cartes se touchent depuis l’accueil', () => {
    const { container } = rendreEcran(<Profil />)
    expect(screen.queryByText(/Ma famille/)).toBeNull()
    expect(screen.queryByText('Conjointe · 58 ans · 1204-01')).toBeNull()
    // Ni la carte d'ayant droit en plein écran, qui part avec elle.
    expect(container.querySelector('.carte-plein')).toBeNull()
    // Toujours pas de liste Ionic à filets pleine largeur (§1).
    expect(container.querySelector('ion-item')).toBeNull()
  })

  it('donne accès à l’assistance, qui n’a pas d’onglet', () => {
    // Elle a quitté l'accueil avec la rangée de raccourcis : sans cette carte,
    // l'écran serait injoignable.
    rendreEcran(<Profil />)
    expect(screen.getByText('Assistance')).toBeInTheDocument()
  })

  it('affiche la version de l’application sur la carte « À propos »', () => {
    rendreEcran(<Profil />)
    expect(screen.getByText('À propos')).toBeInTheDocument()
    expect(screen.getByText(VERSION)).toBeInTheDocument()
  })

  it('mène à l’écran « À propos », comme à l’assistance', async () => {
    rendreEcran(<Profil />)
    fireEvent.click(screen.getByText('À propos'))
    await waitFor(() => expect(window.location.pathname).toBe('/a-propos'))
    window.history.replaceState(null, '', '/')
  })

  it('mène à l’écran d’installation, comme à l’assistance', async () => {
    rendreEcran(<Profil />)
    fireEvent.click(await screen.findByText('Installer sur l’écran d’accueil'))
    await waitFor(() => expect(window.location.pathname).toBe('/installation'))
    window.history.replaceState(null, '', '/')
  })

  it('demande confirmation avant de se déconnecter', async () => {
    const session = uneSession()
    rendreEcran(<Profil />, session)
    fireEvent.click(await screen.findByText('Se déconnecter'))

    // La question, dans une feuille : rien n'est encore effacé.
    const feuille = screen.getByRole('dialog')
    expect(feuille).toHaveTextContent('Se déconnecter d’IPM Mobile ?')
    expect(session.deconnecter).not.toHaveBeenCalled()
    expect(within(feuille).getByText('Annuler')).toBeInTheDocument()

    fireEvent.click(within(feuille).getByText('Se déconnecter'))
    expect(session.deconnecter).toHaveBeenCalledWith('volontaire')
  })
})
