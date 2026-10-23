/**
 * Écran « Nouveau bon de pharmacie » : le FORMULAIRE, calqué sur celui de
 * l'application web. Ces vérifications ont remplacé celles de l'assistant en
 * cinq étapes, abandonné à la demande du métier.
 */

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { etatBons, reinitialiserBons } from '../../data/bons'
import { viderCache } from '../../offline/stockage'
import { reponseJson } from '../../test/fabriques'
import NouveauBon from './index'
import { BON_CREE, fauxServeur, preparerIonic, rendreAvecSession } from './outils-test'

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

vi.mock('@ionic/react', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@ionic/react')>()
  return { ...reel, useIonToast: () => [surcouches.presenterToast, vi.fn()] }
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

/** Un champ du formulaire, par son libellé. */
const champ = (libelle: string | RegExp) => screen.getByLabelText(libelle) as HTMLSelectElement
const choisir = (libelle: string | RegExp, valeur: string) =>
  fireEvent.change(champ(libelle), { target: { value: valeur } })

function bouton(nom: string | RegExp): HTMLButtonElement {
  const element = screen.getByText(nom).closest('button, ion-button')
  if (!(element instanceof HTMLElement)) throw new Error(`Bouton « ${String(nom)} » absent`)
  return element as HTMLButtonElement
}

/** Remplit le formulaire en entier : Awa, pharmacie, spécialité, prescripteur. */
async function remplirTout() {
  choisir(/^Type/, 'CONJOINT')
  choisir(/^Bénéficiaire/, '1204-01')
  await waitFor(() => expect(champ(/^Pharmacie/).disabled).toBe(false))
  choisir(/^Pharmacie/, 'PH001')
  choisir(/^Spécialité/, '01')
  await waitFor(() => expect(champ(/^Prescripteur/).disabled).toBe(false))
  choisir(/^Prescripteur/, 'MG001')
}

describe('Nouveau bon', () => {
  it('présente les mêmes sections que l’écran web', () => {
    fauxServeur()
    const { container } = rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    const titres = Array.from(container.querySelectorAll('.ipm-formulaire__titre')).map(
      (t) => t.textContent,
    )
    expect(titres).toEqual(['Bénéficiaire', 'Pharmacie', 'Prescripteur', 'Ordonnance'])
  })

  it('ouvre directement sur la saisie : ni titre, ni dossier recopié', () => {
    // L'employé vient de toucher « Bon de pharmacie » : lui redire où il est
    // et lui montrer sa propre société ne lui apprend rien.
    const { container } =
      (fauxServeur(), rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />))
    expect(screen.queryByText('Nouveau bon')).toBeNull()
    // « Participant » ne doit plus être une SECTION ; il reste un type de
    // bénéficiaire dans le menu « Type », ce qui est autre chose.
    const titres = Array.from(container.querySelectorAll('.ipm-formulaire__titre')).map(
      (t) => t.textContent,
    )
    expect(titres).not.toContain('Participant')
    expect(screen.queryByText('01-1204')).toBeNull()
    expect(container.querySelector('.ipm-formulaire__lecture')).toBeNull()
    // La sortie, elle, reste : c'est le seul moyen de refermer.
    expect(bouton('Annuler')).toBeInTheDocument()
  })

  it('n’exige que le bénéficiaire pour enregistrer', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(bouton('Enregistrer').disabled).toBe(true)

    choisir(/^Type/, 'CONJOINT')
    choisir(/^Bénéficiaire/, '1204-01')
    // Ni pharmacie, ni prescripteur, ni ordonnance : comme à l'écran web.
    await waitFor(() => expect(bouton('Enregistrer').disabled).toBe(false))
  })

  it('le prescripteur attend sa spécialité, comme à l’écran web', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    expect(champ(/^Prescripteur/).disabled).toBe(true)

    await waitFor(() => expect(champ(/^Spécialité/).disabled).toBe(false))
    choisir(/^Spécialité/, '01')
    await waitFor(() => expect(champ(/^Prescripteur/).disabled).toBe(false))
    expect(Array.from(champ(/^Prescripteur/).options).map((o) => o.textContent)).toContain(
      'Cabinet Medical Fann',
    )
  })

  it('envoie le formulaire rempli, puis ouvre le bon créé', async () => {
    const { appels } = fauxServeur()
    const onCree = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={onCree} />)
    await remplirTout()

    fireEvent.click(bouton('Enregistrer'))
    await waitFor(() =>
      expect(appels.some((a) => a.methode === 'POST' && a.url.endsWith('/bons-pharmacie/'))).toBe(
        true,
      ),
    )
    const envoi = appels.find((a) => a.methode === 'POST')
    expect(envoi?.corps).toMatchObject({
      beneficiaire: '1204-01',
      pharmacie: 'PH001',
      specialite: '01',
      prescripteur: 'MG001',
    })
    expect(haptique.succes).toHaveBeenCalled()
    // Le bon rejoint la liste sans attendre la resynchronisation.
    await waitFor(() => expect(etatBons().bons?.[0]?.code).toBe(BON_CREE.code))
    await waitFor(() => expect(onCree).toHaveBeenCalledWith(BON_CREE), { timeout: 3000 })
  })

  it('affiche le refus du serveur sous le champ concerné', async () => {
    fauxServeur({
      creation: () => reponseJson({ pharmacie: ['Pharmacie inconnue ou non conventionnée.'] }, 400),
    })
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await remplirTout()

    fireEvent.click(bouton('Enregistrer'))
    expect(await screen.findByText('Pharmacie inconnue ou non conventionnée.')).toBeInTheDocument()
    expect(haptique.erreur).toHaveBeenCalled()
    // Corriger le champ efface le refus : il ne vaut plus.
    choisir(/^Pharmacie/, 'PH002')
    await waitFor(() =>
      expect(screen.queryByText('Pharmacie inconnue ou non conventionnée.')).toBeNull(),
    )
  })

  it('désactive l’enregistrement hors ligne, avec l’explication', async () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    await remplirTout()

    enLigne(false)
    await waitFor(() => expect(bouton('Enregistrer').disabled).toBe(true))
    expect(screen.getByText(/votre saisie est conservée/)).toBeInTheDocument()
  })

  it('ferme sans question tant que rien n’est saisi', () => {
    fauxServeur()
    const onFermer = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={onFermer} onCree={vi.fn()} />)
    fireEvent.click(bouton('Annuler'))
    expect(onFermer).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('demande confirmation avant d’abandonner une saisie commencée', () => {
    fauxServeur()
    const onFermer = vi.fn()
    rendreAvecSession(<NouveauBon onFermer={onFermer} onCree={vi.fn()} />)
    choisir(/^Type/, 'CONJOINT')
    choisir(/^Bénéficiaire/, '1204-01')

    fireEvent.click(bouton('Annuler'))
    expect(onFermer).not.toHaveBeenCalled()
    expect(haptique.avertissement).toHaveBeenCalled()
    const feuille = screen.getByRole('dialog', { name: 'Abandonner ce bon ?' })
    fireEvent.click(within(feuille).getByText('Abandonner'))
    expect(onFermer).toHaveBeenCalled()
  })

  it('borne la date d’ordonnance de J-30 à aujourd’hui', () => {
    fauxServeur()
    rendreAvecSession(<NouveauBon onFermer={vi.fn()} onCree={vi.fn()} />)
    const date = champ(/^Date Ordonnance/) as unknown as HTMLInputElement
    expect(date).toHaveAttribute('min', '2026-08-19')
    expect(date).toHaveAttribute('max', '2026-09-18')
  })
})
