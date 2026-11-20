import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ErreurApi } from '../api'
import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'
import Identification from './Identification'

beforeAll(() => preparerIonic())

// Depuis la refonte, les deux champs sont des `input` natifs du vocabulaire
// des formulaires (ipm-formulaire), plus des ion-input.
const champ = (libelle: string | RegExp) => screen.getByLabelText(libelle) as HTMLInputElement
const saisirMatricule = (valeur: string) =>
  fireEvent.change(champ('Matricule'), { target: { value: valeur } })

function anonyme(surcharge: Parameters<typeof uneSession>[0] = {}) {
  return uneSession({ statut: 'anonyme', participant: null, beneficiaires: [], ...surcharge })
}

describe('Identification', () => {
  it('accueille l’employé', () => {
    rendreEcran(<Identification />, anonyme())
    expect(screen.getByRole('heading', { name: 'IPM-SAR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connexion' })).toBeInTheDocument()
    expect(screen.queryByText(/session a expiré/)).toBeNull()
  })

  it('ouvre sur le hero rouge à motif topographique, avec le logo de l’IPM', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    expect(container.querySelector('.identification__hero')).not.toBeNull()
    expect(container.querySelector('.identification__motif')).not.toBeNull()
    expect(screen.getByAltText('IPM')).toBeInTheDocument()
    expect(screen.queryByAltText('SAR')).toBeNull()
    // Ni bandeau de marque, ni feuille rapportée : l'écran est sur le fond
    // de l'application, comme tous les autres.
    expect(container.querySelector('.identification__banniere')).toBeNull()
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-carte--flottante')).toBeNull()
  })

  it('présente le matricule et le mot de passe, sans liste ni filet', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-list')).toBeNull()
    // Deux cadres : le matricule, et le mot de passe (affiché, pas encore vérifié).
    expect(container.querySelectorAll('.ipm-formulaire__cadre')).toHaveLength(2)
    expect(champ('Mot de passe')).toHaveAttribute('type', 'password')
  })

  it('le mot de passe n’est pas envoyé : la connexion reste au seul matricule', async () => {
    const session = anonyme()
    rendreEcran(<Identification />, session)
    saisirMatricule('949')
    fireEvent.change(champ('Mot de passe'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    await waitFor(() => expect(session.identifier).toHaveBeenCalled())
    expect(session.identifier).not.toHaveBeenCalledWith(expect.anything(), 'secret')
  })

  it('dit que la session a expiré', () => {
    rendreEcran(<Identification />, anonyme({ motifDeconnexion: 'expiree' }))
    expect(screen.getByText(/Votre session a expiré/)).toBeInTheDocument()
  })

  it('n’affiche aucun avis après une déconnexion volontaire', () => {
    rendreEcran(<Identification />, anonyme({ motifDeconnexion: 'volontaire' }))
    expect(screen.queryByText(/Vous êtes déconnecté/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('pas de phrase d’accueil, et le nom de l’institution sous le logo', () => {
    rendreEcran(<Identification />, anonyme())
    expect(screen.queryByText(/Saisissez votre matricule/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'IPM-SAR' })).toBeInTheDocument()
  })

  it('sans matricule, le réclame', async () => {
    const session = anonyme()
    rendreEcran(<Identification />, session)
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    // Le message s'affiche sous le cadre (§3.8), pas dans l'habillage d'Ionic.
    expect(await screen.findByText('Saisissez votre matricule.')).toBeInTheDocument()
    expect(session.identifier).not.toHaveBeenCalled()
  })

  it('identifie avec le matricule nettoyé, envoyé aussi comme mot de passe', async () => {
    const identifier = vi.fn((_matricule: string, _motDePasse: string) => Promise.resolve())
    rendreEcran(<Identification />, anonyme({ identifier }))
    saisirMatricule('01 0949')
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    await waitFor(() => expect(identifier).toHaveBeenCalledWith('01-0949', '01-0949'))
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
    rendreEcran(<Identification />, anonyme({ identifier }))
    saisirMatricule('0949')
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    const alerte = await screen.findByText('Matricule ou mot de passe incorrect.')
    expect(alerte.closest('[role="alert"]')).not.toBeNull()
  })

  it('va à l’essentiel : le titre, les champs, le bouton', () => {
    rendreEcran(<Identification />, anonyme())
    // Ni phrase d'introduction, ni lien d'aide, ni pied de page : l'écran
    // ne porte plus que ce qu'on y fait.
    expect(screen.queryByText(/Identifiez-vous pour demander/)).toBeNull()
    expect(screen.queryByText('Où trouver mon matricule ?')).toBeNull()
    expect(screen.queryByText(/IPM Mobile/)).toBeNull()
  })
})
