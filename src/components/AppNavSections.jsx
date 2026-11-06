/**
 * Les cinq sections de l'application, au centre de la barre supérieure.
 *
 * Elle remplace le menu latéral (2026-11-05). Le raisonnement est celui
 * d'OpsDigital, que le métier a sous les yeux toute la journée : les écrans
 * de l'IPM sont larges - onze colonnes sur un aperçu d'écritures, sept sur
 * les retenues - et une colonne de navigation prenait 15 % de la largeur pour
 * répéter en permanence une liste qu'on consulte trois fois par jour. La même
 * navigation à l'horizontale rend cette place au tableau.
 *
 * Deux niveaux, deux endroits :
 *
 *   - **ici**, dans la barre du haut : Tableau de bord, Fichiers, Documents,
 *     Traitements, Comptabilité ;
 *   - **en bas de l'écran** (<AppNavPages />), les pages de la section
 *     ouverte.
 *
 * Les sections ont d'abord eu leur propre rangée sous l'en-tête ; elles sont
 * remontées dedans le jour même. Cinq mots n'ont pas besoin d'une barre à
 * eux, et celle-ci coûtait 3 rem de hauteur sur chaque écran.
 *
 * Cliquer sur une section ouvre sa **première page**. « Tableau de bord »
 * n'en a pas : il mène directement à son écran, et la barre du bas disparaît.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import navigation from '../_nav'
import { amenerEnVue, sectionCourante, sectionsDe } from './navigation'

const AppNavSections = () => {
  const { pathname } = useLocation()
  const sections = useMemo(() => sectionsDe(navigation), [])
  const courante = sectionCourante(sections, pathname)
  const piste = useRef(null)

  useEffect(() => {
    amenerEnVue(piste.current, '.app-section-active')
  }, [pathname])

  return (
    <nav className="app-sections" aria-label="Sections de l'application">
      <div className="app-sections-piste" ref={piste}>
        {sections.map((section) => {
          const active = courante?.nom === section.nom
          // Une section hors service garde sa place et son intitulé - la voir
          // disparaître laisserait croire à une panne - mais n'est plus un
          // lien. Même règle que l'ancien menu.
          if (section.desactive || !section.to) {
            return (
              <span
                key={section.nom}
                className="app-section app-section-inerte"
                aria-disabled="true"
              >
                {section.nom}
              </span>
            )
          }
          return (
            <NavLink
              key={section.nom}
              to={section.to}
              className={`app-section${active ? ' app-section-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {section.nom}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

export default React.memo(AppNavSections)
