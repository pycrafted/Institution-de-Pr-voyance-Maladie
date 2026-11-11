/**
 * Calcul d'itinéraire par Google Directions.
 *
 * Remplace l'ancien serveur OSRM : on demande à Google le trajet en voiture de
 * la position de l'employé jusqu'à la structure, et on en garde ce dont la
 * carte et la feuille ont besoin - la distance, la durée, et le tracé (la
 * `overview_path`, suffisamment fine pour dessiner la ligne). Le guidage pas à
 * pas, lui, reste délégué à l'application Google Maps (bouton de la feuille).
 */

import { chargerGoogleMaps } from './googleMaps'
import type { Point, Trajet } from './trajet'

/** Le trajet en voiture, ou null si Google n'en propose aucun. */
export async function calculerTrajet(
  depart: Point,
  arrivee: Point,
  signal?: AbortSignal,
): Promise<Trajet | null> {
  const maps = await chargerGoogleMaps()
  if (signal?.aborted) return null

  const service = new maps.DirectionsService()
  const reponse = await service.route({
    origin: { lat: depart.latitude, lng: depart.longitude },
    destination: { lat: arrivee.latitude, lng: arrivee.longitude },
    travelMode: maps.TravelMode.DRIVING,
  })
  if (signal?.aborted) return null

  const route = reponse.routes[0]
  const jambe = route?.legs?.[0]
  if (!route || !jambe?.distance || !jambe.duration) return null

  const trace: [number, number][] = route.overview_path.map((p) => [p.lat(), p.lng()])
  if (trace.length < 2) return null

  return { distance: jambe.distance.value, duree: jambe.duration.value, trace }
}
