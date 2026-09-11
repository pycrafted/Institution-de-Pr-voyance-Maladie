/**
 * AppHeader — barre supérieure de l'application.
 *
 * Elle porte l'identité : logo SAR et nom de l'institution à gauche, menu
 * utilisateur à droite. Elle occupe toute la largeur et le sidebar commence
 * en dessous, comme sur la maquette de référence.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import AppHeaderActions from './header/AppHeaderActions'
import sarLogo from '../assets/sitesar.png'

const AppHeader = () => {
  return (
    <header className="app-navbar">
      <Link to="/" className="app-navbar-marque">
        <img src={sarLogo} alt="SAR" className="app-navbar-logo" />
        <span className="app-navbar-nom">Institution de Prévoyance Maladie (IPM)</span>
      </Link>

      <AppHeaderActions />
    </header>
  )
}

export default React.memo(AppHeader)
