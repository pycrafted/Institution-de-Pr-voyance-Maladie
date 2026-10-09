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
}

/** Valeur de repli si config.json est absent ou illisible (développement, proxy Vite). */
export const CONFIG_PAR_DEFAUT: ConfigApp = { apiBase: '/api' }

export function normaliserConfig(brut: unknown): ConfigApp {
  if (brut && typeof brut === 'object') {
    const apiBase = (brut as Record<string, unknown>).apiBase
    if (typeof apiBase === 'string' && apiBase.trim()) {
      return { apiBase: apiBase.trim().replace(/\/+$/, '') }
    }
  }
  return CONFIG_PAR_DEFAUT
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
