import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { etatBons, reinitialiserBons } from '../../data/bons'
import { viderCache } from '../../offline/stockage'
import { reponseJson, unFournisseur } from '../../test/fabriques'
import { parEtiquette } from '../../test/ionic'
import NouveauBon from './index'
import { BON_CREE, fauxServeur, preparerIonic, rendreAvecSession, uneSession } from './outils-test'

// Les toasts sont une surcouche Ionic hors du DOM de l'écran : on vérifie ce
// qui leur est demandé.
const surcouches = vi.hoisted(() => ({ presenterToast: vi.fn() }))

// La feuille de choix repose sur IonModal, qu'Ionic ne sait pas présenter
// sous jsdom : un double rend sa question et ses boutons tels quels. La vraie
// est couverte par components/composants.test.tsx.
vi.mock('../../components/FeuilleChoix', () => ({
  default: ({
    ouverte,
    onFermer,
    titre,
    choix,
  }: {
    ouverte: boolean
    onFermer: () => void
    titre: string
    choix: { libelle: string; onClick?: () => void }[]
  }) =>
    ouverte ? (
      <div role="dialog" aria-label={titre}>
        {choix.map((c) => (
          <button
            key={c.libelle}
            type="button"
            onClick={() => {
              onFermer()
              c.onClick?.()
            }}
          >
            {c.libelle}
          </button>
        ))}
      </div>
    ) : null,
}))

// Les roues d'IonDatetime ne se font pas défiler sous jsdom : on les remplace
// par un champ qui émet le même événement ionChange et expose les bornes.
vi.mock('@ionic/react', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@ionic/react')>()
  const { createElement } = await import('react')
  return {
    ...reel,
    useIonToast: () => [surcouches.presenterToast, vi.fn()],
    IonDatetime: (props: {
      value?: string
      min?: string
      max?: string
      onIonChange?: (e: { detail: { value: string } }) => void
    }) =>
      createElement('input', {
        'aria-label': 'Roues de la date',
        'data-min': props.min,
        'data-max': props.max,
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) =>
          props.onIonChange?.({ detail: { value: e.target.value } }),
      }),
  }
})

const haptique = vi.hoisted(() => ({
  leger: vi.fn(),
  selection: vi.fn(),
  succes: vi.fn(),
  erreur: vi.fn(),
  avertissement: vi.fn(),
}))
vi.mock('../../hooks/haptique', () => ({ haptique }))

beforeAll(() => preparerIonic())

beforeEach(async () => {
  Object.values(haptique).forEach((f) => f.mockClear())
  surcouches.presenterToast.mockReset()
  reinitialiserBons()
  await viderCache()
  // Seule l'horloge est figée : les minuteurs d'Ionic et de l'animation tournent.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 18, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
  enLigne(true)
})

function enLigne(valeur: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => valeur })
  act(() => {
    window.dispatchEvent(new Event(valeur ? 'online' : 'offline'))
  })
}

/**
 * Touche la surface qui porte ce texte. Depuis la refonte, une proposition
 * est une carte de liste de la charte, donc un <button> natif (§3.5).
 */
function toucher(
  texte: string | HTMLElement,
  selecteur = 'button, ion-item, ion-card, ion-button',
) {
  const element = typeof texte === 'string' ? screen.getByText(texte) : texte
  const cible = element.closest(selecteur)
  if (!cible) throw new Error(`Rien à toucher pour « ${element.textContent ?? ''} »`)
  fireEvent.click(cible)
}

// Un bouton par son libellé : les boutons de la charte (§3.7), les puces
// (§3.6) et les cartes sont tous des <button> natifs.
function bouton(nom: string | RegExp): HTMLButtonElement {
  const element = screen.getByText(nom).closest('button, ion-button')
  if (!(element instanceof HTMLElement)) throw new Error(`Bouton « ${String(nom)} » absent`)
  return element as HTMLButtonElement
}

function boutonEtiquete(etiquette: string): HTMLButtonElement {
  return parEtiquette<HTMLButtonElement>(etiquette)
}

/** La recherche est le champ de la charte (§3.8), donc un IonInput. */
function rechercher(texte: string) {
  const champ = document.querySelector('ion-input')
  if (!champ) throw new Error('recherche absente')
  fireEvent(champ, new CustomEvent('ionInput', { detail: { value: texte } }))
}

