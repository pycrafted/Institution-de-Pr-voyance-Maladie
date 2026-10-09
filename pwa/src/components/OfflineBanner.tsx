import { IonIcon } from '@ionic/react'
import { cloudOfflineOutline } from 'ionicons/icons'

import { useOnline } from '../hooks/useOnline'
import { dateHeure } from '../utils/format'

interface Props {
  /** Date-heure ISO des données affichées (dernière synchronisation), pour « données du … ». */
  synchroniseLe?: string | null
  /** Affiche le bandeau même en ligne (serveur injoignable, données du cache). */
  forcer?: boolean
}

/**
 * Bandeau « Hors ligne » à placer en tête de contenu (dans IonContent, ou
 * sous IonToolbar dans IonHeader). Invisible quand tout va bien.
 */
export default function OfflineBanner({ synchroniseLe, forcer = false }: Props) {
  const enLigne = useOnline()
  if (enLigne && !forcer) return null
  // « données d'aujourd'hui à 11:21 » : minuscule initiale en milieu de phrase.
  const quand = synchroniseLe ? dateHeure(synchroniseLe) : ''
  const depuis = quand ? ` · données : ${quand.charAt(0).toLowerCase()}${quand.slice(1)}` : ''
  return (
    <div className="ipm-hors-ligne" role="status" aria-live="polite">
      <IonIcon icon={cloudOfflineOutline} aria-hidden="true" />
      <span>
        {enLigne ? 'Serveur injoignable' : 'Hors ligne'}
        {depuis}
      </span>
    </div>
  )
}
