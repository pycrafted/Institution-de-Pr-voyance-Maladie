/**
 * Enveloppe React minimale autour de Chart.js.
 *
 * On appelle Chart.js directement plutôt que de passer par CChart : la vue a
 * besoin de maîtriser l'infobulle, les greffons de dessin et la destruction
 * du canevas, trois choses que l'enveloppe CoreUI décide à notre place.
 *
 * Le canevas est absolu dans son conteneur : la hauteur vient du CSS, jamais
 * d'un attribut, sinon la bande des libellés d'axe finirait hors cadre et la
 * carte se mettrait à défiler sur quelques pixels.
 */

import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const Graphique = ({ type, data, options, plugins = [], hauteur = 300, aria }) => {
  const canevas = useRef(null)
  const instance = useRef(null)

  useEffect(() => {
    if (!canevas.current) return undefined

    instance.current = new Chart(canevas.current, { type, data, options, plugins })

    return () => {
      instance.current?.destroy()
      instance.current = null
    }
  }, [type, data, options, plugins])

  return (
    <div className="tdb-canevas" style={{ height: `${hauteur}px` }}>
      <canvas ref={canevas} role="img" aria-label={aria} />
    </div>
  )
}

Graphique.propTypes = {
  type: PropTypes.string.isRequired,
  data: PropTypes.object.isRequired,
  options: PropTypes.object,
  plugins: PropTypes.array,
  hauteur: PropTypes.number,
  aria: PropTypes.string,
}

export default Graphique
