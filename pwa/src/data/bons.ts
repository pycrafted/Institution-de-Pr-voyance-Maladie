/**
 * Liste des bons du participant, partagée par tous les écrans.
 *
 * Accueil (3 derniers), Mes bons et le détail lisent la même liste : un bon
 * créé par l'assistant y apparaît partout sans rechargement. Stratégie :
 * la dernière liste en cache s'affiche tout de suite (hors ligne compris),
 * puis le réseau la remplace dès qu'il répond.
 */

import { useEffect, useSyncExternalStore } from 'react'

import { ErreurApi, listerBons } from '../api'
import { enregistrerBonsEnCache, lireBonsEnCache } from '../offline/stockage'
import type { Bon, GenreDocument } from '../types/api'
import { cleDocument, memeDocument } from '../utils/documents'

export interface EtatBons {
  /** null tant que rien n'est connu (ni cache, ni réseau). */
  bons: Bon[] | null
  /** Date-heure ISO de la dernière synchronisation réussie avec le serveur. */
  synchroniseLe: string | null
  /** true si la liste affichée vient du cache (serveur pas encore joint ou injoignable). */
  depuisCache: boolean
  chargement: boolean
  /** Dernier échec de synchronisation ; la liste précédente reste affichée. */
  erreur: ErreurApi | null
}

const INITIAL: EtatBons = {
  bons: null,
  synchroniseLe: null,
  depuisCache: false,
  chargement: false,
  erreur: null,
}

let etat: EtatBons = INITIAL
const abonnes = new Set<() => void>()
let enCours: Promise<void> | null = null
let dejaCharge = false
// Incrémentée à la déconnexion : une réponse arrivée après ne doit pas
// ressusciter la liste de l'employé précédent.
let generation = 0
// Bons mémorisés (création, détail rechargé) et numéro d'ordre de la
// mémorisation. Une synchronisation partie AVANT une mémorisation ne les
// connaît pas encore : sa réponse ne doit pas les effacer (cf. chargerBons).
let versionMemoire = 0
let memorises: { bon: Bon; version: number }[] = []

/**
 * Du plus récent au plus ancien selon la date du bon, puis l'heure de
 * saisie. Le serveur trie sur la saisie (-cree_le) ; or l'IPM saisit parfois
 * un bon après coup, avec une date antérieure : sans ce tri, les mois de
 * « Mes bons » et les « Derniers bons » de l'accueil sortaient dans le
 * désordre.
 */
export function trierBons(bons: readonly Bon[]): Bon[] {
  // Tri stable : à égalité, l'ordre reçu est gardé.
  return [...bons].sort((a, b) => b.date.localeCompare(a.date) || b.creeLe.localeCompare(a.creeLe))
}

function modifier(partiel: Partial<EtatBons>) {
  // Toute liste publiée est triée : chaque écran la reçoit dans le bon ordre.
  const bons = partiel.bons ? trierBons(partiel.bons) : partiel.bons
  etat = { ...etat, ...partiel, ...(bons !== undefined && { bons }) }
  abonnes.forEach((abonne) => abonne())
}

/** La réponse du serveur, complétée des bons mémorisés depuis l'envoi de la requête. */
function avecMemorises(bons: Bon[], depuis: number): Bon[] {
  const recents = memorises.filter((m) => m.version > depuis)
  if (recents.length === 0) return bons
  const parCle = new Map(bons.map((bon) => [cleDocument(bon), bon]))
  // Mémorisé après l'envoi : plus frais que ce que la réponse en dit.
  for (const { bon } of recents) parCle.set(cleDocument(bon), bon)
  return [...parCle.values()]
}

function sAbonner(abonne: () => void) {
  abonnes.add(abonne)
  return () => abonnes.delete(abonne)
}

export function etatBons(): EtatBons {
  return etat
}

/**
 * Synchronise avec le serveur (le cache d'abord, au premier appel). Les
 * appels simultanés partagent la même requête. Ne rejette jamais : l'échec
 * est dans `erreur`.
 */
