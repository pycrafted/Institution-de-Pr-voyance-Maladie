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
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(screen.getByText('Institution de Prévoyance Maladie')).toBeInTheDocument()
    expect(screen.getByText('Continuer')).toBeInTheDocument()
    expect(screen.queryByText(/session a expiré/)).toBeNull()
  })

  it('ouvre sur l’aperçu de la carte d’adhérent, vierge', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    expect(container.querySelectorAll('.identification__carte')).toHaveLength(2)
    expect(screen.getByAltText('SAR')).toBeInTheDocument()
    // Ni bandeau de marque, ni feuille rapportée : l'écran est sur le fond
    // de l'application, comme tous les autres.
    expect(container.querySelector('.identification__banniere')).toBeNull()
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.ipm-carte--flottante')).toBeNull()
  })

  it('présente le seul champ matricule, sans liste ni filet', () => {
    const { container } = rendreEcran(<Identification />, anonyme())
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelector('ion-list')).toBeNull()
    // Un seul cadre : le matricule (il sert aussi de mot de passe).
    expect(container.querySelectorAll('.ipm-formulaire__cadre')).toHaveLength(1)
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

  it('accueille d’une ligne, et signe du nom de l’institution', () => {
    rendreEcran(<Identification />, anonyme())
    expect(
      screen.getByText('Saisissez votre matricule pour accéder à vos documents IPM.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Institution de Prévoyance Maladie')).toBeInTheDocument()
  })

  it('sans matricule, le réclame', async () => {
    const session = anonyme()
    rendreEcran(<Identification />, session)
    fireEvent.click(screen.getByText('Continuer'))
    // Le message s'affiche sous le cadre (§3.8), pas dans l'habillage d'Ionic.
    expect(await screen.findByText('Saisissez votre matricule.')).toBeInTheDocument()
    expect(session.identifier).not.toHaveBeenCalled()
  })

  it('identifie avec le matricule nettoyé, envoyé aussi comme mot de passe', async () => {
    const identifier = vi.fn((_matricule: string, _motDePasse: string) => Promise.resolve())
    rendreEcran(<Identification />, anonyme({ identifier }))
    saisirMatricule('01 0949')
    fireEvent.click(screen.getByText('Continuer'))
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
    fireEvent.click(screen.getByText('Continuer'))
    const alerte = await screen.findByText('Matricule ou mot de passe incorrect.')
    expect(alerte.closest('[role="alert"]')).not.toBeNull()
  })

  it('va à l’essentiel : le logo, le titre, le champ matricule, le bouton', () => {
    rendreEcran(<Identification />, anonyme())
    // Ni phrase d'introduction, ni lien d'aide, ni pied de page : l'écran
    // ne porte plus que ce qu'on y fait.
    expect(screen.queryByText(/Identifiez-vous pour demander/)).toBeNull()
    expect(screen.queryByText('Où trouver mon matricule ?')).toBeNull()
    expect(screen.queryByText(/mot de passe vous est remis/)).toBeNull()
    expect(screen.queryByText(/IPM Mobile/)).toBeNull()
  })
})
