/**
 * Feuille de choix : une question, et les réponses possibles en boutons.
 *
 * Elle remplace la « feuille d'actions » d'Ionic (useIonActionSheet), dont le
 * rendu — une liste de lignes grises à filets — n'a rien de la charte. Même
 * enveloppe que toute feuille (components/Feuille) : icône en cercle, titre,
 * explication, puis les boutons empilés sur toute la largeur, l'action
 * principale en rouge en premier, « Annuler » en dernier.
 *
 * Chaque bouton referme la feuille AVANT d'agir : une déconnexion ou un
 * abandon ne doit pas s'exécuter sous une feuille encore ouverte.
 */

import { BoutonPrincipal, BoutonSecondaire } from './Boutons'
import Feuille from './Feuille'

export interface Choix {
  libelle: string
  onClick?: () => void
  /**
   * « principal » : bouton rouge plein, l'action que la question propose.
   * « danger » : bouton clair au texte rouge, une action qui détruit (retirer).
   * « secondaire » (défaut) : bouton clair, pour annuler ou revenir.
   */
  genre?: 'principal' | 'danger' | 'secondaire'
}

interface Props {
  ouverte: boolean
  onFermer: () => void
  titre: string
  message?: string
  icone?: string
  choix: readonly Choix[]
}

export default function FeuilleChoix({ ouverte, onFermer, titre, message, icone, choix }: Props) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre} icone={icone}>
      {message && <p className="ipm-feuille-choix__message">{message}</p>}
      <div className="ipm-feuille-choix__boutons">
        {choix.map(({ libelle, onClick, genre = 'secondaire' }) => {
          const agir = () => {
            onFermer()
            onClick?.()
          }
          return genre === 'principal' ? (
            <BoutonPrincipal key={libelle} onClick={agir}>
              {libelle}
            </BoutonPrincipal>
          ) : (
            <BoutonSecondaire
              key={libelle}
              onClick={agir}
              className={genre === 'danger' ? 'ipm-bouton--texte-danger' : undefined}
            >
              {libelle}
            </BoutonSecondaire>
          )
        })}
      </div>
    </Feuille>
  )
}
