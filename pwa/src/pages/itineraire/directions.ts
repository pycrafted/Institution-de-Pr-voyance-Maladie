/**
 * Calcul d'itinéraire par Google, sur ses serveurs.
 *
 * Service principal : Routes API (`google.maps.routes.Route.computeRoutes`),
 * qui remplace l'ancien `DirectionsService` (déprécié depuis février 2026). On
 * lui demande, en voiture :
 *   - les ITINÉRAIRES ALTERNATIFS (2 ou 3, comme l'application Google Maps) ;
 *   - le TRAFIC en temps réel (`TRAFFIC_AWARE`), au départ de maintenant.
 * On ne garde que ce dont la carte a besoin : distance, durée (avec trafic),
 * durée sans trafic, et le tracé. Le guidage pas à pas reste délégué à
 * l'application Google Maps.
 *
 * Repli : si Routes API est refusée (non activée sur la clé, quota…), on
 * reprend l'ancien `DirectionsService`, lui aussi avec alternatives et trafic,
 * pour que la carte ne reste jamais sans trajet.
 */

import { chargerGoogleMaps } from './googleMaps'
import type { Point, Trajet } from './trajet'

/** Les champs demandés à Routes API (masque obligatoire, et facturé au plus juste). */
const CHAMPS_ROUTES = ['path', 'distanceMeters', 'durationMillis', 'staticDurationMillis']

/** Le repli n'est signalé qu'une fois par session dans la console. */
let repliSignale = false

/**
 * Les itinéraires en voiture, le meilleur en premier (2 ou 3 le plus souvent,
 * un seul quand il n'y a pas d'alternative). Liste vide si Google n'en trouve
 * aucun.
 */
export async function calculerTrajets(
  depart: Point,
  arrivee: Point,
  signal?: AbortSignal,
): Promise<Trajet[]> {
  const maps = await chargerGoogleMaps()
  if (signal?.aborted) return []
  try {
    return await parRoutes(maps, depart, arrivee)
  } catch (erreur) {
    if (signal?.aborted) return []
    if (!repliSignale) {
      repliSignale = true
      console.warn('Routes API indisponible, repli sur DirectionsService :', erreur)
    }
    return parDirections(maps, depart, arrivee)
  }
}

/** Le meilleur itinéraire seul (écran d'itinéraire), ou null. */
export async function calculerTrajet(
  depart: Point,
  arrivee: Point,
  signal?: AbortSignal,
): Promise<Trajet | null> {
  const [premier] = await calculerTrajets(depart, arrivee, signal)
  return premier ?? null
}

async function parRoutes(
  maps: typeof google.maps,
  depart: Point,
  arrivee: Point,
): Promise<Trajet[]> {
  const { Route } = (await maps.importLibrary('routes')) as google.maps.RoutesLibrary
  const { routes } = await Route.computeRoutes({
    origin: { lat: depart.latitude, lng: depart.longitude },
    destination: { lat: arrivee.latitude, lng: arrivee.longitude },
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: new Date(),
    computeAlternativeRoutes: true,
    language: 'fr',
    region: 'SN',
    fields: CHAMPS_ROUTES,
  })
  const trajets: Trajet[] = []
  for (const route of routes ?? []) {
    const trace: [number, number][] = (route.path ?? []).map((p) => [p.lat, p.lng])
    const distance = route.distanceMeters
    const duree = route.durationMillis ?? route.staticDurationMillis
    if (trace.length < 2 || distance === undefined || duree === null || duree === undefined)
      continue
    trajets.push({
      distance,
      duree: duree / 1000,
      dureeSansTrafic: route.staticDurationMillis ? route.staticDurationMillis / 1000 : undefined,
      trace,
    })
  }
  return trajets
}

async function parDirections(
  maps: typeof google.maps,
  depart: Point,
  arrivee: Point,
): Promise<Trajet[]> {
  const reponse = await new maps.DirectionsService().route({
    origin: { lat: depart.latitude, lng: depart.longitude },
    destination: { lat: arrivee.latitude, lng: arrivee.longitude },
    travelMode: maps.TravelMode.DRIVING,
    provideRouteAlternatives: true,
    drivingOptions: { departureTime: new Date(), trafficModel: maps.TrafficModel.BEST_GUESS },
  })
  const trajets: Trajet[] = []
  for (const route of reponse.routes) {
    const jambe = route.legs?.[0]
    if (!jambe?.distance || !jambe.duration) continue
    const trace: [number, number][] = route.overview_path.map((p) => [p.lat(), p.lng()])
    if (trace.length < 2) continue
    trajets.push({
      distance: jambe.distance.value,
      duree: (jambe.duration_in_traffic ?? jambe.duration).value,
      dureeSansTrafic: jambe.duration.value,
      trace,
    })
  }
  return trajets
}
