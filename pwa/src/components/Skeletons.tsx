/**
 * Squelettes de chargement : la forme de l'écran à venir plutôt qu'une
 * roue qui tourne, comme dans les applications natives.
 */

import { IonItem, IonLabel, IonList, IonSkeletonText, IonThumbnail } from '@ionic/react'

/** Liste de `lignes` éléments (bons, pharmacies…), avec pastille ronde à gauche si `avatar`. */
export function SqueletteListe({
  lignes = 5,
  avatar = false,
}: {
  lignes?: number
  avatar?: boolean
}) {
  return (
    <IonList inset aria-busy="true" aria-label="Chargement">
      {Array.from({ length: lignes }, (_, i) => (
        <IonItem key={i} lines={i === lignes - 1 ? 'none' : 'inset'}>
          {avatar && (
            <IonThumbnail slot="start" className="ipm-squelette-avatar">
              <IonSkeletonText animated />
            </IonThumbnail>
          )}
          <IonLabel>
            <h3>
              <IonSkeletonText animated style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            </h3>
            <p>
              <IonSkeletonText animated style={{ width: `${35 + ((i * 23) % 25)}%` }} />
            </p>
          </IonLabel>
        </IonItem>
      ))}
    </IonList>
  )
}

/** Bloc de carte (en-tête du détail, carte d'accueil). */
export function SqueletteCarte({ hauteur = 120 }: { hauteur?: number }) {
  return (
    <div className="ipm-carte ipm-squelette-carte" aria-busy="true" aria-label="Chargement">
      <IonSkeletonText animated style={{ width: '40%', height: 14 }} />
      <IonSkeletonText animated style={{ width: '70%', height: 22, marginTop: 12 }} />
      <IonSkeletonText animated style={{ width: '55%', height: 14, marginTop: 12 }} />
      <div style={{ height: Math.max(0, hauteur - 90) }} />
    </div>
  )
}

/** Quelques lignes de texte. */
export function SqueletteTexte({ lignes = 3 }: { lignes?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement">
      {Array.from({ length: lignes }, (_, i) => (
        <IonSkeletonText key={i} animated style={{ width: i === lignes - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}
