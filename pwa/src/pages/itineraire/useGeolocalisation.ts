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

export function useGeolocalisation(): EtatLocalisation {
  const [etat, setEtat] = useState<EtatLocalisation>(() => etatInitial())

  useEffect(() => {
    if (etatInitial().etat !== 'recherche') return undefined
    // Tenue ici : c'est sur le même objet que le suivi s'arrête.
    const geolocalisation = navigator.geolocation
    const suivi = geolocalisation.watchPosition(
      (position) =>
        setEtat({
          etat: 'trouvee',
          position: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          precision: position.coords.accuracy,
        }),
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
  return { etat: 'recherche' }
}
