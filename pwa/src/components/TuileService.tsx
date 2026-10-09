/**
 * Carte de service (SPEC_DESIGN §3.4) — la GRANDE carte de l'accueil, une par
 * type de document, sur deux colonnes : c'est le modèle donné par
 * l'utilisateur (images/2.png).
 *
 * Contenu centré verticalement : cercle 62, icône 30, libellé 15/700 centré,
 * mention « Disponible » / « Bientôt ». La carte est une surface claire ;
 * seul le cercle de l'icône porte le rouge de marque, et la carte d'un
 * document à venir s'éteint d'un cran.
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
import { MENTION_BIENTOT, MENTION_DISPONIBLE, type TypeDocument } from '../services/catalogue'

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
      <span className="ipm-tuile__cercle" aria-hidden="true">
        <IonIcon className="ipm-tuile__icone" icon={document.icone} />
      </span>
      <span className="ipm-tuile__libelle">{document.libelle}</span>
      <span className="ipm-tuile__mention" aria-hidden="true">
        {indisponible ? MENTION_BIENTOT : MENTION_DISPONIBLE}
      </span>
    </button>
  )
}
