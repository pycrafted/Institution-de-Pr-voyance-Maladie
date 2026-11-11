/**
 * Bouton « Scanner » central, surélevé au-dessus de la barre d'onglets (FAB).
 *
 * La barre du bas a quatre onglets, donc un creux au centre : on y pose un
 * bouton rond rouge, un peu plus haut que la barre, cerné d'un anneau couleur
 * page pour qu'il semble « posé » sur la barre (continuité). Il lance le
 * pré-financement (scan de l'ordonnance et du reçu).
 *
 * Affiché seulement sur l'accueil pour l'instant ; globalement il suffirait de
 * retirer la garde sur le chemin.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'
import { useLocation } from 'react-router-dom'

import { haptique } from '../hooks/haptique'

export default function BoutonScan() {
  const routeur = useIonRouter()
  const { pathname } = useLocation()
  if (!/^\/accueil\/?$/.test(pathname)) return null

  return (
    <button
      type="button"
      className="ipm-scan ipm-appui"
      aria-label="Scanner une ordonnance (pré-financement)"
      onClick={() => {
        haptique.leger()
        routeur.push('/scan', 'forward', 'push')
      }}
    >
      <IonIcon icon={cameraOutline} aria-hidden="true" />
    </button>
  )
}
