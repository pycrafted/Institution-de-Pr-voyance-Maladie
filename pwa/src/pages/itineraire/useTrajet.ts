/**
 * L'itinéraire de la position de l'employé jusqu'à la structure.
 *
 * Recalculé quand l'employé s'est vraiment déplacé (plus de 150 m depuis le
 * dernier calcul), et pas à chaque frémissement du GPS : le serveur
 * d'itinéraire n'a pas à être interrogé à chaque seconde.
 */

import { useEffect, useRef, useState } from 'react'

import { calculerTrajet, calculerTrajets } from './directions'
import { ecartMetres, type Point, type Trajet } from './trajet'

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
    calculerTrajet(depart, arrivee, controleur.signal)
      .then((trajet) => {
        if (controleur.signal.aborted) return
        setEtat(trajet ? { etat: 'pret', trajet } : { etat: 'echec' })
      })
      .catch(() => {
        if (controleur.signal.aborted) return
        // Le calcul reprendra au prochain déplacement (clé, réseau, position).
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

export type EtatTrajets =
  { etat: 'attente' } | { etat: 'calcul' } | { etat: 'pret'; trajets: Trajet[] } | { etat: 'echec' }

/** Déplacement à partir duquel les itinéraires de la carte sont recalculés. */
const REDECALCUL_CARTE_M = 50

/**
 * Les itinéraires (le meilleur, puis les alternatives) de l'employé jusqu'à la
 * structure, pour la carte des structures. Recalculés quand l'employé s'est
 * déplacé de plus de 50 m, ou quand la destination change.
 */
export function useTrajets(depart: Point | null, arrivee: Point | null): EtatTrajets {
  const [etat, setEtat] = useState<EtatTrajets>({ etat: 'attente' })
  const dernier = useRef<{ depart: Point; arrivee: Point } | null>(null)
  // Le calcul en cours : annulé seulement par un NOUVEAU calcul ou au démontage,
  // pas par une petite mise à jour du GPS (sinon il ne finirait jamais).
  const enCours = useRef<AbortController | null>(null)

  useEffect(() => () => enCours.current?.abort(), [])

  useEffect(() => {
    if (!depart || !arrivee) {
      enCours.current?.abort()
      dernier.current = null
      setEtat({ etat: 'attente' })
      return
    }
    const memeArrivee =
      dernier.current !== null &&
      dernier.current.arrivee.latitude === arrivee.latitude &&
      dernier.current.arrivee.longitude === arrivee.longitude
    // Même destination, et pas bougé de plus de 50 m : les itinéraires tiennent.
    if (
      memeArrivee &&
      dernier.current &&
      ecartMetres(dernier.current.depart, depart) < REDECALCUL_CARTE_M
    )
      return
    dernier.current = { depart, arrivee }

    enCours.current?.abort()
    const controleur = new AbortController()
    enCours.current = controleur
    // Nouvelle destination : on repart d'un calcul ; simple déplacement : on
    // garde les itinéraires affichés le temps du recalcul.
    setEtat((precedent) =>
      memeArrivee && precedent.etat === 'pret' ? precedent : { etat: 'calcul' },
    )
    calculerTrajets(depart, arrivee, controleur.signal)
      .then((trajets) => {
        if (controleur.signal.aborted) return
        setEtat(trajets.length > 0 ? { etat: 'pret', trajets } : { etat: 'echec' })
      })
      .catch(() => {
        if (controleur.signal.aborted) return
        dernier.current = null
        setEtat((precedent) => (precedent.etat === 'pret' ? precedent : { etat: 'echec' }))
      })
    // Les coordonnées, et non les objets : un nouvel objet à la même place ne
    // doit pas relancer le calcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart?.latitude, depart?.longitude, arrivee?.latitude, arrivee?.longitude])

  return etat
}
