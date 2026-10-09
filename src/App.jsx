/**
 * App Component
 *
 * Root application component that sets up routing and lazy-loaded page
 * components with suspense boundaries.
 *
 * Features:
 * - Client-side routing with BrowserRouter (adresses sans dièse)
 * - Lazy loading for all routes with loading spinner fallback
 * - Public routes (login, register, error pages)
 * - Protected routes wrapped in DefaultLayout
 *
 * L'application n'a qu'un seul thème, le clair : il est fixé sur la balise
 * <html> dans index.html. Ni bascule, ni préférence enregistrée, ni lecture du
 * réglage du système - il n'y a rien à choisir ici.
 *
 * @module App
 */

import React, { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import './scss/style.scss'

import ChargeurSar from './components/ChargeurSar'
import { getToken } from './services/api'

// Containers
const DefaultLayout = React.lazy(() => import('./layout/DefaultLayout'))

// Pages
const Login = React.lazy(() => import('./views/pages/login/Login'))

/**
 * Barrière d'entrée de l'application.
 *
 * La présence d'un jeton suffit à décider de l'affichage ; sa validité, elle,
 * est tranchée par l'API à chaque appel. Un jeton révoqué se solde par un 401,
 * que `services/api.js` traite en fermant la session et en ramenant ici.
 */
const RouteProtegee = ({ children }) => (getToken() ? children : <Navigate to="/login" replace />)

/**
 * Main Application Component
 *
 * Manages application-wide concerns:
 * - Client-side routing configuration
 * - Lazy loading with suspense fallbacks
 *
 * @component
 * @returns {React.ReactElement} Application root with routing
 *
 * @example
 * // Standard usage in index.js
 * import App from './App'
 * ReactDOM.render(<App />, document.getElementById('root'))
 */
// Adresses ordinaires (/participants) et non /#/participants : c'est ce que
// lisent les agents, ce qu'ils mettent en favori et ce qu'ils collent dans un
// message. En contrepartie, le serveur voit maintenant chaque chemin et doit
// renvoyer index.html pour tous ceux qui ne sont pas un fichier - la règle de
// repli est dans deploy/web.config.
const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<ChargeurSar pleinEcran />}>
        <Routes>
          <Route exact path="/login" name="Login Page" element={<Login />} />
          <Route
            path="*"
            name="Home"
            element={
              <RouteProtegee>
                <DefaultLayout />
              </RouteProtegee>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
