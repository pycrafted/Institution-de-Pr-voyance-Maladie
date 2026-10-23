/**
 * En-tête d'écran, façon application mobile native (Material 3 « top app bar »).
 *
 * Fini le bandeau de marque sombre qui ouvrait chaque écran : le haut d'une
 * vraie app est le GRAND TITRE posé directement sur le fond clair de la page
 * (comme l'accueil accueille par « Bonjour, <prénom> »). Pas de phrase qui
 * décrit l'écran - un titre, et c'est tout.
 *
 * Deux usages, un seul composant :
 *   - écran d'onglet (Mes bons, Conventionnés, Profil) : juste le grand titre ;
 *   - écran de détail (un bon, l'assistance…) : une flèche retour Material à
 *     gauche du titre, et une action éventuelle à droite (`fin`).
 *
 * `children` reçoit ce qui se range SOUS le titre, encore dans l'en-tête
 * (une puce de statut, par exemple).
 */

import { IonIcon } from '@ionic/react'
import { arrowBack } from 'ionicons/icons'
import type { ReactNode } from 'react'

import { haptique } from '../hooks/haptique'

interface Props {
  /** Le nom de l'écran : « Mes bons », « Profil »… */
  titre: ReactNode
  /** Ligne secondaire discrète (rare : une app décrit peu ses écrans). */
  sousTitre?: ReactNode
  /** Flèche retour Material (écran de détail). Absente sur un onglet. */
  onRetour?: () => void
  /** Action à droite du titre (icône ronde, puce…). */
  fin?: ReactNode
  /** Rangé sous le titre, dans l'en-tête. */
  children?: ReactNode
  className?: string
}

export default function EnteteEcran({
  titre,
  sousTitre,
  onRetour,
  fin,
  children,
  className,
}: Props) {
  return (
    <header className={`ipm-entete${className ? ` ${className}` : ''}`}>
      <div className="ipm-entete__ligne">
        {onRetour && (
          <button
            type="button"
            className="ipm-entete__retour ipm-appui"
            aria-label="Retour"
            onClick={() => {
              haptique.leger()
              onRetour()
            }}
          >
            <IonIcon icon={arrowBack} aria-hidden="true" />
          </button>
        )}
        <div className="ipm-entete__textes">
          <h1 className="ipm-entete__titre">{titre}</h1>
          {sousTitre && <p className="ipm-entete__sous-titre">{sousTitre}</p>}
        </div>
        {fin && <div className="ipm-entete__fin">{fin}</div>}
      </div>
      {children}
    </header>
  )
}
