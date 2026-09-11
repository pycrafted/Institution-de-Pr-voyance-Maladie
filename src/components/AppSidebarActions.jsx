/**
 * Pied du menu latéral : paramètres et déconnexion.
 *
 * Ces deux actions existent aussi dans la barre supérieure. Le doublon est
 * assumé : en haut elles sont à portée immédiate, en bas elles ferment la
 * colonne là où l'œil descend quand on a fini. Les deux jeux pointent vers la
 * même destination et la même fonction de sortie — si l'un change, l'autre
 * doit suivre.
 *
 * En icônes seules, côte à côte : deux intitulés en toutes lettres sous une
 * liste qui en compte déjà huit alourdiraient le bas de la colonne pour deux
 * commandes qu'on reconnaît à leur pictogramme. L'infobulle et le libellé
 * accessible portent le nom.
 *
 * Le filet vertical qui les sépare est celui qui sépare déjà l'identité des
 * outils dans la barre supérieure : même trait, même rôle — marquer que la
 * seconde commande n'est pas de même nature que la première.
 *
 * Seule la sortie prend le rouge SAR au survol : sans ça, les deux voisines se
 * ressembleraient et la différence de gravité disparaîtrait.
 */

import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilAccountLogout, cilSettings } from '@coreui/icons'

import { logout } from '../services/api'

const AppSidebarActions = () => {
  const navigate = useNavigate()

  const deconnecter = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <CTooltip content="Paramètres" placement="top">
        <NavLink
          to="/parametres"
          aria-label="Paramètres"
          className={({ isActive }) =>
            `app-sidebar-action${isActive ? ' app-sidebar-action-actif' : ''}`
          }
        >
          <CIcon icon={cilSettings} />
        </NavLink>
      </CTooltip>

      <span className="app-sidebar-filet" aria-hidden="true" />

      <CTooltip content="Déconnexion" placement="top">
        <button
          type="button"
          className="app-sidebar-action app-sidebar-action-sortie"
          onClick={deconnecter}
          aria-label="Déconnexion"
        >
          <CIcon icon={cilAccountLogout} />
        </button>
      </CTooltip>
    </>
  )
}

export default AppSidebarActions
