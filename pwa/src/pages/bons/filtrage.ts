/**
 * Recherche et filtre par statut de « Mes bons ».
 *
 * Logique pure (sans React) pour être testée à part : l'écran ne fait que
 * brancher le segment et la barre de recherche sur ces fonctions.
 */

import type { Bon, StatutBon } from '../../types/api'
import { dateCourte, dateMoyenne } from '../../utils/format'
import { ORDRE_STATUTS } from '../../utils/statut'

/** Valeur du segment : un statut, ou « tous ». */
export type FiltreStatut = StatutBon | 'tous'

export const FILTRES: FiltreStatut[] = ['tous', ...ORDRE_STATUTS]

export function estFiltreStatut(valeur: unknown): valeur is FiltreStatut {
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
 * Bons correspondant au statut choisi ET à tous les mots de la recherche
 * (« awa plateau » trouve les bons d'Awa à la pharmacie du Plateau). Le
 * numéro se cherche aussi sans ses zéros : « 123 » trouve « BPI000123 ».
 */
export function filtrerBons(bons: readonly Bon[], filtre: FiltreStatut, recherche: string): Bon[] {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  return bons.filter((bon) => {
    if (filtre !== 'tous' && bon.statut !== filtre) return false
    if (mots.length === 0) return true
    const texte = texteRecherchable(bon)
    const numero = bon.code.replace(/^\D+0*/, '')
    return mots.every((mot) => texte.includes(mot) || numero.startsWith(mot))
  })
}

/** Nombre de bons par valeur du segment (pour les pastilles du filtre). */
export function compterParStatut(bons: readonly Bon[]): Record<FiltreStatut, number> {
  const comptes: Record<FiltreStatut, number> = {
    tous: bons.length,
    valide: 0,
    traite: 0,
    expire: 0,
    annule: 0,
  }
  for (const bon of bons) {
    if (bon.statut in comptes) comptes[bon.statut] += 1
  }
  return comptes
}
