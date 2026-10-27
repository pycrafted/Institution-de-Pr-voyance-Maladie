/**
 * Cloche de la barre supérieure : ce qui attend une action de l'IPM.
 *
 * Les demandes de changement de photo et les bons d'optique pris avant les
 * deux ans, déposés depuis l'application mobile. Le serveur les compte
 * (GET /api/notifications/) ; la cloche se relit à chaque changement de page
 * et toutes les minutes. Une notification disparaît d'elle-même quand la
 * demande est traitée : il n'y a rien à marquer « lu ».
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBell } from '@coreui/icons'

import { request } from '../../services/api'

const RELECTURE_MS = 60_000

const Notifications = () => {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [donnees, setDonnees] = useState({ total: 0, elements: [] })
  const [ouvert, setOuvert] = useState(false)
  const zone = useRef(null)

  const relire = useCallback(async () => {
    try {
      setDonnees(await request('/notifications/'))
    } catch {
      // Hors ligne ou session close : la cloche garde son dernier état.
    }
  }, [])

  // À chaque page (une action vient peut-être de traiter une demande), puis
  // toutes les minutes.
  useEffect(() => {
    // L'état ne change qu'au retour de la requête, pas dans l'effet lui-même.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    relire()
  }, [relire, pathname, search])
  useEffect(() => {
    const minuteur = window.setInterval(relire, RELECTURE_MS)
    return () => window.clearInterval(minuteur)
  }, [relire])

  // Un clic ailleurs referme le menu.
  useEffect(() => {
    if (!ouvert) return undefined
    const fermer = (e) => {
      if (zone.current && !zone.current.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [ouvert])

  const aller = (lien) => {
    setOuvert(false)
    navigate(lien)
  }

  const { total, elements } = donnees

  return (
    <div className="app-notifs" ref={zone}>
      {/* L'infobulle se tait menu ouvert : elle couvrirait l'icône voisine. */}
      {ouvert ? (
        <button
          type="button"
          className="app-navbar-icone app-notifs-cloche"
          aria-label={total ? `Notifications : ${total} en attente` : 'Notifications'}
          aria-expanded={ouvert}
          onClick={() => {
            setOuvert((o) => !o)
            relire()
          }}
        >
          <CIcon icon={cilBell} />
          {total > 0 && <span className="app-notifs-pastille">{total > 99 ? '99+' : total}</span>}
        </button>
      ) : (
        <CTooltip content="Notifications">
          <button
            type="button"
            className="app-navbar-icone app-notifs-cloche"
            aria-label={total ? `Notifications : ${total} en attente` : 'Notifications'}
            aria-expanded={ouvert}
            onClick={() => {
              setOuvert((o) => !o)
              relire()
            }}
          >
            <CIcon icon={cilBell} />
            {total > 0 && <span className="app-notifs-pastille">{total > 99 ? '99+' : total}</span>}
          </button>
        </CTooltip>
      )}

      {ouvert && (
        <div className="app-notifs-menu" role="menu">
          <div className="app-notifs-titre">Notifications</div>
          {elements.length === 0 ? (
            <p className="app-notifs-vide">Rien n’attend votre action.</p>
          ) : (
            elements.map((e) => (
              <button
                key={e.cle}
                type="button"
                role="menuitem"
                className="app-notifs-element"
                onClick={() => aller(e.lien)}
              >
                <span className="app-notifs-nombre">{e.nombre}</span>
                <span className="app-notifs-textes">
                  <span className="app-notifs-libelle">{e.titre}</span>
                  <span className="app-notifs-message">{e.message}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default Notifications
