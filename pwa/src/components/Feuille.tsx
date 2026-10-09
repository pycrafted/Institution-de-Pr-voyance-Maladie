/**
 * Feuille (SPEC_DESIGN §3.9) : la fenêtre qui monte du bas, à angles droits
 * (un bandeau posé sur le bas de l'écran, pas une carte de plus), poignée
 * 36×4 arrondie, fond surface, `--ombre-3`.
 *
 * C'est la forme à employer pour tout ce qui explique ou demande une
 * précision sans quitter l'écran (« Bientôt disponible », installation,
 * choix court) — jamais une boîte de dialogue carrée.
 *
 * IonModal en mode feuille : le balayage vers le bas la referme, comme partout
 * ailleurs sur un téléphone. Sa HAUTEUR EST CELLE DE SON CONTENU — une feuille
 * de trois lignes ne monte pas à mi-écran pour n'y montrer que du blanc. Pour
 * cela, un seul palier (1, soit toute la hauteur de la feuille) et une feuille
 * à hauteur automatique ; le contenu n'est PAS un IonContent, qui, étant posé
 * en absolu sur son parent, n'a aucune hauteur propre et ramenait la feuille
 * à zéro (cf. composants.css §3.9).
 */

import { IonIcon, IonModal } from '@ionic/react'
import type { ReactNode } from 'react'

interface Props {
  ouverte: boolean
  onFermer: () => void
  /** Titre en 17/600 sous la poignée ; facultatif. */
  titre?: ReactNode
  /** Icône ionicons, dans un cercle teinté au-dessus du titre ; facultative. */
  icone?: string
  children: ReactNode
  className?: string
}

/**
 * Le dedans de la feuille, exporté à part : IonModal ne monte ses enfants
 * qu'une fois présenté, et sous jsdom il n'a pas de « framework delegate ».
 * C'est donc ce composant-ci que les tests rendent.
 */
export function ContenuFeuille({
  titre,
  icone,
  children,
}: Pick<Props, 'titre' | 'icone' | 'children'>) {
  return (
    <div className="ipm-feuille__contenu">
      <div className="ipm-feuille__poignee" aria-hidden="true" />
      {icone && (
        <span className="ipm-feuille__icone ipm-cercle--rouge" aria-hidden="true">
          <IonIcon icon={icone} />
        </span>
      )}
      {titre && <h2 className="ipm-feuille__titre">{titre}</h2>}
      <div className="ipm-feuille__corps">{children}</div>
    </div>
  )
}

export default function Feuille({ ouverte, onFermer, titre, icone, children, className }: Props) {
  return (
    <IonModal
      className={`ipm-feuille${className ? ` ${className}` : ''}`}
      isOpen={ouverte}
      onDidDismiss={onFermer}
      initialBreakpoint={1}
      breakpoints={[0, 1]}
      // Poignée dessinée par la feuille elle-même : celle d'Ionic est
      // interactive (elle change de palier) et n'a pas nos cotes.
      handle={false}
    >
      <ContenuFeuille titre={titre} icone={icone}>
        {children}
      </ContenuFeuille>
    </IonModal>
  )
}
