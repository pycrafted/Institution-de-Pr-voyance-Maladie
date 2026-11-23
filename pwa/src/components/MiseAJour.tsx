/**
 * Service worker et mise à jour de l'application installée.
 *
 * Le problème à résoudre : une application installée n'est presque jamais
 * vraiment fermée. Android et iPhone la REPRENNENT là où elle était, sans la
 * relancer. Une nouvelle version téléchargée qui attendait « le prochain
 * lancement » attendait donc des jours - au point qu'il fallait désinstaller
 * l'application pour voir un changement.
 *
 * La nouvelle version se télécharge seule : à chaque retour au premier plan,
 * et toutes les 15 minutes. Puis elle s'applique d'elle-même au premier
 * moment SANS RISQUE, jamais au milieu d'une saisie :
 *  1. au lancement, si elle attendait déjà (pendant l'écran de lancement) ;
 *  2. quand l'application reste plus de 30 secondes en arrière-plan : elle se
 *     recharge pendant que personne ne la regarde. Les 30 secondes couvrent
 *     l'appareil photo ouvert depuis un formulaire (photo du bénéficiaire),
 *     qui met lui aussi l'application en arrière-plan ;
 *  3. au retour au premier plan, si aucune fenêtre n'est ouverte (assistant
 *     de bon, photos…) ;
 *  4. sinon, un toast propose « Recharger » tant qu'elle attend.
 *
 * L'activer d'autorité sous une page en cours de saisie casserait ses
 * morceaux chargés à la demande (pdf.js, l'assistant), que le nouveau service
 * worker efface de son précache. Si une page déjà ouverte ne trouve plus un de
 * ces morceaux (« vite:preloadError »), elle se recharge au lieu de planter.
 *
 * (Pas de skipWaiting automatique dans le service worker, cf. vite.config.ts :
 * c'est cette page qui envoie SKIP_WAITING au moment choisi.)
 */

import { IonToast } from '@ionic/react'
import { useEffect, useRef, useState } from 'react'
import type { Workbox } from 'workbox-window'

import { estOccupe } from '../utils/occupation'

/** Vérification d'une nouvelle version pendant que l'application reste ouverte. */
const INTERVALLE_VERIFICATION_MS = 15 * 60 * 1000

/** Temps en arrière-plan au-delà duquel la mise à jour s'applique en silence. */
const DELAI_ARRIERE_PLAN_MS = 30 * 1000

/**
 * Ne pas interrompre : une fenêtre est ouverte (assistant de bon, page « Mot
 * de passe »…) ou une photo est en cours de choix ou d'envoi.
 */
function fenetreOuverte(): boolean {
  return estOccupe() || document.querySelector('ion-modal:not(.overlay-hidden)') !== null
}

export default function MiseAJour() {
  const [disponible, setDisponible] = useState(false)
  const workbox = useRef<Workbox | null>(null)
  const enAttente = useRef(false)

  useEffect(() => {
    // Une page ouverte avant la mise à jour ne trouve plus un morceau de code :
    // on recharge, ce qui la remet sur la nouvelle version.
    const surMorceauIntrouvable = (evenement: Event) => {
      evenement.preventDefault()
      window.location.reload()
    }
    window.addEventListener('vite:preloadError', surMorceauIntrouvable)

    // Pas de service worker en développement ni dans les tests.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return () => window.removeEventListener('vite:preloadError', surMorceauIntrouvable)
    }
    let minuteur: ReturnType<typeof setInterval> | undefined
    let arrierePlan: ReturnType<typeof setTimeout> | undefined
    let annule = false

    const surVisibilite = () => {
      if (arrierePlan) {
        clearTimeout(arrierePlan)
        arrierePlan = undefined
      }
      if (document.visibilityState === 'hidden') {
        // En arrière-plan depuis 30 s avec une version qui attend : on
        // l'applique pendant que personne ne regarde.
        arrierePlan = setTimeout(() => {
          if (
            enAttente.current &&
            workbox.current &&
            document.visibilityState === 'hidden' &&
            !estOccupe()
          )
            appliquer(workbox.current)
        }, DELAI_ARRIERE_PLAN_MS)
        return
      }
      // Retour au premier plan.
      if (enAttente.current && workbox.current) {
        if (!fenetreOuverte()) {
          appliquer(workbox.current)
          return
        }
        setDisponible(true)
      }
      void navigator.serviceWorker.getRegistration().then((r) => r?.update())
    }

    void import('workbox-window').then(({ Workbox }) => {
      if (annule) return
      const wb = new Workbox('/sw.js', { scope: '/' })
      workbox.current = wb
      wb.addEventListener('waiting', (evenement) => {
        enAttente.current = true
        // Elle attendait avant ce lancement, ou rien n'est ouvert : on
        // l'applique tout de suite. Sinon, on la propose.
        if (evenement.wasWaitingBeforeRegister || !fenetreOuverte()) appliquer(wb)
        else setDisponible(true)
      })
      void wb.register().then((enregistrement) => {
        if (!enregistrement) return
        minuteur = setInterval(() => void enregistrement.update(), INTERVALLE_VERIFICATION_MS)
      })
      document.addEventListener('visibilitychange', surVisibilite)
    })

    return () => {
      annule = true
      if (minuteur) clearInterval(minuteur)
      if (arrierePlan) clearTimeout(arrierePlan)
      document.removeEventListener('visibilitychange', surVisibilite)
      window.removeEventListener('vite:preloadError', surMorceauIntrouvable)
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
