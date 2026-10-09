/**
 * Client HTTP unique d'IPM Mobile. TOUT appel à l'API passe par `requete`.
 *
 * - adresse de base lue à l'exécution (config.json, cf. config.ts) ;
 * - en-tête `Authorization: Participant <jeton>` ;
 * - délai d'expiration de 15 s ;
 * - échecs convertis en ErreurApi (erreurs.ts) ;
 * - 401 sur un appel authentifié : la session est close proprement
 *   (callback fourni par le store de session), retour à l'identification.
 *
 * Aucune donnée n'est jamais écrite dans la console : ni jeton, ni corps.
 */

import {
  ErreurApi,
  champsDepuisCorps,
  detailDepuisCorps,
  genreSelonStatut,
  MESSAGES,
} from './erreurs'

export const DELAI_MS = 15_000

interface EtatClient {
  apiBase: string
  jeton: string | null
  /** Appelé une fois par 401 reçu sur un appel authentifié. */
  surSessionExpiree: (() => void) | null
  fetch: typeof fetch
}

const etat: EtatClient = {
  apiBase: '/api',
  jeton: null,
  surSessionExpiree: null,
  // Lié à window : certains navigateurs refusent un fetch « détaché ».
  fetch: (...args) => globalThis.fetch(...args),
}

/** Réglages du client, posés par le store de session (et par les tests). */
export function configurerClient(reglages: Partial<EtatClient>): void {
  Object.assign(etat, reglages)
  etat.apiBase = etat.apiBase.replace(/\/+$/, '')
}

export function apiBase(): string {
  return etat.apiBase
}

export interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sérialisé en JSON. */
  corps?: unknown
  /** Paramètres de requête ; les valeurs undefined sont omises. */
  params?: Record<string, string | number | undefined>
  /** Annulation par l'appelant (écran quitté). */
  signal?: AbortSignal
  /** Forme de la réponse attendue. */
  reponse?: 'json' | 'blob'
  /** false : n'envoie pas le jeton et ne déclenche pas la déconnexion sur 401. */
  authentifiee?: boolean
  delaiMs?: number
}

/** Construit l'URL complète : `chemin` commence par « / » et est relatif à apiBase. */
export function construireUrl(chemin: string, params?: OptionsRequete['params']): string {
  let url = `${etat.apiBase}${chemin.startsWith('/') ? chemin : `/${chemin}`}`
  if (params) {
    const recherche = new URLSearchParams()
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur !== undefined) recherche.set(cle, String(valeur))
    }
    const texte = recherche.toString()
    if (texte) url += `?${texte}`
  }
  return url
}

async function lireCorps(reponse: Response): Promise<unknown> {
  const texte = await reponse.text().catch(() => '')
  if (!texte) return null
  try {
    return JSON.parse(texte)
  } catch {
    return null
  }
}

export async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const {
    methode = 'GET',
    corps,
    params,
    signal,
    reponse: forme = 'json',
    authentifiee = true,
    delaiMs = DELAI_MS,
  } = options

  const entetes: Record<string, string> = {
    Accept: forme === 'blob' ? 'application/pdf, */*' : 'application/json',
  }
  if (corps !== undefined) entetes['Content-Type'] = 'application/json'
  if (authentifiee && etat.jeton) entetes.Authorization = `Participant ${etat.jeton}`

  // Un seul contrôleur pour le délai et l'annulation de l'appelant.
  const controleur = new AbortController()
  let delaiEcoule = false
  const minuteur = setTimeout(() => {
    delaiEcoule = true
    controleur.abort()
  }, delaiMs)
  const relayerAnnulation = () => controleur.abort()
  if (signal) {
    if (signal.aborted) controleur.abort()
    else signal.addEventListener('abort', relayerAnnulation, { once: true })
  }

  try {
    let reponse: Response
    try {
      reponse = await etat.fetch(construireUrl(chemin, params), {
        method: methode,
        headers: entetes,
        body: corps === undefined ? undefined : JSON.stringify(corps),
        signal: controleur.signal,
        // Jeton en en-tête, jamais de cookie : l'API est sur une autre origine.
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      if (delaiEcoule) throw new ErreurApi('delai')
      if (signal?.aborted) throw new ErreurApi('annulee')
      throw new ErreurApi('reseau', {
        message:
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'Vous êtes hors ligne. Vérifiez votre connexion.'
            : MESSAGES.reseau,
      })
    }

    if (reponse.ok) {
      if (forme === 'blob') {
        try {
          return (await reponse.blob()) as T
        } catch {
          throw new ErreurApi(delaiEcoule ? 'delai' : 'reseau')
        }
      }
      if (reponse.status === 204) return undefined as T
      const donnees = await lireCorps(reponse)
      if (donnees === null) throw new ErreurApi('inconnue', { statut: reponse.status })
      return donnees as T
    }

    const genre = genreSelonStatut(reponse.status)
    const corpsErreur = await lireCorps(reponse)
    const detail = detailDepuisCorps(corpsErreur)
    const champs = genre === 'validation' ? champsDepuisCorps(corpsErreur) : {}

    if (genre === 'non-autorise' && authentifiee) {
      // Jeton expiré, falsifié, ou participant devenu inactif : on ferme la
      // session ; le routage renvoie vers l'identification.
      etat.surSessionExpiree?.()
    }

    // Le « detail » du serveur est déjà en français (vues mobiles d'IPM),
    // sauf pour les réponses génériques de DRF (limitation de débit,
    // 404 par défaut, 5xx) qu'on remplace par nos propres phrases.
    const detailUtilisable =
      detail && (genre === 'non-autorise' || genre === 'interdit' || genre === 'validation')
        ? detail
        : undefined
    const premierChamp = Object.values(champs)[0]?.[0]
    throw new ErreurApi(genre, {
      statut: reponse.status,
      champs,
      message: detailUtilisable ?? (genre === 'validation' ? premierChamp : undefined),
    })
  } finally {
    clearTimeout(minuteur)
    signal?.removeEventListener('abort', relayerAnnulation)
  }
}
