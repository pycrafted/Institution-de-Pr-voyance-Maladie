/**
 * Recherche et filtre par TYPE de document de « Mes bons ».
 *
 * L'employé range ses documents par ce qu'ils sont - « mes lettres de
 * garantie », « mes bons de pharmacie » - et non par leur état : le statut
 * se lit déjà sur chaque carte, et il change tout seul avec le temps.
 *
 * Logique pure (sans React) pour être testée à part : l'écran ne fait que
 * brancher le menu et la barre de recherche sur ces fonctions.
 */

import type { Bon, GenreDocument } from '../../types/api'
import { GENRES_DOCUMENT, genreDe } from '../../utils/documents'
import { dateCourte, dateMoyenne } from '../../utils/format'

/** Valeur du menu : un type de document, ou « tous ». */
export type FiltreType = GenreDocument | 'tous'

export const FILTRES: FiltreType[] = ['tous', ...GENRES_DOCUMENT]

export function estFiltreType(valeur: unknown): valeur is FiltreType {
  return typeof valeur === 'string' && (FILTRES as string[]).includes(valeur)
}

/**
 * Texte comparable : minuscules, sans accents, espaces simplifiés. Les noms
 * arrivent en majuscules d'IPM (« PHARMACIE DE L'AÉROPORT ») et l'employé
 * tape « aeroport » sur son téléphone.
 */
export function normaliser(texte: string | null | undefined): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tout ce sur quoi la recherche porte, pour un bon. */
function texteRecherchable(bon: Bon): string {
  return normaliser(
    [
      bon.code,
      bon.beneficiaire?.nomComplet,
      bon.beneficiaire?.type?.libelle,
      bon.pharmacie?.libelle,
      bon.prestataire?.libelle,
      bon.naturePrestation?.libelle,
      bon.prescripteur?.libelle,
      bon.specialite?.libelle,
      // Les dates telles qu'affichées : « 18/09/2026 », « 18 sept. 2026 ».
      dateCourte(bon.date),
      dateMoyenne(bon.date),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

/**
 * Bons du type choisi ET correspondant à tous les mots de la recherche
 * (« awa plateau » trouve les bons d'Awa à la pharmacie du Plateau). Le
 * numéro se cherche aussi sans ses zéros : « 123 » trouve « BPI000123 ».
 */
export function filtrerBons(bons: readonly Bon[], filtre: FiltreType, recherche: string): Bon[] {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  return bons.filter((bon) => {
    if (filtre !== 'tous' && genreDe(bon) !== filtre) return false
    if (mots.length === 0) return true
    const texte = texteRecherchable(bon)
    const numero = bon.code.replace(/^\D+0*/, '')
    return mots.every((mot) => texte.includes(mot) || numero.startsWith(mot))
  })
}

/** Nombre de documents par type (le compte affiché dans le menu). */
export function compterParType(bons: readonly Bon[]): Record<FiltreType, number> {
  const comptes: Record<FiltreType, number> = {
    tous: bons.length,
    'bon-pharmacie': 0,
    'lettre-garantie': 0,
  }
  for (const bon of bons) comptes[genreDe(bon)] += 1
  return comptes
}
