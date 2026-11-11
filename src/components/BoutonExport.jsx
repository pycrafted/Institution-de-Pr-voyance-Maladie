/**
 * Bouton Export unique de l'application.
 *
 * Avant, chaque page avait sa propre classe (jc-export, pc-export,
 * cot-bouton-vert, rfm-bouton-vert, ddb-outil-export, ic-btn-sec...), sa propre
 * icone (nuage ou tableur) et son propre libelle (« Export Excel » ou
 * « Exporter »). Le metier l'a releve le 2026-11-09 : aucun ne se ressemblait.
 * Ce composant unique fixe l'apparence - vert « Excel », icone tableur, libelle
 * - en un seul endroit ; son style vit dans style.scss (.bouton-export),
 * charge une fois pour toute l'application.
 */
import React from 'react'
import PropTypes from 'prop-types'
import CIcon from '@coreui/icons-react'
import { cilSpreadsheet } from '@coreui/icons'

const BoutonExport = ({ onClick, disabled = false, libelle = 'Exporter', title, className }) => (
  <button
    type="button"
    className={`bouton-export${className ? ` ${className}` : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    <CIcon icon={cilSpreadsheet} className="bouton-export-icone" />
    {libelle}
  </button>
)

BoutonExport.propTypes = {
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  libelle: PropTypes.string,
  title: PropTypes.string,
  className: PropTypes.string,
}

export default BoutonExport
