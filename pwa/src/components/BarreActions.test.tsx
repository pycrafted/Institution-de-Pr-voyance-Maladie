/**
 * Barre d'actions du haut : les actions qui ne dépendent d'aucun écran, et où
 * elles mènent.
 *
 * Ces vérifications vivaient dans Accueil.test.tsx, du temps où les boutons
 * étaient dans l'en-tête de l'accueil. Elles ont suivi les boutons.
 *
 * L'envoi des photos n'est plus ici : « Photos d'identité » ouvrait une
 * feuille, c'est devenu un lien vers la page /identite, et ses trois tests
 * l'ont suivie (pages/Identite.test.tsx).
 */

import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { ReactNode } from 'react'

import { preparerIonic, rendreEcran, uneSession } from '../pages/accueil/outils-test'
import BarreActions from './BarreActions'

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
