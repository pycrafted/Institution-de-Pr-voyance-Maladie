/**
 * Écran de réussite, par-dessus l'assistant (SPEC_DESIGN §5) : un disque
 * vert qui apparaît en ressort, une coche qui se dessine, puis le numéro du
 * bon sur une carte. Le retour haptique est joué par l'assistant au moment
 * où le serveur répond (`haptique.succes()`, cf. index.tsx) : ici, seulement
 * l'image.
 *
 * Elle dure le temps de comprendre que c'est fait, puis l'assistant laisse la
 * place au détail du bon.
 */

import type { Bon } from '../../types/api'
import { dateMoyenne } from '../../utils/format'

export default function Succes({ bon, titre = 'Bon généré' }: { bon: Bon; titre?: string }) {
  return (
    <div className="nouveau-bon__succes" role="status" aria-live="assertive">
      <span className="nouveau-bon__succes-disque" aria-hidden="true">
        <svg className="nouveau-bon__succes-dessin" viewBox="0 0 96 96">
          <path className="nouveau-bon__succes-coche" d="M28 50 l13 13 l27 -29" />
        </svg>
      </span>
      <h2 className="nouveau-bon__succes-titre">{titre}</h2>
      <div className="ipm-carte nouveau-bon__succes-carte">
        <p className="nouveau-bon__succes-numero ipm-chiffres">N° {bon.code}</p>
        <p className="nouveau-bon__succes-validite">
          Valable jusqu’au <span className="ipm-chiffres">{dateMoyenne(bon.valableJusquAu)}</span>
        </p>
      </div>
    </div>
  )
}
