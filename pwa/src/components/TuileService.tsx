/**
 * Carte de service (SPEC_DESIGN §3.4) — la GRANDE carte de l'accueil, une par
 * type de document, sur deux colonnes : c'est le modèle donné par
 * l'utilisateur (images/2.png).
 *
 * Contenu centré verticalement : icône 34, libellé 15/700 centré. Rien
 * d'autre (demande de l'utilisateur) : ni disque derrière l'icône, ni mention
 * sous le libellé. La hauteur de la carte suit donc ces deux éléments. L'icône
 * porte le rouge de marque, et la carte d'un document à venir s'éteint d'un
 * cran et garde sa puce « Bientôt » au coin - seul repère qu'il n'est pas
 * encore ouvert.
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

import { haptique } from '../hooks/haptique'
import { MENTION_BIENTOT, type TypeDocument } from '../services/catalogue'

interface Props {
  document: TypeDocument
  /** Toucher d'un document ouvert. Reçoit le document pour éviter une clôture par carte. */
  onOuvrir: (document: TypeDocument) => void
  /** Toucher d'un document à venir (feuille « Bientôt disponible »). */
  onIndisponible?: (document: TypeDocument) => void
}

export default function TuileService({ document, onOuvrir, onIndisponible }: Props) {
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
      className={`ipm-tuile ipm-tuile--${indisponible ? 'avenir' : 'ouverte'} ipm-appui`}
      data-service={document.cle}
      aria-label={indisponible ? `${document.libelle}, bientôt disponible` : document.libelle}
      onClick={toucher}
    >
      {indisponible && (
        <span className="ipm-tuile__puce" aria-hidden="true">
          {MENTION_BIENTOT}
        </span>
      )}
      <IonIcon className="ipm-tuile__icone" icon={document.icone} aria-hidden="true" />
      <span className="ipm-tuile__libelle">{document.libelle}</span>
    </button>
  )
}
