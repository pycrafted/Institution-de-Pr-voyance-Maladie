import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { ErreurApi } from '../api'
import { DOCUMENTS, MESSAGE_BIENTOT } from '../services/catalogue'
import { unBon, unParticipant } from '../test/fabriques'
import type { Bon } from '../types/api'
import Accueil from './Accueil'
import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'

// Liste des bons et modal « Nouveau bon » simulés : l'écran seul est testé.
const simulations = vi.hoisted(() => ({
  ouvrirAssistant: vi.fn(),
  poserPhoto: vi.fn((_photo: string) => Promise.resolve({ photo: 'data:image/jpeg;base64,zz' })),
  retirerPhoto: vi.fn(() => Promise.resolve()),
  reduirePhoto: vi.fn((_f: File) => Promise.resolve('data:image/jpeg;base64,zz')),
  rafraichirBons: vi.fn(() => Promise.resolve()),
  bons: {
    bons: null as Bon[] | null,
    erreur: null as ErreurApi | null,
    chargement: false,
    depuisCache: false,
    synchroniseLe: null as string | null,
  },
}))

// L'API et la réduction d'image sont simulées : c'est l'enchaînement de
// l'écran qui est vérifié (choisir → réduire → envoyer → rafraîchir).
vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>()
  return { ...reel, poserPhoto: simulations.poserPhoto, retirerPhoto: simulations.retirerPhoto }
})

vi.mock('../utils/photo', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../utils/photo')>()
  return { ...reel, reduirePhoto: simulations.reduirePhoto }
})

vi.mock('../components/NouveauBonModal', () => ({
  useNouveauBon: () => ({ ouvrirAssistant: simulations.ouvrirAssistant }),
}))

vi.mock('../data/bons', () => ({
  useBons: () => ({ ...simulations.bons, rafraichir: simulations.rafraichirBons }),
}))

// La feuille est simulée : Ionic ne sait pas présenter une fenêtre sous jsdom
// (il lui manque son « framework delegate »), et sa fermeture après la fin du
// test lève une erreur non interceptée. Le vrai composant est couvert par
// components/composants.test.tsx.
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

