/**
 * Service worker et invite de mise à jour discrète.
 *
 * La nouvelle version se télécharge seule (vérification au retour au premier
 * plan et toutes les heures), puis ATTEND : l'activer d'autorité sous une
 * page ouverte casserait ses morceaux chargés à la demande (pdf.js,
 * l'assistant), que le nouveau service worker efface de son précache — et
 * l'employé pourrait être au milieu de l'assistant. Donc :
 *  - au lancement de l'application, une version qui attendait déjà est
 *    appliquée aussitôt (rechargement pendant l'écran de lancement) ;
 *  - application ouverte, un toast propose « Recharger », et revient à
 *    chaque retour au premier plan tant que la version attend. Sur iPhone,
 *    une application installée est suspendue plutôt que fermée : sans ce
 *    rappel, l'employé garderait l'ancienne version des jours durant.
 *
 * (Pas de skipWaiting automatique, cf. vite.config.ts : c'est le bouton qui
 * envoie SKIP_WAITING au service worker en attente.)
 */

import { IonToast } from '@ionic/react'
import { useEffect, useRef, useState } from 'react'
import type { Workbox } from 'workbox-window'

// Vérification périodique d'une nouvelle version pendant que l'application
// reste ouverte (une application installée peut rester des jours en mémoire).
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000

export default function MiseAJour() {
  const [disponible, setDisponible] = useState(false)
  const workbox = useRef<Workbox | null>(null)
  const enAttente = useRef(false)

  useEffect(() => {
    // Pas de service worker en développement ni dans les tests.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let minuteur: ReturnType<typeof setInterval> | undefined
    let annule = false
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return
      // Une version attend toujours : on le repropose.
      if (enAttente.current) setDisponible(true)
      void navigator.serviceWorker.getRegistration().then((r) => r?.update())
    }

    void import('workbox-window').then(({ Workbox }) => {
      if (annule) return
      const wb = new Workbox('/sw.js', { scope: '/' })
      workbox.current = wb
      wb.addEventListener('waiting', (evenement) => {
        enAttente.current = true
        // Elle attendait avant ce lancement : rien n'est encore en cours,
        // on l'applique tout de suite.
        if (evenement.wasWaitingBeforeRegister) appliquer(wb)
        else setDisponible(true)
      })
      void wb.register().then((enregistrement) => {
        if (!enregistrement) return
        minuteur = setInterval(() => void enregistrement.update(), INTERVALLE_VERIFICATION_MS)
      })
      document.addEventListener('visibilitychange', auRetour)
    })

    return () => {
      annule = true
      if (minuteur) clearInterval(minuteur)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [])

  return (
    <IonToast
      isOpen={disponible}
      message="Une nouvelle version d'IPM Mobile est prête."
      position="top"
      duration={10_000}
      onDidDismiss={() => setDisponible(false)}
      buttons={[
        {
          text: 'Recharger',
          role: 'info',
          handler: () => {
            if (workbox.current) appliquer(workbox.current)
            else window.location.reload()
          },
        },
      ]}
    />
  )
}

/** Active la version en attente, puis recharge la page sous le nouveau service worker. */
function appliquer(wb: Workbox) {
  wb.addEventListener('controlling', () => window.location.reload())
  wb.messageSkipWaiting()
}
