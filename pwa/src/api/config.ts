/**
 * Configuration d'exécution : /config.json, lu au démarrage.
 *
 * L'adresse de l'API n'est PAS une constante de build : le même dist/ se
 * déploie contre n'importe quel IPM (pwa/deploy/publier.ps1 -ApiBase réécrit
 * config.json). Le service worker sert ce fichier en NetworkFirst : hors
 * ligne, on retrouve la dernière adresse connue.
 */

export interface ConfigApp {
  /** Racine de l'API IPM, sans « / » final : « https://…/api » ou « /api ». */
  apiBase: string
  /**
   * Clé de l'API Google Maps (carte et itinéraire de l'écran « Itinéraire »).
   * Absente : la carte le dit plutôt que de s'afficher vide. Mise dans
   * config.json du serveur (hors Git), restreinte par référent HTTP.
   */
  cleGoogleMaps: string
  /**
   * ID de carte Google (carte vectorielle et style « IPM clair » définis dans
   * la console Google Cloud). Vide : l'ID par défaut du projet IPM (cf.
   * itineraire/googleMaps.ts). Pas un secret : il ne sert qu'avec la clé.
   */
  idCarteGoogle: string
}

/** Valeur de repli si config.json est absent ou illisible (développement, proxy Vite). */
export const CONFIG_PAR_DEFAUT: ConfigApp = {
  apiBase: '/api',
  cleGoogleMaps: '',
  idCarteGoogle: '',
}

export function normaliserConfig(brut: unknown): ConfigApp {
  const config: ConfigApp = { ...CONFIG_PAR_DEFAUT }
  if (brut && typeof brut === 'object') {
    const champs = brut as Record<string, unknown>
    if (typeof champs.apiBase === 'string' && champs.apiBase.trim()) {
      config.apiBase = champs.apiBase.trim().replace(/\/+$/, '')
    }
    if (typeof champs.cleGoogleMaps === 'string') {
      config.cleGoogleMaps = champs.cleGoogleMaps.trim()
    }
    if (typeof champs.idCarteGoogle === 'string') {
      config.idCarteGoogle = champs.idCarteGoogle.trim()
    }
  }
  return config
}

export async function chargerConfig(fetchFn: typeof fetch = fetch): Promise<ConfigApp> {
  try {
    const reponse = await fetchFn('/config.json', { cache: 'no-cache' })
    if (!reponse.ok) throw new Error(String(reponse.status))
    return normaliserConfig(await reponse.json())
  } catch {
    console.warn('config.json illisible : API par défaut (/api).')
    return CONFIG_PAR_DEFAUT
  }
}
