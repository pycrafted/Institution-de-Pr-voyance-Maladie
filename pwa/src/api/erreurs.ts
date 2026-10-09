/**
 * Erreurs typées du client API.
 *
 * Tout échec d'appel devient une ErreurApi dont le « genre » dit quoi faire à
 * l'écran, et dont le message est déjà une phrase française montrable telle
 * quelle à l'employé (jamais un code HTTP ni un message technique anglais).
 */

import type { ErreursChamps } from '../types/api'

export type GenreErreur =
  /** Pas de réseau, serveur injoignable, CORS refusé. */
  | 'reseau'
  /** Pas de réponse dans le délai (15 s). */
  | 'delai'
  /** Annulée par l'appelant (écran quitté) : à ignorer silencieusement. */
  | 'annulee'
  /** 400 : erreurs par champ dans `champs`. */
  | 'validation'
  /** 401 : identité incorrecte (identification) ou session expirée (le reste). */
  | 'non-autorise'
  /** 403 : ex. dossier IPM non actif. */
  | 'interdit'
  /** 404 */
  | 'introuvable'
  /** 429 : trop de tentatives d'identification. */
  | 'trop-de-requetes'
  /** 5xx */
  | 'serveur'
  /** Tout le reste (réponse illisible, statut inattendu). */
  | 'inconnue'

export const MESSAGES: Record<GenreErreur, string> = {
  reseau: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
  delai: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
  annulee: 'Opération annulée.',
  validation: 'Certaines informations sont incorrectes.',
  'non-autorise': 'Session expirée. Identifiez-vous à nouveau.',
  interdit: "Vous n'avez pas accès à cette information.",
  introuvable: 'Élément introuvable. Il a peut-être été supprimé.',
  'trop-de-requetes': 'Trop de tentatives. Patientez une minute avant de réessayer.',
  serveur: 'Le service IPM rencontre un problème. Réessayez plus tard.',
  inconnue: 'Une erreur inattendue est survenue. Réessayez.',
}

export class ErreurApi extends Error {
  override readonly name = 'ErreurApi'
  readonly genre: GenreErreur
  /** Statut HTTP, null si la requête n'a pas abouti (réseau, délai). */
  readonly statut: number | null
  /** Erreurs 400 par champ, au format DRF ({ champ: [messages] }) ; vide sinon. */
  readonly champs: ErreursChamps

  constructor(
    genre: GenreErreur,
    options: { message?: string; statut?: number | null; champs?: ErreursChamps } = {},
  ) {
    super(options.message ?? MESSAGES[genre])
    this.genre = genre
    this.statut = options.statut ?? null
    this.champs = options.champs ?? {}
  }

  /** Premier message d'erreur d'un champ (400), ou undefined. */
  champ(nom: string): string | undefined {
    return this.champs[nom]?.[0]
  }
}

export function estErreurApi(e: unknown): e is ErreurApi {
  return e instanceof ErreurApi
}

/** Message montrable pour n'importe quelle erreur attrapée. */
export function messageErreur(e: unknown): string {
  if (estErreurApi(e)) return e.message
  return MESSAGES.inconnue
}

export function genreSelonStatut(statut: number): GenreErreur {
  if (statut === 400) return 'validation'
  if (statut === 401) return 'non-autorise'
  if (statut === 403) return 'interdit'
  if (statut === 404) return 'introuvable'
  if (statut === 429) return 'trop-de-requetes'
  if (statut >= 500) return 'serveur'
  return 'inconnue'
}

/**
 * Normalise un corps d'erreur DRF en { champ: [messages] }.
 * DRF renvoie selon les cas { detail: "..." }, { champ: ["..."] },
 * { champ: "..." } ou une liste ["..."] (non_field_errors implicites).
 */
export function champsDepuisCorps(corps: unknown): ErreursChamps {
  if (Array.isArray(corps)) {
    return { non_field_errors: corps.filter((m): m is string => typeof m === 'string') }
  }
  if (!corps || typeof corps !== 'object') return {}
  const champs: ErreursChamps = {}
  for (const [cle, valeur] of Object.entries(corps as Record<string, unknown>)) {
    if (cle === 'detail') continue
    if (Array.isArray(valeur)) {
      champs[cle] = valeur.filter((m): m is string => typeof m === 'string')
    } else if (typeof valeur === 'string') {
      champs[cle] = [valeur]
    }
  }
  return champs
}

/** Le « detail » d'une réponse DRF, s'il y en a un. */
export function detailDepuisCorps(corps: unknown): string | undefined {
  if (corps && typeof corps === 'object' && !Array.isArray(corps)) {
    const detail = (corps as Record<string, unknown>).detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return undefined
}
