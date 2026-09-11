/**
 * Pagination des tableaux de référentiels.
 *
 * Reprend le vocabulaire visuel du template : page courante en pastille noire,
 * chiffres sobres, flèches de part et d'autre. Au-delà de sept pages, seules
 * la première, la dernière et les voisines de la page courante sont listées,
 * les trous étant marqués par des points de suspension.
 */

import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight } from '@coreui/icons'

const SEUIL_COMPACT = 7

/** Suite de numéros à afficher, points de suspension compris. */
const numerosAffiches = (page, nbPages) => {
  if (nbPages <= SEUIL_COMPACT) {
    return Array.from({ length: nbPages }, (_, i) => i + 1)
  }

  const retenus = [...new Set([1, page - 1, page, page + 1, nbPages])]
    .filter((n) => n >= 1 && n <= nbPages)
    .sort((a, b) => a - b)

  const avecTrous = []
  retenus.forEach((n, i) => {
    if (i > 0 && n - retenus[i - 1] > 1) avecTrous.push(`trou-${n}`)
    avecTrous.push(n)
  })
  return avecTrous
}

const Pagination = ({ page, nbPages, onChange }) => {
  if (nbPages <= 1) return null

  return (
    <nav className="ddb-pagination" aria-label="Pagination du tableau">
      <button
        type="button"
        className="ddb-page ddb-page-fleche"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Page précédente"
      >
        <CIcon icon={cilChevronLeft} size="sm" />
      </button>

      {numerosAffiches(page, nbPages).map((n) =>
        typeof n === 'number' ? (
          <button
            type="button"
            key={n}
            className={`ddb-page${n === page ? ' ddb-page-active' : ''}`}
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
          >
            {n}
          </button>
        ) : (
          <span key={n} className="ddb-page-trou">
            …
          </span>
        ),
      )}

      <button
        type="button"
        className="ddb-page ddb-page-fleche"
        onClick={() => onChange(page + 1)}
        disabled={page === nbPages}
        aria-label="Page suivante"
      >
        <CIcon icon={cilChevronRight} size="sm" />
      </button>
    </nav>
  )
}

export default Pagination
