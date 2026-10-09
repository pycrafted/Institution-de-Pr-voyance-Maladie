import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { ErreurApi } from '../api'
import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'
import Identification from './Identification'

// La feuille est simulée : Ionic ne sait pas présenter une fenêtre sous jsdom
// (il lui manque son « framework delegate »). Le vrai composant est couvert
// par components/composants.test.tsx.
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

function saisir(container: HTMLElement, rang: number, valeur: string) {
  const champ = container.querySelectorAll('ion-input')[rang]
  if (!champ) throw new Error('Champ absent')
  fireEvent(champ, new CustomEvent('ionInput', { detail: { value: valeur } }))
}
const saisirMatricule = (container: HTMLElement, valeur: string) => saisir(container, 0, valeur)
const saisirMotDePasse = (container: HTMLElement, valeur: string) => saisir(container, 1, valeur)

function anonyme(surcharge: Parameters<typeof uneSession>[0] = {}) {
  return uneSession({ statut: 'anonyme', participant: null, beneficiaires: [], ...surcharge })
}

describe('Identification', () => {
  it('accueille l’employé', () => {
    rendreEcran(<Identification />, anonyme())
    expect(screen.getByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument()
    expect(screen.getByText('Continuer')).toBeInTheDocument()
    expect(screen.queryByText(/session a expiré/)).toBeNull()
  })

  it('ouvre l’écran par un bandeau de marque, chevauché par une carte blanche', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    // §1 : plus d'écran entièrement gris-blanc, une surface de marque d'abord.
    const bandeau = container.querySelector('.ipm-bandeau')
    expect(bandeau).toHaveClass('ipm-bandeau--plein', 'ipm-bandeau--chevauche')
    expect(screen.getByRole('heading', { name: 'IPM Mobile' })).toBeInTheDocument()
    const chevauchement = container.querySelector('.identification__chevauchement')
    expect(chevauchement?.querySelector('.ipm-carte--flottante')).not.toBeNull()
  })

  it('présente les deux champs sans liste ni filet', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    // §1 : le filet gris entre les deux champs, c'est exactement ce que la
    // refonte supprime. Plus d'ion-item ni d'ion-list sur cet écran.
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-list')).toBeNull()
    // Deux cadres de champ de la charte : le matricule et le mot de passe.
    expect(container.querySelectorAll('.ipm-champ__cadre')).toHaveLength(2)
  })

  it('dit que la session a expiré', () => {
    rendreEcran(<Identification />, anonyme({ motifDeconnexion: 'expiree' }))
    expect(screen.getByText(/Votre session a expiré/)).toBeInTheDocument()
  })

  it('confirme une déconnexion volontaire', () => {
    rendreEcran(<Identification />, anonyme({ motifDeconnexion: 'volontaire' }))
    expect(screen.getByText(/Vous êtes déconnecté/)).toBeInTheDocument()
  })

  it('sans mot de passe, le réclame au lieu d’appeler le serveur', async () => {
    const session = anonyme()
    const { container } = rendreEcran(<Identification />, session)
    saisirMatricule(container, '0949')
    fireEvent.click(screen.getByText('Continuer'))
    expect(await screen.findByText('Saisissez votre mot de passe.')).toBeInTheDocument()
    expect(session.identifier).not.toHaveBeenCalled()
  })

  it('masque le mot de passe à la saisie', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    expect(container.querySelectorAll('ion-input')[1]).toHaveAttribute('type', 'password')
  })

  it('sans matricule, le réclame', async () => {
    const session = anonyme()
    rendreEcran(<Identification />, session)
    fireEvent.click(screen.getByText('Continuer'))
    // Le message s'affiche sous le cadre (§3.8), pas dans l'habillage d'Ionic.
    expect(await screen.findByText('Saisissez votre matricule.')).toBeInTheDocument()
    expect(session.identifier).not.toHaveBeenCalled()
  })

  it('identifie avec le matricule nettoyé et le mot de passe', async () => {
    const identifier = vi.fn((_matricule: string, _motDePasse: string) => Promise.resolve())
    const { container } = rendreEcran(<Identification />, anonyme({ identifier }))
    saisirMatricule(container, '01 0949')
    saisirMotDePasse(container, '0000')
    fireEvent.click(screen.getByText('Continuer'))
    await waitFor(() => expect(identifier).toHaveBeenCalledWith('01-0949', '0000'))
  })

  it('montre le refus du serveur', async () => {
    const identifier = vi.fn(() =>
      Promise.reject(
        new ErreurApi('non-autorise', {
          statut: 401,
          message: 'Matricule ou mot de passe incorrect.',
        }),
      ),
    )
    const { container } = rendreEcran(<Identification />, anonyme({ identifier }))
    saisirMatricule(container, '0949')
    saisirMotDePasse(container, '0001')
    fireEvent.click(screen.getByText('Continuer'))
    const alerte = await screen.findByText('Matricule ou mot de passe incorrect.')
    expect(alerte.closest('[role="alert"]')).not.toBeNull()
  })

  it('explique le matricule dans une feuille', () => {
    rendreEcran(<Identification />, anonyme())
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Où trouver mon matricule ?'))
    expect(screen.getByRole('dialog')).toHaveTextContent(/carte IPM/)
  })
})
