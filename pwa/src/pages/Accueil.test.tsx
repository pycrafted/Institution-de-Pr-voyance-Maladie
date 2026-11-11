import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

import { ErreurApi } from '../api'
import { DOCUMENTS, MESSAGE_BIENTOT } from '../services/catalogue'
import { unBeneficiaire, unBon, unParticipant } from '../test/fabriques'
import type { Bon } from '../types/api'
import Accueil from './Accueil'
import { preparerIonic, rendreEcran, uneSession } from './accueil/outils-test'

// Liste des bons et modal « Nouveau bon » simulés : l'écran seul est testé.
const simulations = vi.hoisted(() => ({
  ouvrirAssistant: vi.fn(),
  rafraichirBons: vi.fn(() => Promise.resolve()),
  bons: {
    bons: null as Bon[] | null,
    erreur: null as ErreurApi | null,
    chargement: false,
    depuisCache: false,
    synchroniseLe: null as string | null,
  },
}))

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
  it('ouvre l’écran sur la carte, sans titre ni salutation', () => {
    const { container } = rendreEcran(<Accueil />)
    // Ni bandeau, ni « Accueil », ni « Bonjour » : le haut de l'écran est la
    // barre d'actions, et l'écran commence par la carte.
    expect(container.querySelector('.ipm-bandeau')).toBeNull()
    expect(container.querySelector('.accueil-entete')).toBeNull()
    expect(container).not.toHaveTextContent('Bonjour')
    // La carte d'adhérent est le héros de l'écran.
    const carte = container.querySelector('.accueil__carte')
    expect(carte?.querySelector('.ipm-carte-identite')).not.toBeNull()
    expect(screen.getByText('1204')).toBeInTheDocument()
    // La société n'est dite qu'une fois : sur la carte d'identité.
    expect(screen.getAllByText('SAR')).toHaveLength(1)
  })

  it('montre les initiales quand aucune photo n’est enregistrée', () => {
    const { container } = rendreEcran(<Accueil />)
    const portrait = container.querySelector('.ipm-carte-identite__portrait')
    expect(portrait?.querySelector('.ipm-carte-identite__initiales')).toHaveTextContent('MD')
    expect(portrait?.querySelector('img')).toBeNull()
  })

  it('affiche la photo du participant sur la carte', () => {
    const { container } = rendreEcran(
      <Accueil />,
      uneSession({ participant: unParticipant({ photo: 'data:image/jpeg;base64,aa' }) }),
    )
    const image = container.querySelector('.ipm-carte-identite__photo img') as HTMLImageElement
    expect(image?.src).toBe('data:image/jpeg;base64,aa')
  })

  it('ne laisse pas toucher le portrait de la carte', () => {
    // Une pièce d'identité ne se modifie pas au moment où on la présente :
    // les photos s'envoient depuis la feuille dédiée, et de là seulement.
    const { container } = rendreEcran(<Accueil />)
    expect(container.querySelector('.ipm-carte-identite button')).toBeNull()
    expect(container.querySelector('.accueil__fichier')).toBeNull()
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

  it('ouvre sa propre carte en grand quand on la touche', () => {
    // Même présentation que pour un ayant droit : la carte se tend au
    // prestataire, en paysage et en plein écran. Sous jsdom, Ionic ne monte
    // pas le dedans d'une fenêtre (pas de « framework delegate ») : on
    // vérifie donc qu'elle s'ouvre, le dedans étant couvert ailleurs.
    rendreEcran(<Accueil />)
    const modale = () => document.body.querySelector('ion-modal.carte-plein') as HTMLIonModalElement
    expect(modale().isOpen).toBe(false)
    fireEvent.click(screen.getByLabelText('Voir ma carte d’adhérent en grand'))
    expect(modale().isOpen).toBe(true)
  })

  it('offre un raccourci vers la carte de chaque ayant droit', () => {
    // La fabrique donne le titulaire + une conjointe : seule la conjointe est
    // un ayant droit, le titulaire a déjà sa carte en haut de l'écran.
    const { container } = rendreEcran(<Accueil />)
    expect(screen.getByText('Ayants droit')).toBeInTheDocument()
    const membres = container.querySelectorAll('.accueil-famille__membre')
    expect(membres).toHaveLength(1)
    expect(screen.getByLabelText('Carte d’ayant droit de Awa DIOP')).toBeInTheDocument()
    // Le prénom seul sous la pastille : le nom est le même pour toute la famille.
    expect(container.querySelector('.accueil-famille__nom')?.textContent).toBe('Awa')
  })

  it('montre la photo d’un ayant droit à la place de ses initiales', () => {
    const { container } = rendreEcran(
      <Accueil />,
      uneSession({
        beneficiaires: [
          unBeneficiaire({
            matricule: '1204-01',
            nomComplet: 'Awa DIOP',
            prenoms: 'Awa',
            estParticipant: false,
            photo: 'data:image/jpeg;base64,aa',
          }),
        ],
      }),
    )
    const pastille = container.querySelector('.accueil-famille__membre .ipm-avatar')
    expect(pastille?.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,aa')
    // Ni initiales, ni teinte de pastille : la photo occupe toute la place.
    expect(pastille?.textContent).toBe('')
    expect(pastille?.className).not.toMatch(/ipm-avatar--\d/)
  })

  it('n’affiche pas la section famille sans ayant droit', () => {
    const { container } = rendreEcran(<Accueil />, uneSession({ beneficiaires: [] }))
    expect(screen.queryByText('Ayants droit')).toBeNull()
    expect(container.querySelector('.accueil-famille')).toBeNull()
  })

  it('explique dans une feuille les documents encore à venir', () => {
    rendreEcran(<Accueil />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText('LG hospitalisation, bientôt disponible'))
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
