/**
 * Statut d'un bon → libellé, couleur, icône. Une seule source pour la puce
 * de statut (StatutBadge), les filtres de « Mes bons » et le détail.
 *
 * Couleurs de la SPEC : valide vert, expiré gris, annulé rouge, traité bleu.
 * Ce sont des couleurs Ionic (theme/variables.css) : « secondary » est le
 * bleu de l'application, « primary » restant le rouge SAR des actions.
 */

import {
  alertCircle,
  checkmarkCircle,
  checkmarkDoneCircle,
  closeCircle,
  timeOutline,
} from 'ionicons/icons'

import type { GenreDocument, StatutBon } from '../types/api'
import { ecartJours, aujourdhuiISO } from './format'

export type CouleurIonic = 'success' | 'medium' | 'danger' | 'secondary' | 'warning' | 'primary'

export interface InfoStatut {
  libelle: string
  /** Pluriel, pour les filtres (« Valides »). */
  libellePluriel: string
  couleur: CouleurIonic
  icone: string
  /** Phrase d'explication pour le détail. */
  explication: string
}

export const STATUTS: Record<StatutBon, InfoStatut> = {
  valide: {
    libelle: 'Valide',
    libellePluriel: 'Valides',
    couleur: 'success',
    icone: checkmarkCircle,
    explication: 'À présenter en pharmacie avec votre ordonnance.',
  },
  traite: {
    libelle: 'Traité',
    libellePluriel: 'Traités',
    couleur: 'secondary',
    icone: checkmarkDoneCircle,
    explication: 'La pharmacie a délivré les médicaments de ce bon.',
  },
  expire: {
    libelle: 'Expiré',
    libellePluriel: 'Expirés',
    couleur: 'medium',
    icone: timeOutline,
    explication: "Ce bon n'est plus valable : demandez-en un nouveau si nécessaire.",
  },
  annule: {
    libelle: 'Annulé',
    libellePluriel: 'Annulés',
    couleur: 'danger',
    icone: closeCircle,
    explication: "Ce bon a été annulé par l'IPM.",
  },
}

/** Ordre d'affichage des filtres. */
export const ORDRE_STATUTS: StatutBon[] = ['valide', 'traite', 'expire', 'annule']

export function infoStatut(statut: StatutBon): InfoStatut {
  return STATUTS[statut] ?? { ...STATUTS.expire, libelle: statut, icone: alertCircle }
}

/** L'explication du détail pour une lettre de garantie : un prestataire, pas une pharmacie. */
const EXPLICATIONS_LETTRE: Record<StatutBon, string> = {
  valide: 'À présenter au prestataire avec votre prescription.',
  traite: 'Les soins couverts par cette lettre ont été pris en charge.',
  expire: "Cette lettre n'est plus valable : demandez-en une nouvelle si nécessaire.",
  annule: "Cette lettre a été annulée par l'IPM.",
}

/** Phrase d'explication du détail, selon le genre du document. */
export function explicationStatut(statut: StatutBon, genre: GenreDocument): string {
  if (genre === 'lettre-garantie')
    return EXPLICATIONS_LETTRE[statut] ?? infoStatut(statut).explication
  return infoStatut(statut).explication
}

/**
 * Jours restants avant expiration d'un bon valide (0 = dernier jour),
 * null si le bon n'est plus valide.
 */
export function joursRestants(
  statut: StatutBon,
  valableJusquAu: string,
  maintenant = new Date(),
): number | null {
  if (statut !== 'valide') return null
  const jours = ecartJours(aujourdhuiISO(maintenant), valableJusquAu)
  return jours >= 0 ? jours : null
}

/** « Valable jusqu'au 18 oct. » version courte : « Expire aujourd'hui », « Encore 3 jours ». */
export function libelleValidite(
  statut: StatutBon,
  valableJusquAu: string,
  maintenant = new Date(),
): string {
  const jours = joursRestants(statut, valableJusquAu, maintenant)
  if (jours === null) return ''
  if (jours === 0) return "Expire aujourd'hui"
  if (jours === 1) return 'Expire demain'
  return `Encore ${jours} jours`
}
