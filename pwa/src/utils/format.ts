/**
 * Formatage à la française des données de l'API.
 *
 * Les dates de l'API sont des chaînes « AAAA-MM-JJ » sans heure : on les lit
 * en date LOCALE (et non via new Date('AAAA-MM-JJ'), qui les prend pour du
 * minuit UTC et peut afficher la veille selon le fuseau).
 */

import type { DateISO } from '../types/api'

const LOCALE = 'fr-FR'

/** « AAAA-MM-JJ » (ou date-heure ISO) → Date locale ; null si illisible. */
export function lireDate(valeur: string | null | undefined): Date | null {
  if (!valeur) return null
  const jour = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur)
  if (jour) {
    const [, a, m, j] = jour
    return new Date(Number(a), Number(m) - 1, Number(j))
  }
  const date = new Date(valeur)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date locale → « AAAA-MM-JJ » (corps des requêtes). */
export function versDateISO(date: Date): DateISO {
  const a = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const j = String(date.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/** Aujourd'hui, en « AAAA-MM-JJ » local. */
export function aujourdhuiISO(maintenant = new Date()): DateISO {
  return versDateISO(maintenant)
}

/** Décale une date « AAAA-MM-JJ » de `jours` (négatif pour reculer). */
export function ajouterJours(valeur: DateISO, jours: number): DateISO {
  const date = lireDate(valeur)
  if (!date) return valeur
  date.setDate(date.getDate() + jours)
  return versDateISO(date)
}

/** Nombre de jours de `de` à `a` (dates « AAAA-MM-JJ »), négatif si `a` est avant. */
export function ecartJours(de: DateISO, a: DateISO): number {
  const d1 = lireDate(de)
  const d2 = lireDate(a)
  if (!d1 || !d2) return 0
  // Arrondi : le passage à l'heure d'été ne concerne pas Dakar, mais
  // l'appareil peut être réglé ailleurs.
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000)
}

const fmtCourt = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const fmtMoyen = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const fmtLong = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const fmtHeure = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

/** « 18/09/2026 » */
export function dateCourte(valeur: string | null | undefined): string {
  const date = lireDate(valeur)
  return date ? fmtCourt.format(date) : ''
}

/** « 18 sept. 2026 » */
export function dateMoyenne(valeur: string | null | undefined): string {
  const date = lireDate(valeur)
  return date ? fmtMoyen.format(date) : ''
}

/** « vendredi 18 septembre 2026 » */
export function dateLongue(valeur: string | null | undefined): string {
  const date = lireDate(valeur)
  return date ? fmtLong.format(date) : ''
}

/** « Aujourd'hui », « Hier », « Demain », sinon « 18 sept. 2026 ». */
export function dateRelative(valeur: string | null | undefined, maintenant = new Date()): string {
  const date = lireDate(valeur)
  if (!date) return ''
  const ecart = ecartJours(aujourdhuiISO(maintenant), versDateISO(date))
  if (ecart === 0) return "Aujourd'hui"
  if (ecart === -1) return 'Hier'
  if (ecart === 1) return 'Demain'
  return fmtMoyen.format(date)
}

/** Date-heure ISO → « Aujourd'hui à 11:21 », « 18 sept. 2026 à 11:21 ». */
export function dateHeure(valeur: string | null | undefined, maintenant = new Date()): string {
  const date = lireDate(valeur)
  if (!date) return ''
  return `${dateRelative(versDateISO(date), maintenant)} à ${fmtHeure.format(date)}`
}

/** Âge révolu (l'API ne donne que des années) : « 62 ans », « 1 an » ; '' si inconnu. */
export function age(annees: number | null | undefined): string {
  if (annees === null || annees === undefined) return ''
  if (annees < 1) return "Moins d'un an"
  return `${annees} an${annees > 1 ? 's' : ''}`
}

/** Premier prénom, pour saluer : « Moustapha Abdou » → « Moustapha ». */
export function premierPrenom(prenoms: string | null | undefined): string {
  const premier = (prenoms ?? '').trim().split(/\s+/)[0] ?? ''
  return capitaliser(premier)
}

/**
 * « MOUSTAPHA » → « Moustapha » ; « JEAN-PIERRE » → « Jean-Pierre ».
 *
 * Le point compte aussi comme séparateur : les raisons sociales d'IPM en
 * portent sans espace derrière (« DR.FARID GHOZAYEL », « CONSULTATION O.R.L »),
 * qui deviendraient « Dr.farid » et « O.r.l » sans cela.
 */
export function capitaliser(texte: string): string {
  return texte
    .toLocaleLowerCase(LOCALE)
    .replace(
      /(^|[\s'’.-])(\p{L})/gu,
      (_, sep: string, lettre: string) => sep + lettre.toLocaleUpperCase(LOCALE),
    )
}

/** Initiales pour l'avatar : « Moustapha DIOP » → « MD » (deux lettres au plus). */
export function initiales(nomComplet: string | null | undefined): string {
  const mots = (nomComplet ?? '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  const premiere = mots[0]?.[0] ?? ''
  const derniere = mots.length > 1 ? (mots[mots.length - 1]?.[0] ?? '') : ''
  return (premiere + derniere).toLocaleUpperCase(LOCALE)
}

/** « 1 article », « 3 articles » ; générique : pluriel(n, 'bon'). */
/**
 * Matricule sans le code de la société devant : « 01-0949-31 » → « 0949-31 ».
 * L'employé ne connaît que son propre numéro ; le préfixe ne sert qu'aux
 * documents imprimés. Un matricule seul (« 0949 ») est rendu tel quel.
 */
export function matriculeSansSociete(matricule: string): string {
  const parties = matricule.split('-')
  return parties.length === 3 ? parties.slice(1).join('-') : matricule
}

export function pluriel(n: number, mot: string, motPluriel = `${mot}s`): string {
  return `${n} ${n > 1 ? motPluriel : mot}`
}

/** Téléphone sénégalais lisible : « 338490000 » → « 33 849 00 00 » ; sinon inchangé. */
export function telephone(valeur: string | null | undefined): string {
  if (!valeur) return ''
  const chiffres = valeur.replace(/\D/g, '')
  const local = chiffres.startsWith('221') && chiffres.length === 12 ? chiffres.slice(3) : chiffres
  if (local.length === 9) {
    const groupes = `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`
    return local === chiffres ? groupes : `+221 ${groupes}`
  }
  return valeur
}
