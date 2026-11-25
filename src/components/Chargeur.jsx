/**
 * LE chargeur des PAGES de l'application - un seul, partout.
 *
 * Une file de vingt-six points qui parcourt un huit couché en se croisant au
 * centre : le chargeur d'OpsDigital, repris le 2026-11-25 à la demande de
 * l'utilisateur, aux couleurs de l'IPM (cf. chargeur.scss, qui dérive ses
 * teintes de l'accent et porte le chemin).
 *
 * Il remplace l'écran d'attente précédent - logo SAR et barre de progression
 * rouge. Il ne sert PAS au chargement des données d'un tableau : ces écrans
 * gardent le leur (texte, petit spinner, squelettes de lignes).
 *
 * Deux tailles, une seule différence entre elles : la largeur du huit.
 *   - `pleinEcran` : chargement initial de l'application, par-dessus tout ;
 *   - par défaut   : changement de page, dans la zone de contenu ;
 *   - `ligne`      : variante réduite, pour une attente logée dans un bloc.
 */

import React from 'react'
import PropTypes from 'prop-types'

import './chargeur.scss'

/** Vingt-six points (cf. la boucle `@for` de la feuille de styles). */
const POINTS = Array.from({ length: 26 })

const Chargeur = ({ pleinEcran = false, ligne = false, libelle = 'Chargement…' }) => (
  <div
    className={`chargeur${pleinEcran ? ' chargeur--plein' : ''}${ligne ? ' chargeur--ligne' : ''}`}
    role="status"
    aria-live="polite"
  >
    <span className="chargeur-huit" aria-hidden="true">
      <span className="chargeur-piste">
        {POINTS.map((_, i) => (
          <i key={i} className="chargeur-point" />
        ))}
      </span>
    </span>
    <p className="chargeur-libelle">{libelle}</p>
  </div>
)

Chargeur.propTypes = {
  pleinEcran: PropTypes.bool,
  ligne: PropTypes.bool,
  libelle: PropTypes.string,
}

export default Chargeur
