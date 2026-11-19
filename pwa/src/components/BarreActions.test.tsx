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
}))

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>()
  return {
    ...reel,
    poserPhoto: simulations.poserPhoto,
    poserPhotoBeneficiaire: simulations.poserPhotoBeneficiaire,
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

describe('barre du haut', () => {
  it('porte toutes les actions en accès direct, réparties sur la barre', () => {
    const { container } = rendreEcran(<BarreActions />)
    // Les actions sont des icônes posées à même la barre, sans titre ni menu.
    expect(container.querySelector('.ipm-navbar__titre')).toBeNull()
    expect(screen.queryByLabelText('Menu')).toBeNull()
    const boutons = container.querySelectorAll('.ipm-navbar__icone')
    expect(boutons).toHaveLength(3)
    expect(screen.getByLabelText('Photos d’identité')).toBeInTheDocument()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
    // « Profil » remplace « Quitter » ; déconnexion ET apparence sont dans Profil.
    expect(screen.getByLabelText('Mon profil')).toBeInTheDocument()
    expect(screen.queryByLabelText('Se déconnecter')).toBeNull()
    expect(screen.queryByLabelText('Passer en mode sombre')).toBeNull()
  })

  it('porte des icônes au trait, sans libellé visible, posées sur la page', () => {
    const { container } = rendreEcran(<BarreActions />)
    const icones = container.querySelectorAll('.ipm-navbar__icone ion-icon')
    expect(icones).toHaveLength(3)
    expect(container.querySelector('.ipm-navbar__libelle')).toBeNull()
  })

  it('la cloche mène à la page Notifications, sans ouvrir de feuille', () => {
    // La cloche n'ouvre plus une feuille « aucune notification » inerte : elle
    // mène à une page à part entière (/notifications), comme « Identité ».
    rendreEcran(<BarreActions />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('n’offre plus d’ajouter une photo déjà enregistrée', () => {
    // Une photo ne se pose qu'une fois : la ligne devient un constat, et
    // seule l'IPM peut la réinitialiser depuis son application.
    const { container } = rendreEcran(
      <BarreActions />,
      uneSession({ participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }) }),
    )
    fireEvent.click(screen.getByLabelText('Photos d’identité'))
    const ligne = container.querySelector('.photos__ligne') as HTMLElement
    expect(within(ligne).getByText('Enregistrée')).toBeInTheDocument()
    expect(within(ligne).queryByText('Ajouter')).toBeNull()
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

  it('mène au profil, sans jamais déconnecter depuis la barre', () => {
    const session = uneSession()
    rendreEcran(<BarreActions />, session)
    // Le bouton « Profil » ne doit pas ouvrir de fenêtre de déconnexion : la
    // déconnexion vit désormais dans l'écran Profil, avec sa confirmation.
    fireEvent.click(screen.getByLabelText('Mon profil'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.deconnecter).not.toHaveBeenCalled()
  })
})
