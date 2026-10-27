/**
 * Barre d'actions du haut : les quatre actions qui ne dépendent d'aucun écran,
 * et les fenêtres qu'elles ouvrent.
 *
 * Ces vérifications vivaient dans Accueil.test.tsx, du temps où les boutons
 * étaient dans l'en-tête de l'accueil. Elles ont suivi les boutons.
 */

import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { unBeneficiaire, unParticipant } from '../test/fabriques'
import { preparerIonic, rendreEcran, uneSession } from '../pages/accueil/outils-test'
import BarreActions from './BarreActions'

// L'API et la réduction d'image sont simulées : c'est l'enchaînement de
// l'écran qui est vérifié (choisir → réduire → envoyer → rafraîchir).
const simulations = vi.hoisted(() => ({
  poserPhoto: vi.fn((_photo: string) => Promise.resolve({ photo: 'data:image/jpeg;base64,zz' })),
  poserPhotoBeneficiaire: vi.fn((_m: string, _photo: string) =>
    Promise.resolve({ photo: 'data:image/jpeg;base64,zz' }),
  ),
  reduirePhoto: vi.fn((_f: File) => Promise.resolve('data:image/jpeg;base64,zz')),
  demanderChangementPhoto: vi.fn((_m: string) => Promise.resolve({ demandePhoto: true })),
  listerNotifications: vi.fn(() => Promise.resolve([] as unknown[])),
}))

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>()
  return {
    ...reel,
    poserPhoto: simulations.poserPhoto,
    poserPhotoBeneficiaire: simulations.poserPhotoBeneficiaire,
    demanderChangementPhoto: simulations.demanderChangementPhoto,
    listerNotifications: simulations.listerNotifications,
  }
})

vi.mock('../utils/photo', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../utils/photo')>()
  return { ...reel, reduirePhoto: simulations.reduirePhoto }
})

