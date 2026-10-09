/**
 * Bandeau de marque (SPEC_DESIGN §3.2) — la surface colorée par laquelle
 * commence CHAQUE écran. Il remplace la grande toolbar Ionic au gros titre
 * noir sur fond gris, interdite par §1.
 *
 * Deux variantes :
 *   « plein »   (accueil) : titre en 26/800 et sa ligne secondaire, une
 *               pastille éventuelle à droite, sur la même ligne.
 *   « compact » (autres écrans) : bouton retour en pastille translucide 40,
 *               titre 22/700 sur la même ligne, actions à droite.
 *
 * `chevauche` réserve 24 px de plus en bas : la première carte de l'écran
 * remonte de cette hauteur sur le bandeau (§4). C'est ce chevauchement qui
 * donne la profondeur d'une application ; sans lui, tout redevient plat.
 */

import { IonIcon } from '@ionic/react'
import { chevronBack } from 'ionicons/icons'
import type { ReactNode } from 'react'

import { haptique } from '../hooks/haptique'

interface Props {
  variante?: 'plein' | 'compact'
  /** Le nom de l'écran : « Accueil », « Mes bons »… */
  titre: ReactNode
  /** Ligne secondaire, blanc à 70 % : « IPM SAR Personnel Moo · 01-1204 ». */
  sousTitre?: ReactNode
  /** Pastille de droite (avatar sur l'accueil, bouton d'action ailleurs). */
  fin?: ReactNode
  /** Bouton retour en pastille translucide (variante compacte). */
  onRetour?: () => void
  /** Réserve 24 px sous le bandeau pour la carte qui le chevauche. */
  chevauche?: boolean
  /** Contenu ajouté sous le titre (barre de progression, puce de statut…). */
  children?: ReactNode
  className?: string
}

export default function BandeauMarque({
  variante = 'compact',
  titre,
  sousTitre,
  fin,
  onRetour,
  chevauche = false,
  children,
  className,
}: Props) {
  const classes = [
    'ipm-bandeau',
    `ipm-bandeau--${variante}`,
    chevauche ? 'ipm-bandeau--chevauche' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const retour = onRetour && (
    <button
      type="button"
      className="ipm-bandeau__retour"
      aria-label="Retour"
      onClick={() => {
        haptique.leger()
        onRetour()
      }}
    >
      <IonIcon icon={chevronBack} aria-hidden="true" />
    </button>
  )

  const textes = (
    <div className="ipm-bandeau__textes">
      <h1 className="ipm-bandeau__titre">{titre}</h1>
      {sousTitre && <p className="ipm-bandeau__sous-titre">{sousTitre}</p>}
    </div>
  )

  return (
    <header className={classes}>
      {variante === 'plein' ? (
        <>
          {/* Pas de logo ici : la carte d'adhérent le porte juste en dessous,
              et deux fois la même marque à 100 px d'écart n'apprend rien.
              La pastille de droite se range à côté du titre, et non
              dans une rangée au-dessus : le bandeau garde sa hauteur. */}
          {fin ? (
            <div className="ipm-bandeau__ligne">
              {textes}
              <div className="ipm-bandeau__fin">{fin}</div>
            </div>
          ) : (
            textes
          )}
        </>
      ) : (
        <div className="ipm-bandeau__haut ipm-bandeau__haut--compact">
          {retour}
          {textes}
          {fin && <div className="ipm-bandeau__fin">{fin}</div>}
        </div>
      )}
      {children}
    </header>
  )
}