beforeEach(() => {
  simulations.ouvrirAssistant.mockReset()
  simulations.poserPhoto.mockClear()
  simulations.retirerPhoto.mockClear()
  simulations.reduirePhoto.mockClear()
  simulations.rafraichirBons.mockClear()
  simulations.bons = {
    bons: [],
    erreur: null,
    chargement: false,
    depuisCache: false,
    synchroniseLe: null,
  }
  // Seule l'horloge est figée : les minuteurs d'Ionic continuent de tourner.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 18, 9, 30))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Accueil', () => {
  it('ouvre l’écran par un bandeau de marque, chevauché par la carte d’adhérent', () => {
    const { container } = rendreEcran(<Accueil />)
    const bandeau = container.querySelector('.ipm-bandeau')
    expect(bandeau).toHaveClass('ipm-bandeau--plein', 'ipm-bandeau--chevauche')
    expect(container.querySelector('.ipm-bandeau__titre')).toHaveTextContent('Accueil')
    // Le sous-titre dit ce que l'écran contient, et non la date du jour.
    expect(container.querySelector('.ipm-bandeau__sous-titre')).toHaveTextContent(
      /carte d’adhérent/,
    )
    const carte = container.querySelector('.accueil__chevauchement')
    expect(carte?.querySelector('.ipm-carte-identite')).not.toBeNull()
    expect(screen.getByText('1204')).toBeInTheDocument()
    // La société n'est dite qu'une fois : sur la carte d'identité.
    expect(screen.getAllByText('SAR')).toHaveLength(1)
  })

  it('ne porte plus le réglage sombre / clair : il est passé au profil', () => {
    rendreEcran(<Accueil />)
    expect(screen.queryByLabelText(/Passer en mode/)).toBeNull()
  })

  it('montre les initiales quand aucune photo n’est enregistrée', () => {
    const { container } = rendreEcran(<Accueil />)
    const portrait = container.querySelector('.ipm-carte-identite__portrait')
    expect(portrait?.querySelector('.ipm-carte-identite__initiales')).toHaveTextContent('MD')
    expect(portrait?.querySelector('img')).toBeNull()
    expect(screen.getByLabelText('Ajouter ma photo')).toBeInTheDocument()
  })

  it('affiche la photo du participant sur la carte', () => {
    const { container } = rendreEcran(
      <Accueil />,
      uneSession({ participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }) }),
    )
    const image = container.querySelector('.ipm-carte-identite__photo img') as HTMLImageElement
    expect(image?.src).toBe('data:image/jpeg;base64,aa')
    expect(screen.getByLabelText('Changer ma photo')).toBeInTheDocument()
  })

  it('choisit, réduit et envoie une photo depuis la carte', async () => {
    const { container } = rendreEcran(<Accueil />)
    const champ = container.querySelector('.accueil__fichier') as HTMLInputElement
    const fichier = new File(['xxx'], 'moi.jpg', { type: 'image/jpeg' })
    fireEvent.change(champ, { target: { files: [fichier] } })

    await vi.waitFor(() => expect(simulations.poserPhoto).toHaveBeenCalledTimes(1))
    // Réduite avant l'envoi : le serveur refuse au-delà de 400 Ko.
    expect(simulations.reduirePhoto).toHaveBeenCalledWith(fichier)
    expect(simulations.poserPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,zz')
  })

  it('propose de changer ou de retirer une photo déjà posée', async () => {
    rendreEcran(
      <Accueil />,
      uneSession({ participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }) }),
    )
    fireEvent.click(screen.getByLabelText('Changer ma photo'))
    const feuille = screen.getByRole('dialog')
    expect(feuille).toHaveTextContent('Ma photo')
    fireEvent.click(within(feuille).getByText('Retirer la photo'))
    await vi.waitFor(() => expect(simulations.retirerPhoto).toHaveBeenCalledTimes(1))
  })

  it('présente la carte comme une carte d’identité, champ par champ', () => {
    const { container } = rendreEcran(<Accueil />)
    const carte = container.querySelector('.ipm-carte-identite') as HTMLElement
    expect(carte).toHaveTextContent('Carte d’adhérent')
    // Chaque valeur sous son libellé, comme sur la pièce de l'organisation.
    const champs = Object.fromEntries(
      Array.from(carte.querySelectorAll('.ipm-carte-identite__champ')).map((c) => [
        c.querySelector('dt')?.textContent,
        c.querySelector('dd')?.textContent,
      ]),
    )
    expect(champs).toEqual({
      Nom: 'DIOP',
      'Prénom(s)': 'Moustapha',
      Matricule: '1204',
      'Né(e) le': '01/01/1962',
      Société: 'SAR',
    })
  })

  it('titre la grille « Demander un document » et n’y met que des documents', () => {
    const { container } = rendreEcran(<Accueil />)
    expect(screen.getByText('Demander un document')).toBeInTheDocument()
    expect(container.querySelectorAll('.ipm-grille-services .ipm-tuile')).toHaveLength(
      DOCUMENTS.length,
    )
    // §4 : les écrans utilitaires sont des onglets ou des réglages, pas ici.
    expect(container.querySelector('.ipm-grille-services [data-service="mon-profil"]')).toBeNull()
  })

  it('ouvre l’assistant depuis la carte « Bon de pharmacie »', () => {
    rendreEcran(<Accueil />)
    fireEvent.click(screen.getByLabelText('Bon de pharmacie'))
    expect(simulations.ouvrirAssistant).toHaveBeenCalledWith('bon-pharmacie')
  })

  it('ouvre l’assistant de la lettre depuis la carte « Lettre de garantie »', () => {
    rendreEcran(<Accueil />)
    fireEvent.click(screen.getByLabelText('Lettre de garantie'))
    expect(simulations.ouvrirAssistant).toHaveBeenCalledWith('lettre-garantie')
  })

  it('explique dans une feuille les documents encore à venir', () => {
    rendreEcran(<Accueil />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText("Bon d'optique, bientôt disponible"))
    expect(screen.getByRole('dialog')).toHaveTextContent(MESSAGE_BIENTOT)
    expect(simulations.ouvrirAssistant).not.toHaveBeenCalled()
  })

  it('ne liste aucun bon : demander un document est sa seule raison d’être', () => {
    // La liste vit dans l'onglet « Mes documents ». Même avec des bons connus,
    // l'accueil n'en montre aucun, et ne propose donc ni « Derniers bons » ni
    // « Tout voir ».
    simulations.bons.bons = [2, 1].map((n) => unBon({ id: n, code: `BPI00000${n}` }))
    const { container } = rendreEcran(<Accueil />)
    expect(container.querySelector('.ipm-carte-liste')).toBeNull()
    expect(screen.queryByText('Derniers bons')).toBeNull()
    expect(screen.queryByText('Tout voir')).toBeNull()
    expect(screen.queryByText('Bon n° BPI000002')).toBeNull()
  })

  it('signale le hors-ligne, car il charge les bons sans les montrer', () => {
    // C'est ce chargement — et lui seul — qui dit si le serveur répond :
    // l'écran doit continuer de le faire, même sans liste à l'écran.
    simulations.bons.depuisCache = true
    simulations.bons.erreur = new ErreurApi('reseau')
    const { container } = rendreEcran(<Accueil />)
    expect(container.querySelector('.ipm-hors-ligne')).not.toBeNull()
  })
})
