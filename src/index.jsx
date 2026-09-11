import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import 'core-js'

import App from './App'
import store from './store'
import { getToken } from './services/api'
import { prechargerReferentiels } from './services/referentiels'

// Précharge les référentiels de Données de base en mémoire dès le lancement,
// pour que les lectures synchrones (cascades de la fiche participant) disposent
// des données sans attendre le réseau. Sans blocage : l'app s'affiche tout de
// suite, le store se remplit en arrière-plan (quelques centaines de ms).
//
// Seulement si une session existe : l'API est fermée, et sans jeton ces appels
// ne rapporteraient que des 401. À la connexion, Login.jsx relance le
// préchargement.
if (getToken()) {
  prechargerReferentiels().catch(() => {
    // Backend injoignable ou jeton périmé : les écrans concernés afficheront
    // leur propre erreur au chargement. On ne bloque pas le démarrage.
  })
}

createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <App />
  </Provider>,
)
