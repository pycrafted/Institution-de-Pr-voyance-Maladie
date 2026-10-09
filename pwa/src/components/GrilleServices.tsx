/**
 * Grille des documents demandables (SPEC_DESIGN §3.4 et §4.3) : DEUX colonnes
 * de grandes cartes, gouttière intérieure de 12, une seule colonne sous
 * 340 px seulement. Le modèle est la référence donnée par l'utilisateur :
 * une carte par service, pas un damier de raccourcis.
 *
 * Elle n'est que l'affichage de `DOCUMENTS` (src/services/catalogue.ts) :
 * ajouter un type de bon, c'est ajouter une entrée au catalogue (cf.
 * pwa/README.md, « Ouvrir un nouveau service »).
 *
 * L'apparition échelonnée est posée ICI, sur le conteneur de chaque carte :
 * la carte, elle, garde `ipm-appui`. Les deux ne peuvent pas cohabiter sur le
 * même élément (une valeur animée de `transform` l'emporte sur `:active`).
 *
 * Annoncée comme une liste pour que le lecteur d'écran donne le nombre de
 * documents avant de les énumérer.
 */

import type { CSSProperties } from 'react'

import { DOCUMENTS, type TypeDocument } from '../services/catalogue'
import TuileService from './TuileService'

interface Props {
  /** Documents affichés, dans l'ordre. Par défaut, tout le catalogue. */
  documents?: readonly TypeDocument[]
  onOuvrir: (document: TypeDocument) => void
  onIndisponible?: (document: TypeDocument) => void
  /** Libellé lu par le lecteur d'écran pour la grille entière. */
  etiquette?: string
}

export default function GrilleServices({
  documents = DOCUMENTS,
  onOuvrir,
  onIndisponible,
  etiquette = 'Documents',
}: Props) {
  return (
    <div className="ipm-grille-services" role="list" aria-label={etiquette}>
      {documents.map((document, rang) => (
        <div
          role="listitem"
          key={document.cle}
          className="ipm-entree"
          style={{ '--rang': rang } as CSSProperties}
        >
          <TuileService document={document} onOuvrir={onOuvrir} onIndisponible={onIndisponible} />
        </div>
      ))}
    </div>
  )
}
