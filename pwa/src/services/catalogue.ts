/**
 * Catalogue de l'accueil (SPEC_DESIGN §4) : DEUX familles, jamais mêlées.
 *
 *   DOCUMENTS  — les types de bons que l'employé peut demander. C'est le cœur
 *                de l'accueil : une GRANDE carte de service (§3.4) par type,
 *                sur deux colonnes.
 * Les écrans utilitaires n'y figurent pas : « Mes bons »,
 * « Pharmacies » et « Profil » sont des onglets de la barre du bas, et
 * « Assistance » vit dans les réglages du profil. Les mêler aux documents
 * donnerait le même poids visuel à la raison d'être de l'application et à un
 * réglage — ce que §4 interdit.
 *
 * Pourquoi un catalogue déclaratif ? L'IPM sait produire quatre documents
 * mais l'API mobile n'en expose qu'un aujourd'hui. Le jour où une API existe,
 * on bascule `disponible` et on renseigne `route` : aucun écran n'est à
 * retoucher, et la grille accepte sans modification un cinquième type.
 * Cf. README.md, « Ouvrir un nouveau service ».
 */

import { bedOutline, eyeOutline, medkitOutline, shieldCheckmarkOutline } from 'ionicons/icons'

/** Clé stable d'un type de document : identifiant de test et clé React. */
export type CleDocument = 'bon-pharmacie' | 'bon-optique' | 'lettre-garantie' | 'hospitalisation'

/**
 * Destination des documents qui se demandent par un assistant (bon de
 * pharmacie, lettre de garantie) : pas d'écran à eux, un modal
 * (`useNouveauBon().ouvrirAssistant(cle)`). Valeur à part plutôt qu'un
 * chemin, pour que l'accueil ne pousse jamais cette « route ».
 */
export const ROUTE_ASSISTANT = 'assistant'

/** Un type de document demandable : une grande carte de service (§3.4). */
export interface TypeDocument {
  cle: CleDocument
  /** Libellé de la carte : court, deux lignes au plus. */
  libelle: string
  /** Phrase d'explication (feuille « Bientôt », accessibilité). */
  description: string
  /** Icône ionicons (la chaîne importée, pas son nom). */
  icone: string
  /**
   * Chemin à ouvrir, `ROUTE_ASSISTANT` pour le modal, ou `null` tant que le
   * document n'est pas disponible.
   */
  route: string | null
  disponible: boolean
}

/** Un écran utilitaire : un simple cercle sous la grille (§3.4, 2e famille). */
/** Message unique des documents à venir : même phrase partout. */
export const MESSAGE_BIENTOT =
  "Bientôt disponible. Ce document se demande pour l'instant auprès de l'IPM."

/** Mention portée sous le libellé d'une carte de service (§3.4). */
export const MENTION_DISPONIBLE = 'Disponible'
export const MENTION_BIENTOT = 'Bientôt'

/**
 * Les quatre documents, dans l'ordre de la grille (§4.3). Ajouter un type =
 * ajouter une entrée ici ; la grille s'adapte toute seule.
 */
export const DOCUMENTS: readonly TypeDocument[] = [
  {
    cle: 'bon-pharmacie',
    libelle: 'Bon de pharmacie',
    description: 'Générer un bon à présenter en pharmacie avec votre ordonnance.',
    icone: medkitOutline,
    route: ROUTE_ASSISTANT,
    disponible: true,
  },
  {
    cle: 'bon-optique',
    libelle: "Bon d'optique",
    description: "Bon à présenter chez l'opticien conventionné.",
    icone: eyeOutline,
    route: null,
    disponible: false,
  },
  {
    cle: 'lettre-garantie',
    libelle: 'Lettre de garantie',
    description: "Prise en charge auprès d'un fournisseur de soins conventionné.",
    icone: shieldCheckmarkOutline,
    route: ROUTE_ASSISTANT,
    disponible: true,
  },
  {
    cle: 'hospitalisation',
    libelle: 'LG hospitalisation',
    description: 'Lettre de garantie pour une hospitalisation.',
    icone: bedOutline,
    route: null,
    disponible: false,
  },
]

/** Un type de document par sa clé (`undefined` si la clé est inconnue). */
export function documentParCle(cle: string): TypeDocument | undefined {
  return DOCUMENTS.find((d) => d.cle === cle)
}

/** Les documents ouverts aujourd'hui, dans l'ordre de la grille. */
export function documentsDisponibles(): TypeDocument[] {
  return DOCUMENTS.filter((d) => d.disponible)
}

/** Vrai si la carte doit ouvrir l'assistant « Nouveau bon » plutôt qu'une route. */
export function ouvreAssistant(document: TypeDocument): boolean {
  return document.route === ROUTE_ASSISTANT
}