export function chargerBons(): Promise<void> {
  if (enCours) return enCours
  dejaCharge = true
  const ma = generation
  const actuelle = () => ma === generation
  const promesse = (async () => {
    modifier({ chargement: true })
    if (etat.bons === null) {
      const enCache = await lireBonsEnCache()
      if (enCache && actuelle() && etat.bons === null) {
        modifier({ bons: enCache.bons, synchroniseLe: enCache.le, depuisCache: true })
      }
    }
    try {
      const depuis = versionMemoire
      const recus = await listerBons()
      if (!actuelle()) return
      const bons = avecMemorises(recus, depuis)
      // Les mémorisations antérieures à l'envoi sont dans la réponse : oubliées.
      memorises = memorises.filter((m) => m.version > depuis)
      const le = new Date().toISOString()
      modifier({ bons, synchroniseLe: le, depuisCache: false, erreur: null })
      await enregistrerBonsEnCache(bons, le)
    } catch (e) {
      if (actuelle()) modifier({ erreur: e instanceof ErreurApi ? e : new ErreurApi('inconnue') })
    } finally {
      if (actuelle()) {
        modifier({ chargement: false })
        enCours = null
      }
    }
  })()
  enCours = promesse
  return promesse
}

/**
 * Insère ou remplace un bon (création, détail rechargé) et met le cache à
 * jour. Une synchronisation déjà en vol le gardera (cf. avecMemorises).
 */
export function memoriserBon(bon: Bon): void {
  versionMemoire += 1
  memorises.push({ bon, version: versionMemoire })
  const inserer = (bons: Bon[]) =>
    bons.some((b) => memeDocument(b, bon))
      ? bons.map((b) => (memeDocument(b, bon) ? bon : b))
      : [bon, ...bons]
  if (etat.bons !== null) {
    const suivants = inserer(etat.bons)
    modifier({ bons: suivants })
    void enregistrerBonsEnCache(suivants, etat.synchroniseLe ?? new Date().toISOString())
    return
  }
  // Liste pas encore chargée : l'écrire telle quelle remplacerait tout le
  // cache hors ligne par ce seul bon. On l'ajoute donc au cache existant.
  modifier({ bons: [bon] })
  // (Relue après modifier, qui publie une copie triée.)
  const provisoire = etat.bons
  const ma = generation
  void (async () => {
    const enCache = await lireBonsEnCache()
    // Le serveur a répondu entre-temps : sa liste fait foi (et contient le bon).
    if (ma !== generation || etat.bons !== provisoire) return
    const suivants = inserer(enCache?.bons ?? [])
    // Tant que le serveur n'a pas répondu, montrer la liste complète du cache
    // plutôt que ce seul bon.
    modifier({ bons: suivants, depuisCache: enCache !== undefined })
    await enregistrerBonsEnCache(suivants, enCache?.le ?? new Date().toISOString())
  })()
}

/** Oublie tout (déconnexion). Le cache IndexedDB est vidé par la session. */
export function reinitialiserBons(): void {
  generation += 1
  dejaCharge = false
  enCours = null
  memorises = []
  etat = INITIAL
  abonnes.forEach((abonne) => abonne())
}

/**
 * La liste des bons ; la charge au premier écran qui l'utilise.
 * `rafraichir` sert au tirer-pour-rafraîchir (IonRefresher).
 */
export function useBons(): EtatBons & { rafraichir: () => Promise<void> } {
  const courant = useSyncExternalStore(sAbonner, etatBons, etatBons)
  useEffect(() => {
    if (!dejaCharge) void chargerBons()
  }, [])
  return { ...courant, rafraichir: chargerBons }
}

/** Un document de la liste connue, ou undefined. */
export function useBonConnu(genre: GenreDocument, id: number): Bon | undefined {
  const courant = useSyncExternalStore(sAbonner, etatBons, etatBons)
  return courant.bons?.find((bon) => memeDocument(bon, { genre, id }))
}
