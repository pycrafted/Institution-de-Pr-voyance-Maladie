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
 * pour que la carte ne reste jamais sans trajet. Le refus est retenu pour la
 * session : on ne repaie pas un aller-retour perdu à chaque itinéraire.
 *
 * Mémoire tampon : un itinéraire calculé est gardé quelques minutes, par
 * départ (arrondi à ~100 m) et destination. Rouvrir une structure, revenir
 * sur un trajet ou passer d'un écran à l'autre l'affiche donc sur-le-champ.
 * Le calcul EN COURS est lui aussi partagé : toucher un point lance le calcul
 * dès l'appui (préchargement), et l'affichage reprend la même promesse.
 */

import { chargerGoogleMaps } from './googleMaps'
import type { Point, Trajet } from './trajet'

/** Les champs demandés à Routes API (masque obligatoire, et facturé au plus juste). */
const CHAMPS_ROUTES = ['path', 'distanceMeters', 'durationMillis', 'staticDurationMillis']

/**
 * Routes API refusée une fois : on passe directement au repli pendant 24 h
 * (retenu sur le téléphone), puis on la retente - elle a pu être activée.
 */
const CLE_REFUS = 'ipm.routes.refusee'
const DUREE_REFUS_MS = 24 * 60 * 60_000
let routesRefusee = lireRefus()

function lireRefus(): boolean {
  try {
    const le = Number(window.localStorage.getItem(CLE_REFUS))
    return Number.isFinite(le) && le > 0 && Date.now() - le < DUREE_REFUS_MS
  } catch {
    return false
  }
}

function retenirRefus(): void {
  routesRefusee = true
  try {
    window.localStorage.setItem(CLE_REFUS, String(Date.now()))
  } catch {
    // Stockage indisponible : le refus vaut pour la session seulement.
  }
}

/** Durée de vie d'un itinéraire en mémoire (le trafic change, pas la route). */
const DUREE_MEMOIRE_MS = 5 * 60_000
/** Au-delà, les plus anciens sont oubliés. */
const TAILLE_MEMOIRE = 40

const memoire = new Map<string, { le: number; promesse: Promise<Trajet[]> }>()

/** Départ arrondi à ~100 m (3 décimales), destination exacte. */
function cle(depart: Point, arrivee: Point): string {
  return [
    depart.latitude.toFixed(3),
    depart.longitude.toFixed(3),
    arrivee.latitude.toFixed(6),
    arrivee.longitude.toFixed(6),
  ].join('|')
}

/** Oublie les itinéraires mémorisés (tests). */
export function viderMemoireTrajets(): void {
  memoire.clear()
  routesRefusee = false
  try {
    window.localStorage.removeItem(CLE_REFUS)
  } catch {
    // Rien à effacer.
  }
}

/**
 * Lance le calcul sans attendre le résultat (appui sur un point de la carte) :
 * quand l'affichage le demandera, il sera déjà en route, ou déjà là.
 */
export function prechargerTrajets(depart: Point, arrivee: Point): void {
  void calculerTrajets(depart, arrivee).catch(() => undefined)
}

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
  const k = cle(depart, arrivee)
  const maintenant = Date.now()
  let entree = memoire.get(k)
  if (!entree || maintenant - entree.le > DUREE_MEMOIRE_MS) {
    const promesse = calculer(depart, arrivee)
    entree = { le: maintenant, promesse }
    memoire.set(k, entree)
    // Un échec n'est pas gardé : la prochaine demande réessaie.
    promesse.catch(() => {
      if (memoire.get(k)?.promesse === promesse) memoire.delete(k)
    })
    while (memoire.size > TAILLE_MEMOIRE) {
      const plusAncienne = memoire.keys().next().value
      if (plusAncienne === undefined) break
      memoire.delete(plusAncienne)
    }
  }
  // Le calcul partagé n'est pas annulé par un appelant pressé : seul son
  // résultat est ignoré.
  const trajets = await entree.promesse
  return signal?.aborted ? [] : trajets
}

async function calculer(depart: Point, arrivee: Point): Promise<Trajet[]> {
  const maps = await chargerGoogleMaps()
  if (!routesRefusee) {
    try {
      return await parRoutes(maps, depart, arrivee)
    } catch (erreur) {
      retenirRefus()
      console.warn('Routes API indisponible, repli sur DirectionsService :', erreur)
    }
  }
  return parDirections(maps, depart, arrivee)
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
    // Trafic au moment de la demande. Pas de `departureTime` : « maintenant »
    // est déjà passé quand la requête arrive, et Google la refuse
    // (« Timestamp must be set to a future time ») ; sans lui, il prend l'heure
    // de réception.
    routingPreference: 'TRAFFIC_AWARE',
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
