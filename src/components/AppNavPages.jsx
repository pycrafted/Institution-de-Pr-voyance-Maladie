/**
 * Barre du bas - les pages de la section ouverte.
 *
 * Le second niveau de la navigation, posé en bas de l'écran comme dans
 * OpsDigital. L'endroit n'est pas arbitraire : la section se choisit rarement
 * et vit en haut, la page se change souvent et vit sous la main, au bord de
 * l'écran, là où le pouce et le curseur reviennent.
 *
 * « Traitements » porte neuf pages, et c'est la plus fournie : la piste
 * défile horizontalement plutôt que de se replier sur deux lignes, qui
 * feraient bouger la hauteur du tableau d'une section à l'autre.
 *
 * La barre **disparaît** quand la section n'a pas de pages (« Tableau de
 * bord »). Une barre vide prendrait de la hauteur pour ne rien dire, et le
 * gabarit s'ajuste - cf. `app-a-barre-pages` sur le wrapper.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import navigation from '../_nav'
import { amenerEnVue, sectionCourante, sectionsDe } from './navigation'

const AppNavPages = () => {
  const { pathname } = useLocation()
  const sections = useMemo(() => sectionsDe(navigation), [])
  const courante = sectionCourante(sections, pathname)
  const pages = courante?.pages || []
  const piste = useRef(null)

  useEffect(() => {
    amenerEnVue(piste.current, '.app-page-active')
  }, [pathname])

  // Le gabarit doit savoir si la barre est là : sans ce drapeau, le contenu
  // garderait une marge basse sur le tableau de bord, qui n'a pas de pages.
  useEffect(() => {
    document.body.classList.toggle('app-a-barre-pages', pages.length > 0)
    return () => document.body.classList.remove('app-a-barre-pages')
  }, [pages.length])

  if (!pages.length) return null

  return (
    <nav className="app-pages" aria-label={`Pages de ${courante.nom}`}>
      <div className="app-pages-piste" ref={piste}>
        {pages.map((page) =>
          page.desactive ? (
            <span key={page.to} className="app-page app-page-inerte" aria-disabled="true">
              {page.nom}
            </span>
          ) : (
            <NavLink
              key={page.to}
              to={page.to}
              className={({ isActive }) => `app-page${isActive ? ' app-page-active' : ''}`}
            >
              {page.nom}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  )
}

export default React.memo(AppNavPages)
