/**
 * AppHeader - barre supérieure de l'application.
 *
 * Elle vient après le menu, à sa droite, comme dans OpsDigital : le bouton du
 * menu, le logo SAR et le nom de l'institution à gauche, le fil d'Ariane
 * ensuite, le menu utilisateur à droite.
 *
 * Le menu reste déplié et garde sa place à gauche : le contenu commence après
 * lui, jamais dessous. Le bouton de la barre le retire ou le rappelle.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import CIcon from '@coreui/icons-react'
import { cilMenu } from '@coreui/icons'

import AppHeaderActions from './header/AppHeaderActions'
import FilDAriane from './header/FilDAriane'

const AppHeader = () => {
  const dispatch = useDispatch()
  const sidebarShow = useSelector((state) => state.sidebarShow)

  const basculerMenu = () => dispatch({ type: 'set', sidebarShow: !sidebarShow })

  return (
    <header className="app-navbar">
      <button
        type="button"
        className="app-navbar-menu"
        onClick={basculerMenu}
        aria-label={sidebarShow ? 'Masquer le menu' : 'Afficher le menu'}
        title={sidebarShow ? 'Masquer le menu' : 'Afficher le menu'}
      >
        <CIcon icon={cilMenu} />
      </button>

      <Link to="/" className="app-navbar-marque">
        <span className="app-navbar-nom">Institution de Prévoyance Maladie</span>
      </Link>

      <FilDAriane />

      <AppHeaderActions />
    </header>
  )
}

export default React.memo(AppHeader)
