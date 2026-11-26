/**
 * AppMenu - le menu de l'application, dans une colonne à gauche.
 *
 * **Retour du menu latéral (2026-11-26), à la demande du métier.** Les cinq
 * sections ont vécu trois semaines dans la barre du haut (2026-11-05), leurs
 * pages dans une seconde barre juste en dessous. L'argument d'alors tient
 * toujours - les écrans de l'IPM sont larges, et une colonne de navigation
 * prend de la place en permanence - mais les gens de l'IPM préfèrent retrouver
 * les sections à gauche, comme dans l'application d'origine. L'habitude de
 * l'outil l'emporte sur la largeur gagnée.
 *
 * Les deux niveaux tiennent désormais dans la même colonne, l'un sous l'autre :
 *
 *   - la **section** se déplie sur ses pages d'un clic sur son intitulé ;
 *   - la **page** ouverte est peinte à l'accent, comme l'était la pastille de
 *     l'ancienne barre.
 *
 * « Tableau de bord » n'a pas de pages : c'est un lien direct, pas un
 * dépliant.
 *
 * `_nav.jsx` reste la **seule** source : ajouter une page là-dedans la fait
 * apparaître ici, sans toucher à ce fichier (cf. navigation.js).
 */

import React, { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilChevronBottom } from '@coreui/icons'

import navigation from '../_nav'
import { sectionCourante, sectionsDe } from './navigation'

const AppMenu = () => {
  const { pathname } = useLocation()
  const sections = useMemo(() => sectionsDe(navigation), [])
  const courante = sectionCourante(sections, pathname)

  /**
   * **Une seule section ouverte à la fois** (2026-11-26, demande de
   * l'utilisateur) : ouvrir « Traitements » referme « Documents ». Neuf pages
   * de Traitements plus quatre de Documents dépassaient l'écran, et l'on
   * perdait de vue les sections du bas.
   *
   * L'état ne retient donc qu'un nom, et trois valeurs se distinguent :
   *   - `undefined` : l'utilisateur n'a rien choisi, c'est la section où l'on
   *     se trouve qui est dépliée ;
   *   - un nom : celle-là, et elle seule ;
   *   - `null` : il a refermé, aucune n'est dépliée.
   *
   * Déduit de la route plutôt que recopié dans un effet : un effet qui
   * recopie la route dans un état rend deux fois à chaque navigation, et
   * finit toujours par diverger de ce qu'il suit.
   */
  const [choisie, setChoisie] = useState(undefined)
  const nomOuvert = choisie === undefined ? courante?.nom : choisie
  const basculer = (section) => setChoisie(nomOuvert === section.nom ? null : section.nom)

  return (
    <nav className="app-menu" aria-label="Menu de l'application">
      <ul className="app-menu-liste">
        {sections.map((section) => {
          const ouverte = nomOuvert === section.nom

          // Une section hors service garde sa place et son intitulé - la voir
          // disparaître laisserait croire à une panne - mais n'est plus un
          // lien. Même règle que les barres qu'elle remplace.
          if (section.desactive || !section.to) {
            return (
              <li key={section.nom} className="app-menu-entree">
                <span className="app-menu-section app-menu-inerte" aria-disabled="true">
                  {section.icone}
                  <span className="app-menu-libelle">{section.nom}</span>
                </span>
              </li>
            )
          }

          // Sans pages (« Tableau de bord ») : un lien, pas un dépliant.
          if (!section.pages.length) {
            return (
              <li key={section.nom} className="app-menu-entree">
                <NavLink
                  to={section.to}
                  className={({ isActive }) =>
                    `app-menu-section${isActive ? ' app-menu-section-active' : ''}`
                  }
                >
                  {section.icone}
                  <span className="app-menu-libelle">{section.nom}</span>
                </NavLink>
              </li>
            )
          }

          return (
            <li key={section.nom} className="app-menu-entree">
              <button
                type="button"
                className={`app-menu-section${ouverte ? ' app-menu-section-ouverte' : ''}`}
                aria-expanded={ouverte}
                onClick={() => basculer(section)}
              >
                {section.icone}
                <span className="app-menu-libelle">{section.nom}</span>
                <CIcon
                  icon={cilChevronBottom}
                  className={`app-menu-fleche${ouverte ? ' app-menu-fleche-ouverte' : ''}`}
                />
              </button>

              {ouverte && (
                <ul className="app-menu-pages">
                  {section.pages.map((page) => (
                    <li key={page.to}>
                      {page.desactive ? (
                        <span className="app-menu-page app-menu-inerte" aria-disabled="true">
                          {page.nom}
                        </span>
                      ) : (
                        <NavLink
                          to={page.to}
                          className={({ isActive }) =>
                            `app-menu-page${isActive ? ' app-menu-page-active' : ''}`
                          }
                        >
                          {page.nom}
                        </NavLink>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default React.memo(AppMenu)
