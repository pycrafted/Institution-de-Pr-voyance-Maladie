/**
 * Écran d'attente d'une section non encore développée.
 *
 * Un seul composant sert toutes ces pages : il se reconnaît à l'URL courante
 * et lit sa description dans pagesAVenir.js.
 */

import React from 'react'
import { useLocation } from 'react-router-dom'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'

import { pageAVenirParChemin } from './pagesAVenir'
import './page-a-venir.scss'

const PageAVenir = () => {
  const { pathname } = useLocation()
  const page = pageAVenirParChemin(pathname)

  if (!page) return null

  return (
    <CCard className="av-carte">
      <CCardBody className="av-corps">
        <span className="av-pastille">
          <CIcon icon={page.icone} size="xl" />
        </span>

        <h1 className="av-titre">{page.titre}</h1>
      </CCardBody>
    </CCard>
  )
}

export default PageAVenir
