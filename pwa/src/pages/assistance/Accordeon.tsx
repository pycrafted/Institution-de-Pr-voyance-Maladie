/**
 * Questions fréquentes en accordéon (SPEC_DESIGN §5), et surtout SANS AUCUN
 * FILET : `ion-accordion` pose des `ion-item` séparés par des traits gris,
 * que §1 interdit. Chaque question est donc une CARTE AUTONOME (`.ipm-carte`)
 * posée dans une `.ipm-pile`, espacée de 12 px de la suivante.
 *
 * Plusieurs réponses peuvent rester ouvertes : sur un téléphone, refermer
 * celle qu'on vient de lire pour en ouvrir une autre fait perdre le fil.
 *
 * La réponse apparaît avec l'animation d'entrée commune (`.ipm-entree`) et le
 * chevron pivote : c'est ce mouvement qui distingue un accordéon d'une liste
 * de titres.
 */

import { IonIcon } from '@ionic/react'
import { chevronDown } from 'ionicons/icons'
import { useId, useState, type CSSProperties } from 'react'

import { haptique } from '../../hooks/haptique'
import type { Question } from './contenu'

export default function Accordeon({ questions }: { questions: readonly Question[] }) {
  const [ouvertes, setOuvertes] = useState<readonly string[]>([])
  const prefixe = useId()

  function basculer(cle: string) {
    haptique.selection()
    setOuvertes((precedentes) =>
      precedentes.includes(cle) ? precedentes.filter((c) => c !== cle) : [...precedentes, cle],
    )
  }

  return (
    <div className="ipm-pile">
      {questions.map((question, rang) => {
        const ouverte = ouvertes.includes(question.cle)
        const idReponse = `${prefixe}-${question.cle}`
        return (
          <div
            key={question.cle}
            className="ipm-carte assistance__question ipm-entree"
            // Apparition échelonnée de 30 ms par carte (cf. .ipm-entree).
            style={{ '--rang': rang } as CSSProperties}
          >
            <button
              type="button"
              className="assistance__demande"
              id={`${idReponse}-titre`}
              data-question={question.cle}
              aria-expanded={ouverte}
              aria-controls={idReponse}
              onClick={() => basculer(question.cle)}
            >
              <span className="assistance__demande-texte">{question.question}</span>
              <IonIcon
                className={`assistance__chevron${ouverte ? ' assistance__chevron--ouvert' : ''}`}
                icon={chevronDown}
                aria-hidden="true"
              />
            </button>
            {ouverte && (
              <div
                className="assistance__reponse ipm-entree"
                id={idReponse}
                role="region"
                aria-labelledby={`${idReponse}-titre`}
              >
                <p>{question.reponse}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
