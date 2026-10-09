/**
 * Stockage local d'IPM Mobile (IndexedDB via idb-keyval).
 *
 * Deux bases distinctes, pour pouvoir tout effacer d'un coup à la
 * déconnexion :
 *  - « ipm-mobile-session » : jeton, participant, bénéficiaires ;
 *  - « ipm-mobile-cache »   : dernière liste de bons et PDF déjà vus, pour
 *    le hors-ligne (SPEC §3 : le service worker ne met jamais l'API en cache).
 *
 * Toutes les fonctions avalent les erreurs d'IndexedDB (navigation privée,
 * quota) : le stockage est un confort, jamais une condition pour afficher.
 */

import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval'

import type { Beneficiaire, Bon, GenreDocument, Participant } from '../types/api'
import { memeDocument } from '../utils/documents'

let magasinSession: UseStore | null = null
let magasinCache: UseStore | null = null

// Créés à la première utilisation : createStore ouvre la base immédiatement.
function session(): UseStore {
  magasinSession ??= createStore('ipm-mobile-session', 'kv')
  return magasinSession
}
function cache(): UseStore {
  magasinCache ??= createStore('ipm-mobile-cache', 'kv')
  return magasinCache
}

async function sansEchec<T>(operation: () => Promise<T>, repli: T): Promise<T> {
  try {
    return await operation()
  } catch {
    return repli
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionEnregistree {
  jeton: string
  participant: Participant
  beneficiaires: Beneficiaire[]
  /** Date-heure ISO de l'identification. */
  depuis: string
}

const CLE_SESSION = 'session'

export function lireSession(): Promise<SessionEnregistree | undefined> {
  return sansEchec(() => get<SessionEnregistree>(CLE_SESSION, session()), undefined)
}

export function enregistrerSession(valeur: SessionEnregistree): Promise<void> {
  return sansEchec(() => set(CLE_SESSION, valeur, session()), undefined)
}

export function effacerSession(): Promise<void> {
  return sansEchec(() => del(CLE_SESSION, session()), undefined)
}

// ---------------------------------------------------------------------------
// Cache hors-ligne : bons
// ---------------------------------------------------------------------------

export interface BonsEnCache {
  bons: Bon[]
  /** Date-heure ISO de la dernière synchronisation réussie. */
  le: string
}

const CLE_BONS = 'bons'

export function lireBonsEnCache(): Promise<BonsEnCache | undefined> {
  return sansEchec(() => get<BonsEnCache>(CLE_BONS, cache()), undefined)
}

export function enregistrerBonsEnCache(bons: Bon[], le = new Date().toISOString()): Promise<void> {
  return sansEchec(() => set(CLE_BONS, { bons, le } satisfies BonsEnCache, cache()), undefined)
}

/** Un document de la dernière liste connue (détail hors ligne). */
export async function lireBonEnCache(genre: GenreDocument, id: number): Promise<Bon | undefined> {
  const enCache = await lireBonsEnCache()
  return enCache?.bons.find((bon) => memeDocument(bon, { genre, id }))
}

// ---------------------------------------------------------------------------
// Cache hors-ligne : PDF
// ---------------------------------------------------------------------------

// On stocke des octets plutôt qu'un Blob : certains Safari ont longtemps
// refusé les Blob dans IndexedDB. L'empreinte est celle du bon au moment du
// téléchargement (cf. pages/bons/useDetailBon.empreinteImpression) : si
// l'IPM modifie le bon, elle ne correspond plus et le PDF est retéléchargé.
interface PdfEnCache {
  octets: ArrayBuffer
  type: string
  empreinte?: string | null
}

/** Un PDF relu dans le cache, avec l'empreinte du bon qu'il imprime (null si inconnue). */
export interface PdfLu {
  pdf: Blob
  empreinte: string | null
}

// « pdf:12 » pour un bon (la clé d'avant les lettres, pour ne pas perdre les
// PDF déjà vus), « pdf:lettre-garantie:12 » pour une lettre.
const clePdf = (genre: GenreDocument, id: number) =>
  genre === 'bon-pharmacie' ? `pdf:${id}` : `pdf:${genre}:${id}`

// Incrémentée par viderCache (déconnexion). Un téléchargement parti avant
// et fini après ne doit pas réécrire, dans le cache qu'on vient de vider, le
// PDF nominatif de l'employé précédent.
let generation = 0

/** Génération courante du cache, à relever AVANT de lancer un téléchargement. */
export function generationCache(): number {
  return generation
}

export async function lirePdfEnCache(genre: GenreDocument, id: number): Promise<PdfLu | undefined> {
  const valeur = await sansEchec(() => get<PdfEnCache>(clePdf(genre, id), cache()), undefined)
  if (!valeur) return undefined
  return {
    pdf: new Blob([valeur.octets], { type: valeur.type }),
    empreinte: valeur.empreinte ?? null,
  }
}

export async function enregistrerPdfEnCache(
  genre: GenreDocument,
  id: number,
  pdf: Blob,
  options: { empreinte?: string | null; generation?: number } = {},
): Promise<void> {
  const depuis = options.generation ?? generation
  if (depuis !== generation) return
  await sansEchec(async () => {
    const octets = await pdf.arrayBuffer()
    // Le cache a pu être vidé pendant la lecture des octets.
    if (depuis !== generation) return
    const valeur: PdfEnCache = {
      octets,
      type: pdf.type || 'application/pdf',
      empreinte: options.empreinte ?? null,
    }
    await set(clePdf(genre, id), valeur, cache())
  }, undefined)
}

/** Efface bons et PDF (déconnexion). */
export function viderCache(): Promise<void> {
  generation += 1
  return sansEchec(() => clear(cache()), undefined)
}
