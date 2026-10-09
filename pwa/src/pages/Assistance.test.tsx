import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Assistance from './Assistance'
import { ETAPES, QUESTIONS, VALIDITE_JOURS } from './assistance/contenu'
import { preparerIonic, rendreEcran, simulerReseau } from './assistance/outils-test'

// L'hôte du modal « Nouveau bon » vit dans App (sous le routeur) : ici, on
// ne vérifie que l'appel.
const { ouvrirNouveauBon } = vi.hoisted(() => ({ ouvrirNouveauBon: vi.fn() }))
vi.mock('../components/NouveauBonModal', () => ({
  useNouveauBon: () => ({ ouvrirNouveauBon }),
}))

beforeAll(() => preparerIonic())

let retablirReseau: (() => void) | null = null

beforeEach(() => {
  ouvrirNouveauBon.mockReset()
})

afterEach(() => {
  retablirReseau?.()
  retablirReseau = null
})

describe('Assistance', () => {
  it('explique le bon de pharmacie en trois étapes numérotées', () => {
    const { container } = rendreEcran(<Assistance />)

    expect(screen.getByText('Comment ça marche')).toBeInTheDocument()
    expect(container.querySelectorAll('.ipm-pile .ipm-carte-liste').length).toBeGreaterThanOrEqual(
      ETAPES.length,
    )
    for (const [rang, etape] of ETAPES.entries()) {
      expect(screen.getByText(etape.titre)).toBeInTheDocument()
      expect(screen.getByText(`Étape ${rang + 1}`)).toBeInTheDocument()
    }
    // La troisième étape est bien « présenter le bon avec l'ordonnance ».
    expect(screen.getByText(/avec votre ordonnance/)).toBeInTheDocument()
  })

  it('rappelle la validité de trente jours', () => {
    rendreEcran(<Assistance />)
    expect(screen.getByText(`Valable ${VALIDITE_JOURS} jours`)).toBeInTheDocument()
    const rappel = new RegExp(`${VALIDITE_JOURS} jours après sa date`)
    expect(screen.getByText(rappel)).toBeInTheDocument()
  })

  it('ouvre l’assistant depuis le bouton principal', () => {
    rendreEcran(<Assistance />)
    fireEvent.click(screen.getByText('Demander un bon'))
    expect(ouvrirNouveauBon).toHaveBeenCalledTimes(1)
  })

  it('hors ligne : le bouton est bloqué et la raison est dite', () => {
    retablirReseau = simulerReseau(false)
    rendreEcran(<Assistance />)

    const bouton = screen.getByText('Demander un bon').closest('button')
    expect(bouton).toBeDisabled()
    expect(screen.getByText(/exige une connexion/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Demander un bon'))
    expect(ouvrirNouveauBon).not.toHaveBeenCalled()
  })

  it('déplie et replie une question, sans le moindre filet (§1)', () => {
    const { container } = rendreEcran(<Assistance />)
    const premiere = QUESTIONS[0]!

    expect(screen.getByText(premiere.question)).toBeInTheDocument()
    expect(screen.queryByText(premiere.reponse)).toBeNull()

    const entete = container.querySelector<HTMLElement>(`[data-question="${premiere.cle}"]`)!
    expect(entete).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(entete)
    expect(screen.getByText(premiere.reponse)).toBeInTheDocument()
    expect(entete).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(entete)
    expect(screen.queryByText(premiere.reponse)).toBeNull()

    // §1 : des cartes autonomes, jamais un ion-accordion à filets.
    expect(container.querySelector('ion-accordion')).toBeNull()
    expect(container.querySelector('ion-item')).toBeNull()
    expect(container.querySelectorAll('.assistance__question.ipm-carte')).toHaveLength(
      QUESTIONS.length,
    )
  })

  it('laisse plusieurs réponses ouvertes à la fois', () => {
    const { container } = rendreEcran(<Assistance />)
    const [une, deux] = [QUESTIONS[0]!, QUESTIONS[1]!]

    fireEvent.click(container.querySelector<HTMLElement>(`[data-question="${une.cle}"]`)!)
    fireEvent.click(container.querySelector<HTMLElement>(`[data-question="${deux.cle}"]`)!)

    expect(screen.getByText(une.reponse)).toBeInTheDocument()
    expect(screen.getByText(deux.reponse)).toBeInTheDocument()
  })

  it('renvoie à l’IPM sans inventer la moindre coordonnée', () => {
    const { container } = rendreEcran(<Assistance />)

    expect(screen.getByText('Une autre question ?')).toBeInTheDocument()
    // Ni téléphone, ni courriel, ni adresse inventés.
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull()
    expect(container.textContent).not.toMatch(/\+?\d[\d\s.-]{7,}/)
    expect(container.textContent).not.toMatch(/@/)
  })
})
