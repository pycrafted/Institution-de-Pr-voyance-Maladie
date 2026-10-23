/**
 * Fenêtre plein écran (SPEC_DESIGN §3.9) — une PAGE, pas une feuille.
 *
 * Tout ce qui s'ouvre par-dessus un écran (« Bientôt disponible »,
 * notifications, À propos, photos d'identité, une question) prend désormais
 * TOUT l'écran et se présente comme les autres pages de l'application :
 * même fond (`--ipm-fond`), même barre de titre que `EnteteEcran` avec sa
 * flèche retour à gauche. L'employé ne distingue plus « une fenêtre » d'« un
 * écran » : il avance et il revient, comme dans n'importe quelle application
 * mobile.
 *
 * Ce qu'on a quitté, et pourquoi : le bandeau monté du bas, à poignée et à
 * hauteur de contenu. Il tenait pour deux lignes, mais rompait la continuité
 * - fond `--ipm-surface` sur l'écran assombri, titre centré, pas de retour -
 * et donnait à des contenus entiers (la liste des photos de la famille) la
 * forme d'une notification.
 */

import { IonIcon, IonModal } from '@ionic/react'
import type { ReactNode } from 'react'

import EnteteEcran from './EnteteEcran'

interface Props {
  ouverte: boolean
  onFermer: () => void
  /** Titre de la page, dans la barre du haut, à droite de la flèche retour. */
  titre?: ReactNode
  /** Icône ionicons, en tête du corps ; facultative. */
  icone?: string
  children: ReactNode
  className?: string
}

/**
 * Le dedans de la page, exporté à part : IonModal ne monte ses enfants
 * qu'une fois présenté, et sous jsdom il n'a pas de « framework delegate ».
 * C'est donc ce composant-ci que les tests rendent.
 */
export function ContenuFeuille({
  titre,
  icone,
  onFermer,
  children,
}: Pick<Props, 'titre' | 'icone' | 'children'> & { onFermer?: () => void }) {
  return (
    <div className="ipm-feuille__contenu">
      <EnteteEcran titre={titre} onRetour={onFermer} className="ipm-feuille__entete" />
      <div className="ipm-feuille__corps">
        {icone && (
          <span className="ipm-feuille__icone" aria-hidden="true">
            <IonIcon icon={icone} />
          </span>
        )}
        {children}
      </div>
    </div>
  )
}

export default function Feuille({ ouverte, onFermer, titre, icone, children, className }: Props) {
  return (
    <IonModal
      className={`ipm-feuille${className ? ` ${className}` : ''}`}
      isOpen={ouverte}
      onDidDismiss={onFermer}
    >
      <ContenuFeuille titre={titre} icone={icone} onFermer={onFermer}>
        {children}
      </ContenuFeuille>
    </IonModal>
  )
}
