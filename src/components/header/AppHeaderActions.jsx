/**
 * Bloc de droite de la barre supérieure : identité, notifications,
 * paramètres, déconnexion.
 *
 * Trois cibles à plat, un clic chacune, aucun menu déroulant - la maquette de
 * référence n'affiche ni chevron ni avatar à côté du nom.
 *
 * Ordre : identité, filet, paramètres, déconnexion - la sortie occupe le
 * dernier rang, à l'extrémité de la barre.
 */

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilAccountLogout, cilSettings } from '@coreui/icons'

import { AUTH_EVENT, getMe, logout } from '../../services/api'
import Notifications from './Notifications'

const AppHeaderActions = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // Au chargement puis à chaque changement d'auth/profil (connexion, nom…),
  // on relit le profil pour garder la barre à jour.
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

  // Le temps que le profil revienne, la place reste vide : afficher une
  // identité provisoire reviendrait à montrer le nom de quelqu'un d'autre.
  const nom = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email : ''
  // Initiales pour la pastille d'avatar : prénom + nom, sinon la première
  // lettre de l'e-mail.
  const initiales = user
    ? (
        (user.first_name?.[0] || '') + (user.last_name?.[0] || '') ||
        user.email?.[0] ||
        ''
      ).toUpperCase()
    : ''

  return (
    <div className="app-navbar-actions">
      <Link to="/profil" className="app-navbar-identite">
        {initiales && (
          <span className="app-navbar-avatar" aria-hidden="true">
            {initiales}
          </span>
        )}
        <span className="app-navbar-identite-texte">
          <span className="app-navbar-identite-nom">{nom}</span>
        </span>
      </Link>

      <span className="app-navbar-filet" aria-hidden="true" />

      {/* Ce qui attend l'IPM : demandes de photo, bons d'optique à valider. */}
      <Notifications />

      <CTooltip content="Paramètres">
        <Link to="/parametres" className="app-navbar-icone" aria-label="Paramètres">
          <CIcon icon={cilSettings} />
        </Link>
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
