import { IonIcon } from '@ionic/react'
import { alertCircle } from 'ionicons/icons'

/**
 * Remarque sur une étape de l'assistant (refus du serveur, date hors
 * bornes), en rouge sous le champ concerné. role="alert" : annoncée par les
 * lecteurs d'écran dès qu'elle apparaît.
 */
export default function Alerte({ message }: { message: string }) {
  return (
    <div className="nouveau-bon__alerte" role="alert">
      <IonIcon icon={alertCircle} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
