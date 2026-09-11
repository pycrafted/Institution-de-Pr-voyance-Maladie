/**
 * AppSidebar Component
 *
 * Collapsible navigation sidebar with branding, menu items, and toggle controls.
 *
 * Features:
 * - Redux-controlled visibility state
 * - Light color scheme
 * - Fixed positioning, starting below the full-width top bar
 * - Session actions (settings, sign-out) pinned to the bottom, mirroring the
 *   icon pair in the top bar
 *
 * @component
 * @example
 * return (
 *   <AppSidebar />
 * )
 */

import React from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { CSidebar, CSidebarFooter } from '@coreui/react'
import { AppSidebarNav } from './AppSidebarNav'
import AppSidebarActions from './AppSidebarActions'

// sidebar nav config
import navigation from '../_nav'

/**
 * AppSidebar functional component
 *
 * Manages sidebar state with Redux:
 * - sidebarShow: Controls sidebar visibility
 *
 * Renders navigation from _nav.js configuration file.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns {React.ReactElement} Sidebar with navigation
 */
const AppSidebar = () => {
  const dispatch = useDispatch()
  const sidebarShow = useSelector((state) => state.sidebarShow)

  return (
    <CSidebar
      className="border-end"
      colorScheme="light"
      position="fixed"
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <AppSidebarNav items={navigation} />

      {/* Séparé de la navigation par un filet : ces deux entrées ne mènent pas
          à une section du dossier, elles concernent la session. */}
      <CSidebarFooter className="app-sidebar-pied">
        <AppSidebarActions />
      </CSidebarFooter>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
