/**
 * Bloc de droite de la barre supérieure : profil, paramètres, déconnexion.
 *
 * **Trois icônes, et rien d'écrit** (2026-11-05). L'adresse de l'agent
 * s'étalait en toutes lettres - « essai.rfm@sar.sn » - pour une information
 * qu'il connaît déjà : c'est la sienne. Elle prenait la largeur d'une colonne
 * de tableau à l'endroit le plus précieux de l'écran, et elle revenait sur
 * chaque page. Le nom reste accessible - il s'affiche au survol de l'icône du
 * profil, et la fiche est à un clic.
 *
 * Trois cibles à plat, un clic chacune, aucun menu déroulant. La sortie
 * occupe le dernier rang, à l'extrémité de la barre.
 */

import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilAccountLogout, cilSettings, cilUser } from '@coreui/icons'

import { AUTH_EVENT, getMe, logout } from '../../services/api'

const AppHeaderActions = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // Au chargement puis à chaque changement d'auth/profil (connexion, nom…),
  // on relit le profil pour garder l'infobulle à jour.
  useEffect(() => {
    const refresh = () => getMe().then((u) => setUser(u))
    refresh()
    window.addEventListener(AUTH_EVENT, refresh)
    return () => window.removeEventListener(AUTH_EVENT, refresh)
  }, [])

  const deconnecter = async () => {
    await logout()
    setUser(null)
    navigate('/login')
  }

  // Le nom ne s'affiche plus, mais il n'est pas perdu : l'infobulle le porte.
  // Tant que le profil n'est pas revenu, l'icône annonce simplement « Profil »
  // - montrer une identité provisoire reviendrait à montrer celle d'un autre.
  const nom = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email : ''

  // Ces deux écrans ne figurent dans aucune section : la barre du bas est vide
  // et aucune section ne s'allume quand on y est. Sans état actif sur
  // l'icône, plus rien à l'écran ne dirait où l'on se trouve - c'est devenu
  // vrai pour Paramètres le 2026-11-06, quand son doublon a quitté
  // « Fichiers ».
  const etat = ({ isActive }) => `app-navbar-icone${isActive ? ' app-navbar-icone-actif' : ''}`

  return (
    <div className="app-navbar-actions">
      <CTooltip content={nom || 'Profil'}>
        <NavLink to="/profil" className={etat} aria-label={nom ? `Profil : ${nom}` : 'Profil'}>
          <CIcon icon={cilUser} />
        </NavLink>
      </CTooltip>

      <CTooltip content="Paramètres">
        <NavLink to="/parametres" className={etat} aria-label="Paramètres">
          <CIcon icon={cilSettings} />
        </NavLink>
      </CTooltip>

      <CTooltip content="Déconnexion">
        <button
          type="button"
          className="app-navbar-icone app-navbar-icone-sortie"
          onClick={deconnecter}
          aria-label="Déconnexion"
        >
          <CIcon icon={cilAccountLogout} />
        </button>
      </CTooltip>
    </div>
  )
}

export default AppHeaderActions
