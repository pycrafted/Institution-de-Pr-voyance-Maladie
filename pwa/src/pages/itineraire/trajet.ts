/**
 * Itinéraire vers une structure conventionnée (pages/Itineraire.tsx).
 *
 * Logique pure, sans React : l'adresse du calcul d'itinéraire, la lecture de
 * sa réponse, et la façon de dire une distance et une durée à l'employé.
 *
 * Le calcul d'itinéraire est celui d'OSRM (Open Source Routing Machine), sur
 * les données d'OpenStreetMap. Son serveur public de démonstration suffit à
 * un pilote ; en production, un service à soi (ou sous contrat) prendra le
 * relais — il suffira de changer SERVEUR_ITINERAIRE.
 */

export const SERVEUR_ITINERAIRE = 'https://router.project-osrm.org'

export interface Point {
  latitude: number
  longitude: number
}

export interface Trajet {
  /** En mètres, par la route. */
  distance: number
  /** En secondes, en voiture, trafic non compris. */
  duree: number
  /** Le tracé, de point en point, pour la carte. */
  trace: [number, number][]
}

/** Vitesse de marche retenue pour l'estimation à pied (km/h). */
const MARCHE_KMH = 4.5

/**
 * L'adresse du calcul. OSRM attend « longitude,latitude » — dans cet ordre,
 * l'inverse des cartes : c'est ici, et nulle part ailleurs, qu'on l'inverse.
 */
export function urlItineraire(depart: Point, arrivee: Point): string {
  const point = (p: Point) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`
  return (
    `${SERVEUR_ITINERAIRE}/route/v1/driving/${point(depart)};${point(arrivee)}` +
    '?overview=full&geometries=geojson&alternatives=false&steps=false'
  )
}

/** La réponse d'OSRM, ou null quand elle ne décrit aucun itinéraire. */
export function lireTrajet(reponse: unknown): Trajet | null {
  const r = reponse as {
    code?: string
    routes?: { distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }[]
  }
  if (r?.code !== 'Ok') return null
  const route = r.routes?.[0]
  const coordonnees = route?.geometry?.coordinates
  if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number')
    return null
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) return null
  // GeoJSON donne [longitude, latitude] ; la carte veut [latitude, longitude].
  const trace: [number, number][] = []
  for (const [longitude, latitude] of coordonnees) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
    trace.push([latitude, longitude])
  }
  return { distance: route.distance, duree: route.duration, trace }
}

/** « 850 m », « 4,2 km », « 12 km » : ce qu'on dirait à voix haute. */
export function formaterDistance(metres: number): string {
  if (metres < 950) return `${Math.max(10, Math.round(metres / 10) * 10)} m`
  const km = metres / 1000
  const texte = km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km))
  return `${texte} km`
}

/** « 4 min », « 1 h 05 » — jamais « 0 min » : au moins une minute. */
export function formaterDuree(secondes: number): string {
  const minutes = Math.max(1, Math.round(secondes / 60))
  if (minutes < 60) return `${minutes} min`
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return reste ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`
}

/** Durée à pied, estimée sur la distance par la route. */
export function dureeAPied(metres: number): number {
  return (metres / 1000 / MARCHE_KMH) * 3600
}

/** Distance à vol d'oiseau, en mètres (haversine) : de quoi juger d'un déplacement. */
export function ecartMetres(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
