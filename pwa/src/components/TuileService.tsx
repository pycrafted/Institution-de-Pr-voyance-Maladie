/**
 * Carte de service (SPEC_DESIGN §3.4) — une LIGNE de l'accueil, un par type de
 * document, en une seule colonne (demande de l'utilisateur : les grandes
 * tuiles carrées étaient trop hautes). Même forme que CarteListe : icône
 * rouge au trait à gauche, libellé, puis chevron. Un document à venir s'éteint
 * d'un cran et porte la puce « Bientôt » à droite, à la place du chevron.
 *
 * Une carte « à venir » reste touchable : elle ouvre la feuille qui explique
 * où demander le document. Elle ne porte donc PAS `aria-disabled`, qui
 * annoncerait « désactivé » à un bouton qui, lui, réagit (et empêchait tout
 * clic automatisé). L'état passe par `aria-label`.
 *
 * L'apparition échelonnée (`ipm-entree`) est posée par la grille sur le
 * conteneur : une animation de `transform` sur ce bouton-ci écraserait
 * l'effet d'appui `scale(.97)`.
 */

import { IonIcon } from '@ionic/react'
import { chevronForward } from 'ionicons/icons'

import { haptique } from '../hooks/haptique'
import { MENTION_BIENTOT, type TypeDocument } from '../services/catalogue'

interface Props {
  document: TypeDocument
  /** Toucher d'un document ouvert. Reçoit le document pour éviter une clôture par carte. */
  onOuvrir: (document: TypeDocument) => void
  /** Toucher d'un document à venir (feuille « Bientôt disponible »). */
  onIndisponible?: (document: TypeDocument) => void
  /**
   * « liste » : une ligne (icône, phrase d'action, flèche). « tuile » : une
   * case de grille, icône en haut et libellé court centré dessous (accueil).
   */
  forme?: 'liste' | 'tuile'
}

export default function TuileService({
  document,
  onOuvrir,
  onIndisponible,
  forme = 'liste',
}: Props) {
  const tuile = forme === 'tuile'
  const indisponible = !document.disponible

  const toucher = () => {
    if (indisponible) {
      haptique.avertissement()
      onIndisponible?.(document)
      return
    }
    haptique.leger()
    onOuvrir(document)
  }

  return (
    <button
      type="button"
      className={`ipm-tuile ipm-tuile--${indisponible ? 'avenir' : 'ouverte'}${
        tuile ? ' ipm-tuile--case' : ''
      } ipm-appui`}
      data-service={document.cle}
      aria-label={indisponible ? `${document.action}, bientôt disponible` : document.action}
      onClick={toucher}
    >
      {/* L'icône au TRAIT, rouge sur la carte blanche : on force la version
          outline quel que soit le mode. */}
      <IonIcon icon={document.icone} className="ipm-tuile__icone" aria-hidden="true" />
      {/* En tuile, le libellé court (« Bon de pharmacie ») : la phrase
          d'action entière ne tient pas dans une case. */}
      <span className="ipm-tuile__libelle">{tuile ? document.libelle : document.action}</span>
      {/* À droite (ou dessous, en tuile) : le chevron du document ouvert, ou
          la puce « Bientôt ». La tuile n'a pas de chevron. */}
      {tuile && !indisponible ? null : indisponible ? (
        <span className="ipm-tuile__puce" aria-hidden="true">
          {MENTION_BIENTOT}
        </span>
      ) : (
        <IonIcon icon={chevronForward} className="ipm-tuile__chevron" aria-hidden="true" />
      )}
    </button>
  )
}
