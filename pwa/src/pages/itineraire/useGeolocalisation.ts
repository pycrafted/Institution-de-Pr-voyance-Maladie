/**
 * La position de l'employé, suivie tant que l'écran d'itinéraire est ouvert.
 *
 * Le téléphone ne donne sa position qu'avec la permission de l'employé, et
 * seulement à une page servie en HTTPS : le navigateur la refuse d'office à
 * une page en HTTP (hors « localhost »). Chaque cas a son état, pour que
 * l'écran dise précisément ce qui manque au lieu d'une carte muette.
 *
 * La position n'est ni enregistrée, ni envoyée à l'IPM : elle ne sert qu'à
 * demander l'itinéraire et à placer le point bleu sur la carte.
 *
 * Rapidité : une position approximative est demandée d'abord (réseau, ou la
 * dernière que le téléphone connaît), en même temps que le GPS précis ; la
 * carte se centre donc presque aussitôt, puis s'affine. La dernière position
 * trouvée est gardée en mémoire le temps de la session (jamais sur le disque) :
 * rouvrir la carte la retrouve sans attendre.
 */

import { useEffect, useState } from 'react'

import type { Point } from './trajet'

export type EtatLocalisation =
  | { etat: 'recherche' }
  | { etat: 'trouvee'; position: Point; precision: number }
  | { etat: 'refusee' }
  /** Page en HTTP : le navigateur ne donne pas la position, quoi qu'on fasse. */
  | { etat: 'non-securisee' }
  /** Pas de géolocalisation sur cet appareil, ou signal introuvable. */
  | { etat: 'indisponible' }

/** Au-delà, une position vieille ou approximative est redemandée. */
const DELAI_MS = 15000

/** Une position gardée en mémoire sert encore pendant ce temps. */
const FRAICHEUR_MS = 2 * 60_000

/** La dernière position trouvée, en mémoire seulement (perdue à la fermeture). */
let derniere: { position: Point; precision: number; le: number } | null = null

function retenir(position: GeolocationPosition): EtatLocalisation {
  const point = { latitude: position.coords.latitude, longitude: position.coords.longitude }
  derniere = { position: point, precision: position.coords.accuracy, le: Date.now() }
  return { etat: 'trouvee', position: point, precision: position.coords.accuracy }
}

export function useGeolocalisation(): EtatLocalisation {
  const [etat, setEtat] = useState<EtatLocalisation>(() => etatInitial())

  useEffect(() => {
    const initial = etatInitial().etat
    if (initial !== 'recherche' && initial !== 'trouvee') return undefined
    // Tenue ici : c'est sur le même objet que le suivi s'arrête.
    const geolocalisation = navigator.geolocation
    let precise = false
    // Approximative mais immédiate : sert tant que le GPS n'a pas répondu.
    geolocalisation.getCurrentPosition?.(
      (position) => {
        if (!precise) setEtat(retenir(position))
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 4000 },
    )
    const suivi = geolocalisation.watchPosition(
      (position) => {
        precise = true
        setEtat(retenir(position))
      },
      (erreur) => {
        // Une fois trouvée, une position n'est pas effacée par un signal qui
        // se perd un instant (tunnel, immeuble) : on garde la dernière.
        setEtat((precedent) => {
          if (precedent.etat === 'trouvee' && erreur.code !== erreur.PERMISSION_DENIED)
            return precedent
          return erreur.code === erreur.PERMISSION_DENIED
            ? { etat: 'refusee' }
            : { etat: 'indisponible' }
        })
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: DELAI_MS },
    )
    return () => geolocalisation.clearWatch(suivi)
  }, [])

  return etat
}

function etatInitial(): EtatLocalisation {
  if (typeof window !== 'undefined' && window.isSecureContext === false)
    return { etat: 'non-securisee' }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator))
    return { etat: 'indisponible' }
  if (derniere && Date.now() - derniere.le < FRAICHEUR_MS)
    return { etat: 'trouvee', position: derniere.position, precision: derniere.precision }
  return { etat: 'recherche' }
}