/** Remplit les étapes 1 à 4 : Awa, médecine générale / cabinet Fann, pharmacie du Plateau. */
async function allerAuRecap(options: { articles?: number; date?: string } = {}) {
  toucher('Awa DIOP')
  toucher(await screen.findByText('Medecine Generale'))
  toucher(await screen.findByText('Cabinet Medical Fann'))
  toucher(await screen.findByText('Pharmacie du Plateau'))
  await screen.findByText('L’ordonnance')
  for (let i = 1; i < (options.articles ?? 1); i += 1)
    fireEvent.click(boutonEtiquete('Ajouter un article'))
  if (options.date) {
    fireEvent.change(screen.getByLabelText('Roues de la date'), { target: { value: options.date } })
  }
  fireEvent.click(bouton('Continuer'))
  await screen.findByText('Vérifiez avant de générer')
}

describe('Nouveau bon', () => {
  it('propose la famille en cartes, avec le lien et l’âge', () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(screen.getByText('Pour qui est l’ordonnance ?')).toBeInTheDocument()
    expect(screen.getByText('Étape 1 sur 5 · Bénéficiaire')).toBeInTheDocument()
    expect(screen.getByText('Vous-même · 64 ans')).toBeInTheDocument()
    expect(screen.getByText('Conjointe · 58 ans')).toBeInTheDocument()
  })

  it('génère le bon de bout en bout, puis ouvre son détail après l’animation', async () => {
    const { appels } = fauxServeur()
    const onCree = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={onCree} />)

    await allerAuRecap({ articles: 3, date: '2026-09-10' })
    const recap = screen.getByLabelText('Récapitulatif du bon')
    expect(within(recap).getByText('Awa DIOP')).toBeInTheDocument()
    expect(within(recap).getByText('Cabinet Medical Fann')).toBeInTheDocument()
    expect(within(recap).getByText('Pharmacie du Plateau')).toBeInTheDocument()
    expect(within(recap).getByText('jeudi 10 septembre 2026')).toBeInTheDocument()
    expect(within(recap).getByText('3 articles')).toBeInTheDocument()

    fireEvent.click(bouton('Générer le bon'))
    expect(await screen.findByText('Bon généré')).toBeInTheDocument()
    expect(screen.getByText('N° BPI000042')).toBeInTheDocument()
    expect(haptique.succes).toHaveBeenCalledTimes(1)

    const creation = appels.find((a) => a.methode === 'POST')
    expect(creation?.url).toBe('/api/mobile/bons-pharmacie/')
    expect(creation?.autorisation).toBe('Participant J')
    expect(creation?.corps).toEqual({
      beneficiaire: '1204-01',
      pharmacie: 'PH001',
      specialite: '01',
      prescripteur: 'MG001',
      nbArticles: 3,
      dateOrdonnance: '2026-09-10',
    })
    // Le bon est déjà dans la liste partagée (Accueil, Mes bons)…
    expect(etatBons().bons?.[0]?.id).toBe(42)
    // … et l'hôte n'ouvre le détail qu'une fois l'animation jouée.
    expect(onCree).not.toHaveBeenCalled()
    await waitFor(() => expect(onCree).toHaveBeenCalledWith(BON_CREE), { timeout: 3000 })
    // La liste est aussi resynchronisée avec le serveur.
    expect(appels.some((a) => a.methode === 'GET' && a.url === '/api/mobile/bons-pharmacie/')).toBe(
      true,
    )
  })

  it('charge les prescripteurs de la spécialité choisie', async () => {
    const { appels } = fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    expect(await screen.findByText('12 prescripteurs')).toBeInTheDocument()
    expect(screen.getByText('1 prescripteur')).toBeInTheDocument()
    toucher('Medecine Generale')
    expect(
      await screen.findByText('Médecins et structures en Medecine Generale.'),
    ).toBeInTheDocument()
    await screen.findByText('Cabinet Medical Fann')
    expect(appels.some((a) => a.url === '/api/mobile/prescripteurs/?specialite=01')).toBe(true)
  })

  it('ramène à l’étape refusée par le serveur, puis directement au récapitulatif', async () => {
    let refus = true
    fauxServeur({
      creation: () =>
        refus
          ? reponseJson({ pharmacie: ['Pharmacie inconnue ou non conventionnée.'] }, 400)
          : reponseJson(BON_CREE, 201),
    })
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()

    fireEvent.click(bouton('Générer le bon'))
    expect(await screen.findByText('Pharmacie inconnue ou non conventionnée.')).toBeInTheDocument()
    expect(screen.getByText('Étape 3 sur 5 · Pharmacie')).toBeInTheDocument()
    expect(haptique.erreur).toHaveBeenCalled()
    expect(surcouches.presenterToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Une information est à corriger : pharmacie.' }),
    )

    refus = false
    toucher("Pharmacie de l'Aeroport")
    expect(await screen.findByText('Vérifiez avant de générer')).toBeInTheDocument()
    expect(screen.queryByText('Pharmacie inconnue ou non conventionnée.')).not.toBeInTheDocument()
    fireEvent.click(bouton('Générer le bon'))
    expect(await screen.findByText('Bon généré')).toBeInTheDocument()
  })

  it('garde la saisie et prévient si le serveur est injoignable', async () => {
    fauxServeur({ creation: () => Promise.reject(new TypeError('Failed to fetch')) })
    const onCree = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={onCree} />)
    await allerAuRecap()

    fireEvent.click(bouton('Générer le bon'))
    await waitFor(() =>
      expect(surcouches.presenterToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
          color: 'danger',
        }),
      ),
    )
    expect(haptique.erreur).toHaveBeenCalled()
    expect(screen.getByText('Vérifiez avant de générer')).toBeInTheDocument()
    await waitFor(() => expect(bouton('Générer le bon').disabled).toBe(false))
    expect(onCree).not.toHaveBeenCalled()
  })

  it('désactive la génération hors ligne, avec l’explication', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()

    enLigne(false)
    expect(
      screen.getByText(/Vous êtes hors ligne\. Reconnectez-vous pour générer le bon/),
    ).toBeInTheDocument()
    expect(bouton('Générer le bon').disabled).toBe(true)

    enLigne(true)
    expect(bouton('Générer le bon').disabled).toBe(false)
  })

  it('borne la date d’ordonnance de J-30 à aujourd’hui et le compteur de 1 à 8', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Moustapha DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))
    toucher(await screen.findByText('Pharmacie du Plateau'))

    const roues = await screen.findByLabelText('Roues de la date')
    expect(roues).toHaveAttribute('data-min', '2026-08-19')
    expect(roues).toHaveAttribute('data-max', '2026-09-18')

    const retirer = boutonEtiquete('Retirer un article')
    const ajouter = boutonEtiquete('Ajouter un article')
    expect(retirer.disabled).toBe(true)
    for (let i = 0; i < 10; i += 1) fireEvent.click(ajouter)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '8')
    expect(ajouter.disabled).toBe(true)
    expect(screen.getByText(/le bon imprimé n’a que 8 lignes/)).toBeInTheDocument()
  })

  it('choisit « Hier » d’un geste', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Moustapha DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))
    toucher(await screen.findByText('Pharmacie du Plateau'))
    fireEvent.click(bouton('Hier'))
    expect(screen.getByText('jeudi 17 septembre 2026')).toBeInTheDocument()
  })

  it('recule d’une liste à l’autre, puis d’étape en étape', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    await screen.findByText('Cabinet Medical Fann')

    fireEvent.click(boutonEtiquete('Retour'))
    expect(
      await screen.findByText('Commencez par la spécialité du prescripteur.'),
    ).toBeInTheDocument()
    fireEvent.click(boutonEtiquete('Retour'))
    expect(await screen.findByText('Pour qui est l’ordonnance ?')).toBeInTheDocument()
    // Le choix précédent est conservé.
    expect(parEtiquette(/^Awa DIOP/)).toHaveClass('nouveau-bon__carte--choisie')
  })

  it('retourne au récapitulatif après une modification', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()
    fireEvent.click(parEtiquette(/^Bénéficiaire : Awa DIOP/))
    toucher(await screen.findByText('Moustapha DIOP'))
    const recap = await screen.findByLabelText('Récapitulatif du bon')
    expect(within(recap).getByText('Moustapha DIOP')).toBeInTheDocument()
  })

  it('ferme sans question tant que rien n’est choisi', () => {
    fauxServeur()
    const onFermer = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={onFermer} onCree={vi.fn()} />)
    fireEvent.click(bouton('Annuler'))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('demande confirmation avant d’abandonner une saisie commencée', async () => {
    fauxServeur()
    const onFermer = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={onFermer} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    await screen.findByText('Medecine Generale')
    fireEvent.click(bouton('Annuler'))
    expect(onFermer).not.toHaveBeenCalled()
    expect(haptique.avertissement).toHaveBeenCalled()

    const feuille = screen.getByRole('dialog', { name: 'Abandonner ce bon ?' })
    // Continuer d'abord : la saisie ne se perd pas d'un geste trop rapide.
    expect(
      within(feuille)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Continuer la saisie', 'Abandonner'])
    fireEvent.click(within(feuille).getByText('Abandonner'))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('filtre les pharmacies par nom ou quartier', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))
    await screen.findByText('Pharmacie du Plateau')

    rechercher('yoff')
    expect(screen.getByText("Pharmacie de l'Aeroport")).toBeInTheDocument()
    expect(screen.queryByText('Pharmacie du Plateau')).not.toBeInTheDocument()
    expect(screen.getByText('1 pharmacie')).toBeInTheDocument()

    rechercher('zzz')
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument()
  })

  it('propose de réessayer si les pharmacies n’ont pas pu être chargées', async () => {
    let panne = true
    const { appels } = fauxServeur({
      pharmacies: () => (panne ? reponseJson({ detail: 'Erreur' }, 503) : reponseJson([])),
    })
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))

    expect(await screen.findByText('Chargement impossible')).toBeInTheDocument()
    expect(
      screen.getByText('Le service IPM rencontre un problème. Réessayez plus tard.'),
    ).toBeInTheDocument()
    panne = false
    fireEvent.click(bouton('Réessayer'))
    expect(await screen.findByText('Aucune pharmacie')).toBeInTheDocument()
    expect(appels.filter((a) => a.url === '/api/mobile/pharmacies/')).toHaveLength(2)
  })

  it('redemande la famille si elle n’est pas encore connue', async () => {
    fauxServeur()
    const rafraichir = vi.fn(() => Promise.resolve())
    rendreAvecSession(
      <NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />,
      uneSession({ beneficiaires: [], rafraichir }),
    )
    expect(rafraichir).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Famille indisponible')).toBeInTheDocument()
    fireEvent.click(bouton('Réessayer'))
    expect(rafraichir).toHaveBeenCalledTimes(2)
  })
})

