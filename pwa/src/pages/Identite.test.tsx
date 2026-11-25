/**
 * Écran « Identité » (/identite) : la liste des photos, et l'envoi d'une photo.
 *
 * Ces vérifications vivaient dans BarreActions.test.tsx, du temps où les
 * photos s'ouvraient en feuille depuis la barre du haut. La feuille est
 * devenue une page, le bouton de la barre un simple lien vers elle, et les
 * trois tests sont restés derrière : ils cherchaient `.photos__ligne` dans la
 * barre, où il n'y en a plus. Ils ont suivi l'écran.
 */

import { fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { unBeneficiaire, unParticipant } from '../test/fabriques'
import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'
import Identite from './Identite'

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

beforeAll(() => preparerIonic())

beforeEach(() => {
  simulations.poserPhoto.mockClear()
  simulations.poserPhotoBeneficiaire.mockClear()
  simulations.reduirePhoto.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

/** Le sélecteur de fichier caché, que les boutons « Ajouter » ouvrent. */
function champFichier(container: HTMLElement) {
  return container.querySelector('.photos__fichier') as HTMLInputElement
}

describe('écran Identité', () => {
  it('liste le titulaire puis ses ayants droit', () => {
    const { container } = rendreEcran(<Identite />)
    const lignes = container.querySelectorAll('.photos__ligne')
    expect(lignes).toHaveLength(2)
    expect(within(lignes[0] as HTMLElement).getByText('Vous')).toBeInTheDocument()
    expect(within(lignes[1] as HTMLElement).getByText('Awa DIOP')).toBeInTheDocument()
  })

  it('choisit, réduit et envoie la photo du titulaire', async () => {
    const { container } = rendreEcran(<Identite />)
    const lignes = container.querySelectorAll('.photos__ligne')
    fireEvent.click(within(lignes[0] as HTMLElement).getByText('Ajouter'))
    const fichier = new File(['xxx'], 'moi.jpg', { type: 'image/jpeg' })
    fireEvent.change(champFichier(container), { target: { files: [fichier] } })

    await waitFor(() => expect(simulations.poserPhoto).toHaveBeenCalledTimes(1))
    // Réduite avant l'envoi : le serveur refuse au-delà de 400 Ko.
    expect(simulations.reduirePhoto).toHaveBeenCalledWith(fichier)
    expect(simulations.poserPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,zz')
  })

  it('envoie la photo d’un ayant droit depuis la même liste', async () => {
    const { container } = rendreEcran(
      <Identite />,
      uneSession({
        beneficiaires: [
          unBeneficiaire(),
          unBeneficiaire({ matricule: '1204-01', estParticipant: false }),
        ],
      }),
    )
    // Deuxième ligne : l'ayant droit (la première est le titulaire).
    const lignes = container.querySelectorAll('.photos__ligne')
    expect(lignes).toHaveLength(2)
    fireEvent.click(within(lignes[1] as HTMLElement).getByText('Ajouter'))
    fireEvent.change(champFichier(container), {
      target: { files: [new File(['x'], 'enfant.jpg', { type: 'image/jpeg' })] },
    })

    await waitFor(() => expect(simulations.poserPhotoBeneficiaire).toHaveBeenCalledTimes(1))
    expect(simulations.poserPhotoBeneficiaire).toHaveBeenCalledWith(
      '1204-01',
      'data:image/jpeg;base64,zz',
    )
    expect(simulations.poserPhoto).not.toHaveBeenCalled()
  })

  it('n’offre plus d’ajouter une photo déjà enregistrée : elle se change', () => {
    // Une photo ne se pose qu'une fois. La ligne n'offre plus « Ajouter » mais
    // « Changer », qui DEMANDE la réinitialisation ; seule l'IPM l'instruit,
    // depuis son application de gestion.
    const { container } = rendreEcran(
      <Identite />,
      uneSession({ participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }) }),
    )
    const ligne = container.querySelector('.photos__ligne') as HTMLElement
    expect(within(ligne).getByText('Changer')).toBeInTheDocument()
    expect(within(ligne).queryByText('Ajouter')).toBeNull()
  })

  it('une demande de changement en cours attend l’IPM, sans autre bouton', () => {
    const { container } = rendreEcran(
      <Identite />,
      uneSession({
        participant: unParticipant({
          photo: 'data:image/jpeg;base64,aa',
          demandePhoto: true,
        }),
      }),
    )
    const ligne = container.querySelector('.photos__ligne') as HTMLElement
    expect(within(ligne).getByText('Demande envoyée')).toBeInTheDocument()
    expect(within(ligne).queryByText('Changer')).toBeNull()
    expect(within(ligne).queryByText('Ajouter')).toBeNull()
  })
})
