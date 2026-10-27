/**
 * Écran de lancement (SPEC §3 écran 1, SPEC_DESIGN §5), affiché par App.tsx
 * pendant la lecture de la session et au moins DUREE_MIN_LANCEMENT_MS.
 *
 * Il prend le relais de l'écran de lancement d'iOS (public/splash/, généré
 * par scripts/generer-icones.py) SANS saut visible : même fond de marque,
 * même logo, même taille et même position. Le nom « IPM SAR » apparaît en
 * fondu juste sous le logo.
 */

import { useLayoutEffect } from 'react'

import { useApparence } from '../theme/apparence'
import LogoSar from './LogoSar'
import './Splash.css'

/**
 * Fond de l'écran de lancement : un rose pâle, le logo SAR rouge dessus.
 * Identique aux PNG de public/splash/ et à `background_color` du manifest.
 * Volontairement une constante et non une variable de thème : en mode
 * sombre celle-ci changerait, et le relais avec l'image de lancement d'iOS
 * ferait un saut de couleur.
 */
export const FOND_LANCEMENT = '#ECE4E3'

/** Le même écran en mode sombre : le fond sombre de l'application, logo rouge. */
export const FOND_LANCEMENT_SOMBRE = '#111110'

interface MotifProps {
  /** Pose le logo sur une pastille de marque (icône d'application). */
  fond?: boolean
  className?: string
}

/**
 * Logo de lancement : le logo SAR, blanc sur fond de marque quand `fond`.
 *
 * @deprecated Ancien nom (la croix de pharmacie « IPM »), conservé le temps
 * que l'écran d'identification passe au bandeau de marque (§5). Employer
 * `LogoSar` ou `BandeauMarque`.
 */
export function MotifIpm({ fond = false, className }: MotifProps) {
  if (!fond) return <LogoSar largeur={88} className={className} />
  return (
    <span className={`motif-ipm${className ? ` ${className}` : ''}`} aria-hidden="true">
      <LogoSar largeur={64} ton="blanc" />
    </span>
  )
}

/**
 * Barre d'état sombre pendant le lancement (Android : <meta name="theme-color">),
 * rendue telle quelle ensuite. useLayoutEffect : changée avant le premier
 * affichage, pas une image après.
 */
function useCouleurBarreEtat(couleur: string) {
  useLayoutEffect(() => {
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    const precedentes = metas.map((meta) => meta.content)
    metas.forEach((meta) => {
      meta.content = couleur
    })
    return () => {
      metas.forEach((meta, i) => {
        meta.content = precedentes[i] ?? meta.content
      })
    }
  }, [couleur])
}

export default function Splash() {
  // Le mode choisi par l'employé (clair ou sombre), déjà posé sur <html> au
  // démarrage : l'écran de chargement le suit, fond et barre d'état.
  const sombre = useApparence() === 'sombre'
  useCouleurBarreEtat(sombre ? FOND_LANCEMENT_SOMBRE : FOND_LANCEMENT)
  return (
    <div
      className="splash"
      role="progressbar"
      aria-label="Chargement d'IPM Mobile"
      aria-busy="true"
    >
      {/* Le nom juste sous le logo, sans points de chargement. */}
      <div className="splash__logo">
        <LogoSar largeur={160} />
        <p className="splash__nom" aria-hidden="true">
          IPM SAR
        </p>
        {/* Barre de progression continue, comme le site de la SAR. */}
        <div className="splash__barre" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  )
}