/**
 * La refonte (SPEC_DESIGN §1, §3, §5) : ces vérifications gardent l'assistant
 * du retour des composants interdits — toolbar Ionic, listes à filets,
 * barre de recherche d'Ionic, pied de page rectangulaire.
 */
describe('Nouveau bon : charte visuelle', () => {
  it('commence par un bandeau compact sombre à barre de progression, sans toolbar Ionic', () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)

    const bandeau = container.querySelector('.ipm-bandeau')
    expect(bandeau).toHaveClass('ipm-bandeau--compact')
    expect(bandeau).not.toHaveClass('ipm-bandeau--rouge')

    const progression = screen.getByRole('progressbar')
    expect(bandeau?.contains(progression)).toBe(true)
    expect(progression).toHaveAttribute('aria-valuenow', '1')
    expect(progression).toHaveAttribute('aria-valuemax', '5')

    expect(
      container.querySelector('ion-header, ion-toolbar, ion-title, ion-progress-bar'),
    ).toBeNull()
  })

  it('avance la jauge de progression d’une étape à l’autre', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    await screen.findByText('Medecine Generale')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
  })

  it('n’emploie ni liste à filets, ni segment, ni barre de recherche Ionic', async () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    // Les cartes de la charte remplacent les lignes de liste, dès l'étape 1.
    expect(container.querySelectorAll('.ipm-carte-liste').length).toBeGreaterThan(0)

    toucher('Awa DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))
    await screen.findByText('Pharmacie du Plateau')

    expect(
      container.querySelectorAll(
        'ion-item, ion-list, ion-item-divider, ion-segment, ion-searchbar',
      ),
    ).toHaveLength(0)
    // La recherche est le champ de la charte (§3.8).
    expect(container.querySelector('.ipm-champ')).not.toBeNull()
  })

  it('range une longue liste sous des intercalaires en titres de section', async () => {
    const nombreuses = Array.from({ length: 14 }, (_, i) =>
      unFournisseur({
        code: `PH${i}`,
        libelle: `${String.fromCharCode(65 + i)} PHARMACIE`,
        adresse: 'Dakar',
      }),
    )
    fauxServeur({ pharmacies: () => reponseJson(nombreuses) })
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    toucher('Awa DIOP')
    toucher(await screen.findByText('Medecine Generale'))
    toucher(await screen.findByText('Cabinet Medical Fann'))
    await screen.findByText('A Pharmacie')

    const lettres = Array.from(
      container.querySelectorAll('.nouveau-bon__groupe .ipm-titre-section'),
      (element) => element.textContent,
    )
    expect(lettres.slice(0, 3)).toEqual(['A', 'B', 'C'])
    expect(container.querySelector('ion-item-divider')).toBeNull()
  })

  it('pose l’action principale de la charte dans le pied dégradé', async () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()
    const pied = container.querySelector('.ipm-pied-boutons')
    expect(pied).not.toBeNull()
    expect(pied?.querySelector('.ipm-bouton--principal.ipm-bouton--rouge')).not.toBeNull()
    expect(container.querySelector('ion-footer')).toBeNull()
  })

  it('termine par une coche animée, avec le retour haptique', async () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await allerAuRecap()
    fireEvent.click(bouton('Générer le bon'))
    await screen.findByText('Bon généré')
    expect(container.querySelector('.nouveau-bon__succes-coche')).not.toBeNull()
    expect(haptique.succes).toHaveBeenCalledTimes(1)
  })
})
