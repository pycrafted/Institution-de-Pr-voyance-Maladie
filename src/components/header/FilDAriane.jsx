/**
 * Fil d'Ariane de la barre du haut.
 *
 * « Accueil / Fichiers / Paramètres », comme l'application d'origine : la
 * section vient du menu (_nav.jsx), la page du nom de l'entrée qui porte la
 * route courante. Sur une route inconnue du menu, le libellé de la route sert
 * de dernier repère.
 */

import React from 'react'
import { Link, useLocation } from 'react-router-dom'

import navigation from '../../_nav'
import { routes } from '../../routes'

const ACCUEIL = '/tableau-de-bord'

/**
 * Remonte le menu : pour chaque entrée, on retient l'intitulé de section qui la
 * précède. La route la plus longue qui amorce le chemin gagne - « /documents/
 * bons-optique » l'emporte ainsi sur « /documents ».
 */
const situer = (chemin) => {
  let section = null
  let trouve = null
  navigation.forEach((entree) => {
    if (!entree.to) {
      section = entree.name
      return
    }
    if (chemin === entree.to || chemin.startsWith(`${entree.to}/`)) {
      if (!trouve || entree.to.length > trouve.to.length) trouve = { ...entree, section }
    }
  })
  return trouve
}

const FilDAriane = () => {
  const { pathname } = useLocation()
  const entree = situer(pathname)
  const page = entree?.name || routes.find((r) => r.path === pathname)?.name

  // Sur l'accueil, le fil n'apprendrait rien : la barre garde son seul titre.
  if (!page || pathname === ACCUEIL) return null

  return (
    <nav className="app-navbar-fil" aria-label="Fil d’Ariane">
      <Link to={ACCUEIL}>Accueil</Link>
      {entree?.section && (
        <>
          <span className="app-navbar-fil-separateur">/</span>
          <span>{entree.section}</span>
        </>
      )}
      <span className="app-navbar-fil-separateur">/</span>
      <span className="app-navbar-fil-courant">{page}</span>
    </nav>
  )
}

export default FilDAriane
