/**
 * Logique du formulaire « Nouveau bon d'optique », sans React : l'état de la
 * saisie, ce qui en part vers le serveur et la lecture de ses refus. Même
 * conduite que la lettre de garantie (pages/NouvelleLettre/assistant.ts),
 * dont elle reprend les règles de date : la prescription ne doit être ni
 * dans le futur, ni vieille de plus de 30 jours.
 */

import type {
  Beneficiaire,
  Bon,
  ChampNouveauBonOptique,
  CodeLibelle,
  DateISO,
  ErreursChamps,
  Fournisseur,
  NouveauBonOptiqueCorps,
  Specialite,
} from '../../types/api'
import { genreDe } from '../../utils/documents'
import { aujourdhuiISO } from '../../utils/format'

export { bornesDate, erreurDate } from '../NouvelleLettre/assistant'

/** Durée de validité d'un bon d'optique, la même que celle d'un bon de pharmacie. */
export const VALIDITE_BON_OPTIQUE_JOURS = 30

export interface Saisie {
  beneficiaire: Beneficiaire | null
  /** L'opticien conventionné où présenter le bon. */
  opticien: Fournisseur | null
  specialite: Specialite | null
  prescripteur: Fournisseur | null
  /** Les articles cochés (montures, verres…), dans l'ordre de la nomenclature. */
  articles: CodeLibelle[]
  datePrescription: DateISO
}

export type ErreursSaisie = Partial<Record<ChampNouveauBonOptique, string>>

const CHAMPS: readonly ChampNouveauBonOptique[] = [
  'beneficiaire',
  'opticien',
  'specialite',
  'prescripteur',
  'articles',
  'datePrescription',
  'non_field_errors',
]

function estChamp(nom: string): nom is ChampNouveauBonOptique {
  return (CHAMPS as readonly string[]).includes(nom)
}

export function etatInitial(aujourdhui: DateISO = aujourdhuiISO()): Saisie {
  return {
    beneficiaire: null,
    opticien: null,
    specialite: null,
    prescripteur: null,
    articles: [],
    datePrescription: aujourdhui,
  }
}

/**
 * De quoi enregistrer le bon. SEUL le bénéficiaire est exigé : c'est la
 * règle de l'écran IPM pour le même document (société, participant et type
 * de bénéficiaire sont les seuls champs à astérisque). L'opticien, le
 * prescripteur, les articles et la prescription se renseignent plus tard.
 */
export function saisieComplete(saisie: Saisie): boolean {
  return Boolean(saisie.beneficiaire)
}

/** Coche ou décoche un article ; l'ordre de la nomenclature est conservé par l'appelant. */
export function basculerArticle(articles: CodeLibelle[], article: CodeLibelle): CodeLibelle[] {
  return articles.some((a) => a.code === article.code)
    ? articles.filter((a) => a.code !== article.code)
    : [...articles, article]
}

/** Corps de POST /api/mobile/bons-optique/, ou null faute de bénéficiaire. */
export function corpsDepuisSaisie(saisie: Saisie): NouveauBonOptiqueCorps | null {
  const { beneficiaire, opticien, specialite, prescripteur, articles } = saisie
  if (!beneficiaire) return null
  // Ce qui n'a pas été renseigné n'est pas envoyé : le serveur laisse le champ
  // vide, et le gestionnaire le complétera au traitement.
  return {
    beneficiaire: beneficiaire.matricule,
    ...(opticien ? { opticien: opticien.code } : {}),
    ...(specialite ? { specialite: specialite.code } : {}),
    ...(prescripteur ? { prescripteur: prescripteur.code } : {}),
    ...(articles.length ? { articles: articles.map((a) => ({ code: a.code, quantite: 1 })) } : {}),
    ...(saisie.datePrescription ? { datePrescription: saisie.datePrescription } : {}),
  }
}

export function lireErreursServeur(champs: ErreursChamps): ErreursSaisie {
  const erreurs: ErreursSaisie = {}
  const generales: string[] = []
  for (const [nom, messages] of Object.entries(champs)) {
    const premier = messages.find((m) => m.trim())
    if (!premier) continue
    if (estChamp(nom) && nom !== 'non_field_errors') erreurs[nom] = premier
    else generales.push(premier)
  }
  if (generales.length) erreurs.non_field_errors = generales.join(' ')
  return erreurs
}

/** Le même jour deux ans plus tard (« 2024-02-29 » → « 2026-03-01 »). */
export function deuxAnsApres(jour: DateISO): DateISO {
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number)
  const date = new Date(a + 2, m - 1, j)
  if (date.getMonth() !== m - 1) return `${a + 2}-03-01`
  return `${a + 2}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`
}

/**
 * Les lunettes se renouvellent tous les deux ans, par bénéficiaire. Si le
 * bénéficiaire choisi a déjà eu un bon d'optique dans les deux ans, le
 * nouveau partira en attente de l'IPM : on le dit avant l'envoi. Le serveur
 * fait foi (il connaît aussi les bons émis à l'IPM) ; ceci n'est qu'un aperçu.
 */
export function avertissementRenouvellement(
  bons: Bon[],
  saisie: Saisie,
  aujourdhui: DateISO,
): string | null {
  const matricule = saisie.beneficiaire?.matricule
  if (!matricule) return null
  const precedent = bons
    .filter(
      (b) =>
        genreDe(b) === 'bon-optique' &&
        b.statut !== 'annule' &&
        b.beneficiaire?.matricule === matricule &&
        deuxAnsApres(b.date) > aujourdhui,
    )
    .sort((x, y) => (x.date < y.date ? 1 : -1))[0]
  if (!precedent) return null
  const [a, m, j] = deuxAnsApres(precedent.date).split('-')
  return (
    `Un bon d’optique a déjà été émis pour ce bénéficiaire (${precedent.code}). ` +
    `Le droit se renouvelle le ${j}/${m}/${a} : ce nouveau bon sera soumis à la validation de l’IPM.`
  )
}
