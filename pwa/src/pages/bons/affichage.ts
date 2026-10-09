/**
 * Mise en forme des libellés venus d'IPM pour « Mes bons » et le détail.
 *
 * IPM saisit noms et raisons sociales en majuscules (« PHARMACIE DE LA
 * GARE ») : lisible sur le bon imprimé, criard dans une liste de téléphone.
 */

import { documentTextOutline } from 'ionicons/icons'

import { documentParCle } from '../../services/catalogue'
import type { Bon } from '../../types/api'
import { genreDe } from '../../utils/documents'
import { libelleLien, nomPropre } from '../../utils/libelles'

// nomPropre vit dans utils/libelles.ts, commun à tous les écrans ; il reste
// exporté d'ici pour les écrans de « Mes bons » et de l'assistant.
export { nomPropre }

/** Ce qu'une carte de document affiche de son type : son nom et son icône. */
export interface TypeAffiche {
  libelle: string
  icone: string
}

// Repli si la clé disparaissait du catalogue : « Mes bons » doit rester
// lisible, jamais afficher une carte sans nom.
const TYPE_PAR_DEFAUT: TypeAffiche = { libelle: 'Bon de pharmacie', icone: documentTextOutline }

/**
 * Type d'un document (SPEC_DESIGN §5 : « Mes bons » affiche le type, et
 * non plus seulement un numéro). Le libellé et l'icône viennent du catalogue
 * (services/catalogue.ts), dont les clés sont les genres de l'API.
 */
export function typeDocument(document: Pick<Bon, 'genre'>): TypeAffiche {
  return documentParCle(genreDe(document)) ?? TYPE_PAR_DEFAUT
}

/**
 * Où se présenter avec le document : la pharmacie d'un bon, le prestataire
 * d'une lettre de garantie.
 */
export function structureDuDocument(document: Pick<Bon, 'pharmacie' | 'prestataire'>): string {
  return nomPropre((document.pharmacie ?? document.prestataire)?.libelle)
}

/** « Awa Diop · Épouse », ou le nom seul si le lien est inconnu. */
export function libelleBeneficiaire(bon: Pick<Bon, 'beneficiaire'>): string {
  const b = bon.beneficiaire
  if (!b) return 'Bénéficiaire inconnu'
  // Même libellé que l'accueil et le profil (utils/libelles.libelleLien).
  const lien = b.type?.libelle ? libelleLien(b) : ''
  const nom = nomPropre(b.nomComplet)
  return lien ? `${nom} · ${lien}` : nom
}
