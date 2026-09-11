/**
 * DefaultLayout Component
 *
 * Main application layout wrapper that composes the primary UI structure
 * for authenticated/protected routes.
 *
 * Layout structure:
 * - AppHeader: Fixed top bar spanning the full width of the screen
 * - AppSidebar: Fixed navigation sidebar, starting below the top bar
 * - AppContent: Main content area with route rendering
 *
 * This layout is used for all routes defined in routes.js, providing
 * a consistent structure across the application.
 *
 * @component
 * @example
 * // Used in App.js for protected routes
 * <Route path="*" element={<DefaultLayout />} />
 */

import React from 'react'
import { AppContent, AppHeader, AppSidebar } from '../components/index'
import ToastHost from '../components/ToastHost'

/**
 * DefaultLayout functional component
 *
 * Renders the main application layout with:
 * - Fixed sidebar navigation
 * - Sticky header
 * - Flexible content area
 *
 * Uses flexbox for proper content stretching.
 *
 * @returns {React.ReactElement} Complete application layout
 */
const DefaultLayout = () => {
  return (
    <>
      {/* La barre est sortie du wrapper et placée avant le menu : c'est ce qui
          lui donne toute la largeur de l'écran. CoreUI ne réserve la place du
          menu qu'aux éléments qui le suivent dans le document — la barre, qui
          le précède désormais, y échappe, et le wrapper la garde. */}
      <AppHeader />
      <AppSidebar />
      <div className="wrapper d-flex flex-column">
        <div className="body flex-grow-1 pt-3">
          <AppContent />
        </div>
        <ToastHost />
      </div>
    </>
  )
}

export default DefaultLayout
