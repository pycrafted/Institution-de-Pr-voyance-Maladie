/**
 * AppHeader - barre supérieure de l'application.
 *
 * Trois temps, de gauche à droite : le logo et le nom de l'institution, la
 * **recherche globale**, les icônes du compte.
 *
 * Deux choses y ont vécu quelques minutes le 2026-11-26 et en sont reparties
 * aussitôt, l'utilisateur les trouvant inutiles et encombrantes : des
 * pastilles d'en-cours (« 2 à traiter ») et l'identité de l'agent écrite en
 * toutes lettres. La barre garde donc le logo, le nom et la recherche, et
 * rien d'autre.
 *
 * **Les cinq sections l'ont quittée le 2026-11-26** : elles sont reparties
 * dans un menu à gauche (<AppMenu />), à la demande du métier. Elles avaient
 * occupé son centre depuis le 2026-11-05, le temps que dure la navigation
 * horizontale. Le centre resté vide a été repris le même jour par la
 * recherche, qui est le seul manque que le menu ne comble pas : chaque écran
 * a la sienne, aucune ne traverse l'application.
 *
 * Le **fil d'Ariane** l'avait quittée le 2026-11-05, parce qu'il répétait mot
 * pour mot ce que les barres de navigation montraient déjà. Il reste absent :
 * le menu dit la même chose, en permanence et au même endroit - la section
 * dépliée, la page peinte à l'accent.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import logoIpm from '../assets/logo-ipm.png'
import AppHeaderActions from './header/AppHeaderActions'
import RechercheGlobale from './header/RechercheGlobale'

const AppHeader = () => {
  return (
    <header className="app-navbar">
      <Link to="/" className="app-navbar-marque" aria-label="Institution de Prévoyance Maladie">
        <img src={logoIpm} alt="" className="app-navbar-logo" />
        {/* Le nom est REVENU le 2026-11-26. Il avait quitté la barre le
            2026-11-05 parce qu'il y prenait la largeur d'une colonne de
            tableau ; depuis que les cinq sections sont descendues dans le
            menu de gauche, cette barre n'a plus rien entre le logo et les
            icônes du compte, et le vide ne dit rien à personne.
            Le `alt` de l'image passe à vide : le nom étant maintenant écrit
            à côté, le lire deux fois ne sert personne (l'intitulé du lien
            reste porté par son `aria-label`). */}
        <span className="app-navbar-nom">Institution de Prévoyance Maladie</span>
      </Link>

      <RechercheGlobale />
      <AppHeaderActions />
    </header>
  )
}

export default React.memo(AppHeader)
