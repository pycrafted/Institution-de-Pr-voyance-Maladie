/**
 * AppHeader - barre supérieure de l'application.
 *
 * Le logo de l'institution à gauche, **les cinq sections au centre**, trois
 * icônes à droite. Une seule barre, donc : les sections avaient d'abord leur
 * propre rangée sous celle-ci, ce qui coûtait 3 rem de hauteur sur chaque
 * écran pour cinq mots qui tiennent largement ici.
 *
 * Deux choses l'ont quittée le 2026-11-05, et pour la même raison : la
 * navigation est descendue d'un cran. Le bouton qui dépliait le menu latéral
 * est parti avec lui ; le **fil d'Ariane** aussi, parce qu'il répétait mot
 * pour mot ce que les deux barres montrent déjà - la section en rouge en
 * haut, la page soulignée en bas. « Accueil / Fichiers / Données de base »
 * était une troisième façon de dire où l'on se trouve, et la moins visible
 * des trois.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import logoIpm from '../assets/logo-ipm.png'
import AppNavSections from './AppNavSections'
import AppHeaderActions from './header/AppHeaderActions'

const AppHeader = () => {
  return (
    <header className="app-navbar">
      <Link to="/" className="app-navbar-marque" aria-label="Institution de Prévoyance Maladie">
        {/* Le nom n'est pas perdu : il reste dans `alt` et dans le titre de
            l'onglet. Un logo le dit plus vite, et sans prendre la largeur
            d'une colonne de tableau sur chaque page. */}
        <img src={logoIpm} alt="Institution de Prévoyance Maladie" className="app-navbar-logo" />
      </Link>

      <AppNavSections />

      <AppHeaderActions />
    </header>
  )
}

export default React.memo(AppHeader)
