import React from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'

import { routes } from '../routes'

import { CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilArrowLeft, cilArrowRight } from '@coreui/icons'

/**
 * Breadcrumb style OpenKM avec boutons Back / Forward et chemin
 * affiché comme un "path" (sar / produits).
 */
const AppBreadcrumb = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname

  const getRouteName = (pathname) => {
    const r = routes.find((route) => route.path === pathname)
    return r ? r.name : null
  }

  const segments = currentPath
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const path = '/' + seg
      return { segment: seg, path, name: getRouteName(path) || seg }
    })

  return (
    <div className="d-flex align-items-center gap-2 small w-100">
      <CButton
        size="sm"
        color="light"
        variant="outline"
        className="header-nav-btn"
        onClick={() => navigate(-1)}
        title="Retour"
      >
        <CIcon icon={cilArrowLeft} size="sm" />
      </CButton>
      <CButton
        size="sm"
        color="light"
        variant="outline"
        className="header-nav-btn"
        onClick={() => navigate(1)}
        title="Avancer"
      >
        <CIcon icon={cilArrowRight} size="sm" />
      </CButton>

      <span className="path-separator">/</span>
      <NavLink to="/" className="path-segment">
        sar
      </NavLink>
      {segments.map((s, i) => (
        <React.Fragment key={s.path}>
          <span className="path-separator">/</span>
          {i < segments.length - 1 ? (
            <NavLink to={s.path} className="path-segment">
              {s.name.toLowerCase()}
            </NavLink>
          ) : (
            <span className="path-segment path-segment-active">{s.name.toLowerCase()}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default React.memo(AppBreadcrumb)
