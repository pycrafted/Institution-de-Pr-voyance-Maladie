/**
 * Écran de chargement aux couleurs de la SAR.
 *
 * Sert d'attente (fallback Suspense) pendant le chargement des pages : logo,
 * dénomination, et une barre de progression indéterminée qui tourne tant que la
 * page n'est pas prête.
 *
 * @param {boolean} pleinEcran  occupe tout l'écran (chargement initial de
 *   l'application) plutôt que la seule zone de contenu (changement de page).
 */

import React from 'react'
import PropTypes from 'prop-types'

import sarLogo from '../assets/sitesar.png'
import './chargeur-sar.scss'

const ChargeurSar = ({ pleinEcran = false }) => (
  <div
    className={`chargeur-sar${pleinEcran ? ' chargeur-sar--plein' : ''}`}
    role="status"
    aria-live="polite"
  >
    <div className="chargeur-sar__marque">
      <img src={sarLogo} alt="SAR" className="chargeur-sar__logo" />
      <p className="chargeur-sar__societe">Société Africaine de Raffinage</p>
    </div>
    <div className="chargeur-sar__barre" aria-hidden="true">
      <span className="chargeur-sar__progression" />
    </div>
    <span className="visually-hidden">Chargement…</span>
  </div>
)

ChargeurSar.propTypes = {
  pleinEcran: PropTypes.bool,
}

export default ChargeurSar
