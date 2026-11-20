/**
 * Itinéraire vers une structure conventionnée (pages/Itineraire.tsx).
 *
 * Logique pure, sans React : les types partagés et la façon de dire une
 * distance et une durée à l'employé. Le calcul lui-même est confié à Google
 * Directions (pages/itineraire/directions.ts), et le dessin à Google Maps
 * (pages/itineraire/Carte.tsx).
 */

export interface Point {
  latitude: number
  longitude: number
}

export interface Trajet {
  /** En mètres, par la route. */
  distance: number
  /** En secondes, en voiture, trafic en temps réel compris (quand Google le donne). */
  duree: number
  /** En secondes, en voiture, route dégagée : pour dire le retard dû au trafic. */
  dureeSansTrafic?: number
  /** Le tracé, de point en point, pour la carte. */
  trace: [number, number][]
}

/** Vitesse de marche retenue pour l'estimation à pied (km/h). */
const MARCHE_KMH = 4.5

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
