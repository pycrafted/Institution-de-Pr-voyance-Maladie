/**
 * Écran « Notifications » (/notifications) — une PAGE à part entière, comme
 * Identité : navbar en haut, barre d'onglets en bas, aucun bouton retour. On y
 * revient par les barres, pas par une flèche. Elle remplace l'ancienne feuille
 * modale « Vous n'avez aucune notification », qui n'affichait jamais rien.
 *
 * Ce que l'IPM a tranché sur les demandes de l'employé : photo réinitialisée ou
 * conservée, bon d'optique accordé ou refusé (hooks/useNotifications). Le
 * serveur les calcule ; l'écran les liste, la plus récente en tête, et marque
 * tout comme lu en entrant (la pastille de la cloche se vide). Une notification
 * qui porte un lien (le détail d'un bon) se touche pour l'ouvrir.
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  useIonRouter,
  useIonViewWillEnter,
  type RefresherEventDetail,
} from '@ionic/react'
import { chevronForward, idCardOutline, medkitOutline, notificationsOutline } from 'ionicons/icons'
import { useEffect } from 'react'

import { useNotifications } from '../hooks/useNotifications'
import EtatVide from '../components/EtatVide'
import BarreActions from '../components/BarreActions'
import { haptique } from '../hooks/haptique'
import type { NotificationMobile } from '../types/api'
import { dateHeure } from '../utils/format'

/** L'icône de la pastille selon le genre de décision. */
function icone(genre: NotificationMobile['genre']): string {
  return genre === 'bon-optique' ? medkitOutline : idCardOutline
}

export default function Notifications() {
  const { notifications, relire, marquerLues } = useNotifications()
  const routeur = useIonRouter()

  // À chaque arrivée sur l'écran : on relit (l'IPM a pu trancher depuis la
  // dernière visite) et on considère tout ce qui s'affiche comme lu.
  useIonViewWillEnter(() => {
    void relire()
  })

  // Dès que la liste est posée, la pastille de la cloche se vide : l'employé
  // est sur l'écran, il les voit toutes.
  useEffect(() => {
    if (notifications.length > 0) marquerLues()
  }, [notifications, marquerLues])

  function actualiser(evenement: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    void relire().finally(() => evenement.detail.complete())
  }

  function ouvrir(notification: NotificationMobile) {
    if (!notification.lien) return
    haptique.leger()
    routeur.push(notification.lien, 'forward', 'push')
  }

  return (
    <IonPage className="notifications">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={actualiser}>
          <IonRefresherContent />
        </IonRefresher>

        {/* La barre d'actions est fixe au-dessus : on lui réserve sa place,
            comme à l'accueil, au profil et à l'identité. */}
        <BarreActions />

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Notifications</h2>
          </div>

          {notifications.length === 0 ? (
            <EtatVide
              icone={notificationsOutline}
              titre="Aucune notification"
              message="Les décisions de l’IPM sur vos demandes (photo, bon d’optique) s’afficheront ici."
              teinte="neutre"
            />
          ) : (
            <ul className="notifs__liste">
              {notifications.map((notification) => {
                const cliquable = Boolean(notification.lien)
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className="notifs__ligne ipm-appui"
                      disabled={!cliquable}
                      aria-label={cliquable ? `Ouvrir : ${notification.titre}` : notification.titre}
                      onClick={() => ouvrir(notification)}
                    >
                      <span className="notifs__pastille" aria-hidden="true">
                        <IonIcon icon={icone(notification.genre)} />
                      </span>
                      <span className="notifs__corps">
                        <span className="notifs__titre">{notification.titre}</span>
                        {/* La description, et l'heure tout à droite sur la même ligne. */}
                        <span className="notifs__bas">
                          <span className="notifs__message">{notification.message}</span>
                          <span className="notifs__date">{quand(notification.date)}</span>
                        </span>
                      </span>
                      {cliquable && (
                        <IonIcon
                          className="notifs__fleche"
                          icon={chevronForward}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/** « Hier à 12:05 », « 18 nov. à 12:30 » : sans l'année quand c'est l'année en cours. */
function quand(date: string): string {
  return dateHeure(date).replace(` ${new Date().getFullYear()}`, '')
}
