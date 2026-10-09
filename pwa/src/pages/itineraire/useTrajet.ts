/**
 * L'itinéraire de la position de l'employé jusqu'à la structure.
 *
 * Recalculé quand l'employé s'est vraiment déplacé (plus de 150 m depuis le
 * dernier calcul), et pas à chaque frémissement du GPS : le serveur
 * d'itinéraire n'a pas à être interrogé à chaque seconde.
 */

import { useEffect, useRef, useState } from 'react'

import { ecartMetres, lireTrajet, urlItineraire, type Point, type Trajet } from './trajet'

export type EtatTrajet =
  { etat: 'attente' } | { etat: 'calcul' } | { etat: 'pret'; trajet: Trajet } | { etat: 'echec' }

/** Déplacement à partir duquel l'itinéraire est recalculé. */
const REDECALCUL_M = 150

export function useTrajet(depart: Point | null, arrivee: Point | null): EtatTrajet {
  const [etat, setEtat] = useState<EtatTrajet>({ etat: 'attente' })
  const dernierDepart = useRef<Point | null>(null)

  useEffect(() => {
    if (!depart || !arrivee) return undefined
    // Même endroit qu'au dernier calcul, à 150 m près : l'itinéraire tient.
    if (dernierDepart.current && ecartMetres(dernierDepart.current, depart) < REDECALCUL_M)
      return undefined
    dernierDepart.current = depart

    const controleur = new AbortController()
    setEtat((precedent) => (precedent.etat === 'pret' ? precedent : { etat: 'calcul' }))
    fetch(urlItineraire(depart, arrivee), { signal: controleur.signal })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((json) => {
        const trajet = lireTrajet(json)
        setEtat(trajet ? { etat: 'pret', trajet } : { etat: 'echec' })
      })
      .catch((erreur: unknown) => {
        if (erreur instanceof DOMException && erreur.name === 'AbortError') return
        // Le calcul reprendra au prochain déplacement.
        dernierDepart.current = null
        setEtat((precedent) => (precedent.etat === 'pret' ? precedent : { etat: 'echec' }))
      })
    return () => controleur.abort()
    // Les coordonnées, et non les objets : un nouvel objet à la même place ne
    // doit pas relancer le calcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart?.latitude, depart?.longitude, arrivee?.latitude, arrivee?.longitude])

  return etat
}
