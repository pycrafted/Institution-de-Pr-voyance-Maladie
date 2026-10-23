import { setupIonicReact } from '@ionic/react'
import { createRoot } from 'react-dom/client'

// Feuilles de style d'Ionic : socle obligatoire, puis utilitaires.
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'
// Mode sombre posé par une classe sur <html> (theme/apparence.ts) : c'est
// l'employé qui choisit, clair par défaut, et non le réglage du téléphone.
import '@ionic/react/css/palettes/dark.class.css'

import './theme/variables.css'
import './theme/global.css'
import './components/composants.css'

import App from './App'
import { appliquerApparence } from './theme/apparence'
import { ecouterInstallation } from './utils/installation'

// Mode « md » IMPOSÉ sur toutes les plateformes (y compris iPhone). La refonte
// copie à l'identique le langage Material Design 3 d'une vraie application
// Flutter/Android : Ionic rend alors partout les composants Material — l'onde
// à l'appui (ripple), les transitions de pages Android, les contrôles de
// formulaire Material — et plus l'habillage iOS. C'est ce mode, et non une
// imitation en CSS, qui fait percevoir une « vraie app mobile ».
setupIonicReact({
  mode: 'md',
  // Aucune chaîne HTML interprétée dans les alertes/toasts (données du serveur).
  innerHTMLTemplatesEnabled: false,
})

// Avant le premier rendu : l'écran s'ouvre directement dans le bon ton.
appliquerApparence()

// Au plus tôt : Chrome n'émet `beforeinstallprompt` qu'une fois.
ecouterInstallation()

// Pas de <StrictMode> : son double montage perturbe la pile de pages
// d'IonRouterOutlet (pages dupliquées en développement).
const racine = document.getElementById('root')
if (racine) createRoot(racine).render(<App />)