// La fenêtre est simulée : Ionic ne sait pas la présenter sous jsdom (il lui
// manque son « framework delegate »). Le vrai composant est couvert par
// composants.test.tsx.
vi.mock('./Feuille', () => ({
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

beforeEach(() => {
  simulations.poserPhoto.mockClear()
  simulations.poserPhotoBeneficiaire.mockClear()
  simulations.reduirePhoto.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('barre d’actions', () => {
  it('porte les quatre actions, à parts égales', () => {
    const { container } = rendreEcran(<BarreActions />)
    const boutons = container.querySelectorAll('.ipm-barre-actions__bouton')
    expect(boutons).toHaveLength(4)
    expect(Array.from(boutons).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Passer en mode sombre',
      'Photos d’identité',
      'Notifications',
      'Mon profil',
    ])
  })

  it('porte des icônes pleines, comme la barre du bas', () => {
    // La barre du bas rend le variant plein en mode Material : la barre du
    // haut ne doit pas lui répondre avec des icônes au trait.
    const { container } = rendreEcran(<BarreActions />)
    const icones = container.querySelectorAll('.ipm-barre-actions__bouton ion-icon')
    expect(icones).toHaveLength(4)
    for (const icone of icones) {
      expect(icone.getAttribute('icon')).not.toMatch(/outline/)
    }
  })

  it('propose de passer en sombre tant qu’on est en clair', () => {
    rendreEcran(<BarreActions />)
    expect(screen.getByLabelText('Passer en mode sombre')).toBeInTheDocument()
  })

  it('la cloche n’est jamais inerte : elle ouvre une feuille', () => {
    rendreEcran(<BarreActions />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.getByRole('dialog')).toHaveTextContent('aucune notification')
  })

  it('la cloche porte les décisions de l’IPM, et les marque lues à l’ouverture', async () => {
    localStorage.clear()
    simulations.listerNotifications.mockResolvedValue([
      {
        id: 'optique-40',
        genre: 'bon-optique',
        titre: 'Bon d’optique accordé',
        message: 'Le bon BCI000040 est accordé.',
        date: '2026-10-27T10:00:00+00:00',
        lien: '/bons/optique/40',
      },
    ])
    const { container } = rendreEcran(<BarreActions />)
    await vi.waitFor(() =>
      expect(container.querySelector('.ipm-barre-actions__pastille')?.textContent).toBe('1'),
    )
    fireEvent.click(screen.getByLabelText('Notifications : 1 nouvelle'))
    expect(await screen.findByText('Bon d’optique accordé')).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(container.querySelector('.ipm-barre-actions__pastille')).toBeNull(),
    )
    simulations.listerNotifications.mockResolvedValue([])
    localStorage.clear()
  })

  it('choisit, réduit et envoie une photo depuis la feuille « Photos »', async () => {
    const { container } = rendreEcran(<BarreActions />)
    fireEvent.click(screen.getByLabelText('Photos d’identité'))
    const champ = container.querySelector('.photos__fichier') as HTMLInputElement
    const fichier = new File(['xxx'], 'moi.jpg', { type: 'image/jpeg' })
    fireEvent.change(champ, { target: { files: [fichier] } })

    await vi.waitFor(() => expect(simulations.poserPhoto).toHaveBeenCalledTimes(1))
    // Réduite avant l'envoi : le serveur refuse au-delà de 400 Ko.
    expect(simulations.reduirePhoto).toHaveBeenCalledWith(fichier)
    expect(simulations.poserPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,zz')
  })

  it('une photo enregistrée ne se remplace pas : on demande son changement', async () => {
    // Une photo ne se pose qu'une fois : « Changer » envoie une demande de
    // réinitialisation, que l'IPM instruit depuis son application.
    const session = uneSession({
      participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }),
    })
    const { container } = rendreEcran(<BarreActions />, session)
    fireEvent.click(screen.getByLabelText('Photos d’identité'))
    const ligne = container.querySelector('.photos__ligne') as HTMLElement
    expect(within(ligne).queryByText('Ajouter')).toBeNull()
    fireEvent.click(within(ligne).getByText('Changer'))
    await vi.waitFor(() => expect(simulations.demanderChangementPhoto).toHaveBeenCalledTimes(1))
    expect(simulations.demanderChangementPhoto).toHaveBeenCalledWith(session.participant?.matricule)
    await vi.waitFor(() => expect(session.rafraichir).toHaveBeenCalled())
  })

  it('une demande en attente se dit, sans rien proposer d’autre', () => {
    const { container } = rendreEcran(
      <BarreActions />,
      uneSession({
        participant: unParticipant({ photo: 'data:image/jpeg;base64,aa', demandePhoto: true }),
      }),
    )
    fireEvent.click(screen.getByLabelText('Photos d’identité'))
    const ligne = container.querySelector('.photos__ligne') as HTMLElement
    expect(within(ligne).getByText('Demande envoyée')).toBeInTheDocument()
    expect(within(ligne).queryByText('Changer')).toBeNull()
  })

  it('envoie la photo d’un ayant droit depuis la même feuille', async () => {
    const { container } = rendreEcran(
      <BarreActions />,
      uneSession({
        beneficiaires: [
          unBeneficiaire(),
          unBeneficiaire({ matricule: '1204-01', estParticipant: false }),
        ],
      }),
    )
    fireEvent.click(screen.getByLabelText('Photos d’identité'))
    // Deuxième ligne : l'ayant droit (la première est le titulaire).
    const lignes = container.querySelectorAll('.photos__ligne')
    expect(lignes).toHaveLength(2)
    fireEvent.click(within(lignes[1] as HTMLElement).getByText('Ajouter'))
    const champ = container.querySelector('.photos__fichier') as HTMLInputElement
    fireEvent.change(champ, {
      target: { files: [new File(['x'], 'enfant.jpg', { type: 'image/jpeg' })] },
    })

    await vi.waitFor(() => expect(simulations.poserPhotoBeneficiaire).toHaveBeenCalledTimes(1))
    expect(simulations.poserPhotoBeneficiaire).toHaveBeenCalledWith(
      '1204-01',
      'data:image/jpeg;base64,zz',
    )
    expect(simulations.poserPhoto).not.toHaveBeenCalled()
  })

  it('mène au profil, où se trouve la déconnexion', async () => {
    rendreEcran(<BarreActions />)
    fireEvent.click(screen.getByLabelText('Mon profil'))
    await vi.waitFor(() => expect(window.location.pathname).toBe('/profil'))
    expect(screen.queryByLabelText('Se déconnecter')).toBeNull()
    window.history.replaceState(null, '', '/')
  })
})
