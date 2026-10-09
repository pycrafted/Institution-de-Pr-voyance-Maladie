/**
 * Identité d'un document de « Mes bons ».
 *
 * Bons de pharmacie et lettres de garantie ont chacun leur numérotation
 * interne : l'`id` seul ne désigne donc rien. Tout ce qui retrouve un
 * document (liste partagée, cache, route du détail) passe par son genre ET
 * son id.
 */

import type { Bon, GenreDocument } from '../types/api'

/** Les genres que l'API sait émettre, qui sont aussi des clés du catalogue. */
export const GENRES_DOCUMENT: readonly GenreDocument[] = ['bon-pharmacie', 'lettre-garantie']

export function estGenreDocument(valeur: string): valeur is GenreDocument {
  return (GENRES_DOCUMENT as readonly string[]).includes(valeur)
}

/** Le genre d'un document ; une liste mise en cache avant les lettres n'en porte pas. */
export function genreDe(document: Pick<Bon, 'genre'>): GenreDocument {
  return document.genre ?? 'bon-pharmacie'
}

/** Clé unique : « bon-pharmacie:12 », « lettre-garantie:12 ». */
export function cleDocument(document: Pick<Bon, 'genre' | 'id'>): string {
  return `${genreDe(document)}:${document.id}`
}

export function memeDocument(a: Pick<Bon, 'genre' | 'id'>, b: Pick<Bon, 'genre' | 'id'>): boolean {
  return a.id === b.id && genreDe(a) === genreDe(b)
}

/**
 * Préfixe de la route du détail : /bons/:id, /bons/lettres/:id. Les lettres
 * restent sous /bons : l'onglet « Mes bons » reste allumé sur leur détail.
 */
export const PREFIXE_ROUTE: Record<GenreDocument, string> = {
  'bon-pharmacie': '/bons',
  'lettre-garantie': '/bons/lettres',
}

/** Route du détail du document. */
export function cheminDocument(document: Pick<Bon, 'genre' | 'id'>): string {
  return `${PREFIXE_ROUTE[genreDe(document)]}/${document.id}`
}

/** Genre lu dans un chemin de détail (« /bons/lettres/4 »), ou null. */
export function genreDuChemin(chemin: string | undefined): GenreDocument | null {
  if (!chemin) return null
  if (/^\/bons\/lettres(\/|$)/.test(chemin)) return 'lettre-garantie'
  if (/^\/bons(\/|$)/.test(chemin)) return 'bon-pharmacie'
  return null
}
