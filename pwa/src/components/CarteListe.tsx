/**
 * Carte de liste (SPEC_DESIGN §3.5) — une ligne de liste devenue carte
 * autonome : rayon 22, ombre douce, espacée de 12 px de la suivante.
 *
 * C'est le remplacement de `<IonItem lines="inset">` : §1 interdit le filet
 * gris entre deux lignes, qui donne à un écran l'allure d'un tableau. Une
 * carte, un objet.
 *
 * À poser dans un conteneur `.ipm-pile` (gouttière 16, espacement 12).
 * `rang` échelonne l'apparition de 30 ms par carte.
 *
 * Un `<button>` et non un IonRouterLink : ce dernier projette ses enfants
 * dans un `<a>` en ligne de son shadow DOM, où la mise en page en flex de la
 * carte ne s'applique pas. La navigation passe donc par useIonRouter(), qui
 * garde la transition de page d'Ionic.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
import { chevronForward } from 'ionicons/icons'
import type { CSSProperties, ReactNode } from 'react'

import { haptique } from '../hooks/haptique'

/** Teinte du cercle d'icône : un statut de document, la marque, ou neutre. */
export type TeinteCarte = 'valide' | 'traite' | 'expire' | 'annule' | 'rouge' | 'neutre'

interface Props {
  /** Icône ionicons dessinée dans le cercle 44 de gauche. */
  icone?: string
  /** Remplace le cercle d'icône (avatar aux initiales, par exemple). */
  vignette?: ReactNode
  teinte?: TeinteCarte
  titre: ReactNode
  /** Une ou deux lignes de détail sous le titre. */
  details?: ReactNode
  /** Puce de statut posée en haut à droite. */
  puce?: ReactNode
  /** Petite mention sous la puce (date). */
  meta?: ReactNode
  /** Chevron de droite : présent dès que la carte mène quelque part. */
  chevron?: boolean
  /** Destination ; la carte devient touchable et pousse la page. */
  routerLink?: string
  onClick?: () => void
  /** Rang dans la liste : échelonne l'animation d'apparition (30 ms). */
  rang?: number
  className?: string
  /** Libellé complet lu par le lecteur d'écran (sinon, le contenu). */
  etiquette?: string
}

export default function CarteListe({
  icone,
  vignette,
  teinte = 'neutre',
  titre,
  details,
  puce,
  meta,
  chevron,
  routerLink,
  onClick,
  rang = 0,
  className,
  etiquette,
}: Props) {
  const routeur = useIonRouter()
  const touchable = Boolean(routerLink || onClick)
  const avecChevron = chevron ?? touchable
  const classes = ['ipm-carte-liste', touchable ? 'ipm-appui' : '', 'ipm-entree', className ?? '']
    .filter(Boolean)
    .join(' ')

  // Le décalage d'apparition se pose en variable : le CSS calcule rang × 30 ms
  // (cf. .ipm-entree dans theme/global.css).
  const style = { '--rang': rang } as CSSProperties

  const contenu = (
    <>
      {vignette ??
        (icone && (
          <span className={`ipm-carte-liste__cercle ipm-cercle--${teinte}`} aria-hidden="true">
            <IonIcon icon={icone} />
          </span>
        ))}
      <span className="ipm-carte-liste__corps">
        <span className="ipm-carte-liste__titre">{titre}</span>
        {details && <span className="ipm-carte-liste__details">{details}</span>}
      </span>
      {(puce || meta) && (
        <span className="ipm-carte-liste__fin">
          {puce}
          {meta && <span className="ipm-carte-liste__meta">{meta}</span>}
        </span>
      )}
      {avecChevron && (
        <IonIcon className="ipm-carte-liste__chevron" icon={chevronForward} aria-hidden="true" />
      )}
    </>
  )

  if (!touchable) {
    return (
      <div className={classes} style={style} aria-label={etiquette}>
        {contenu}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      aria-label={etiquette}
      onClick={() => {
        haptique.leger()
        if (routerLink) routeur.push(routerLink, 'forward', 'push')
        onClick?.()
      }}
    >
      {contenu}
    </button>
  )
}
