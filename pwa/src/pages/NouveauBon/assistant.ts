/**
 * Logique de l'assistant « Nouveau bon de pharmacie », sans React : l'état
 * de la saisie, le passage d'une étape à l'autre et la lecture des erreurs
 * du serveur. Tout ce qui se décide ici se teste sans rendre un seul écran.
 *
 * Les cinq étapes (SPEC §3, écran 4) :
 *   1. bénéficiaire ; 2. prescripteur (spécialité, puis prescripteur) ;
 *   3. pharmacie ; 4. ordonnance (date + nombre d'articles) ; 5. récapitulatif.
 */

import type {
  Beneficiaire,
  ChampNouveauBon,
  DateISO,
  ErreursChamps,
  Fournisseur,
  NouveauBonCorps,
  Specialite,
} from '../../types/api'
import { ajouterJours, aujourdhuiISO } from '../../utils/format'
import { libelleLien } from '../../utils/libelles'

export type Etape = 1 | 2 | 3 | 4 | 5
export const NB_ETAPES = 5

/** L'étape 2 se fait en deux temps : la spécialité, puis le prescripteur. */
export type SousEtapePrescripteur = 'specialite' | 'prescripteur'

/** Nombre d'articles : le bon imprimé n'a que 8 lignes (règle du serveur). */
export const ARTICLES_MIN = 1
export const ARTICLES_MAX = 8
/** L'ordonnance ne doit pas avoir plus de 30 jours (J-30 inclus, règle du serveur). */
export const ANCIENNETE_MAX_JOURS = 30
/** Durée de validité d'un bon, pour l'annoncer au récapitulatif. */
export const VALIDITE_BON_JOURS = 30

/** Nom court de chaque étape (sous-titre de l'en-tête, lecteurs d'écran). */
export const NOMS_ETAPES: Record<Etape, string> = {
  1: 'Bénéficiaire',
  2: 'Prescripteur',
  3: 'Pharmacie',
  4: 'Ordonnance',
  5: 'Récapitulatif',
}

export interface Saisie {
  beneficiaire: Beneficiaire | null
  specialite: Specialite | null
  prescripteur: Fournisseur | null
  pharmacie: Fournisseur | null
  dateOrdonnance: DateISO
  nbArticles: number
}

/** Un message par champ fautif (le premier renvoyé par le serveur). */
export type ErreursSaisie = Partial<Record<ChampNouveauBon, string>>

export interface EtatAssistant {
  etape: Etape
  sousEtape: SousEtapePrescripteur
  /** Sens du dernier déplacement, pour l'animation de glissement. */
  sens: 'avant' | 'arriere'
  saisie: Saisie
  erreurs: ErreursSaisie
  /**
   * true quand on est venu corriger une étape depuis le récapitulatif (bouton
   * « Modifier » ou erreur du serveur) : le choix suivant y ramène
   * directement, au lieu de refaire tout le parcours.
   */
  retourRecap: boolean
}

export type Action =
  | { type: 'beneficiaire'; beneficiaire: Beneficiaire }
  | { type: 'specialite'; specialite: Specialite }
  | { type: 'prescripteur'; prescripteur: Fournisseur }
  | { type: 'pharmacie'; pharmacie: Fournisseur }
  | { type: 'date'; date: DateISO }
  | { type: 'articles'; nombre: number }
  /** « Continuer » de l'étape 4. */
  | { type: 'continuer'; aujourdhui?: DateISO }
  | { type: 'precedent' }
  /** « Modifier » depuis le récapitulatif. */
  | { type: 'modifier'; etape: Etape }
  | { type: 'erreurs-serveur'; champs: ErreursChamps }

/** Étape où se corrige chaque champ du corps envoyé au serveur. */
export const ETAPE_DU_CHAMP: Record<ChampNouveauBon, Etape> = {
  beneficiaire: 1,
  specialite: 2,
  prescripteur: 2,
  pharmacie: 3,
  dateOrdonnance: 4,
  nbArticles: 4,
  non_field_errors: 5,
}

function estChamp(nom: string): nom is ChampNouveauBon {
  return nom in ETAPE_DU_CHAMP
}

export function etatInitial(aujourdhui: DateISO = aujourdhuiISO()): EtatAssistant {
  return {
    etape: 1,
    sousEtape: 'specialite',
    sens: 'avant',
    saisie: {
      beneficiaire: null,
      specialite: null,
      prescripteur: null,
      pharmacie: null,
      // Le plus souvent, on demande le bon le jour même de la consultation.
      dateOrdonnance: aujourdhui,
      nbArticles: 1,
    },
    erreurs: {},
    retourRecap: false,
  }
}

/** Bornes de la date d'ordonnance : de J-30 à aujourd'hui, inclus. */
export function bornesDate(aujourdhui: DateISO = aujourdhuiISO()): { min: DateISO; max: DateISO } {
  return { min: ajouterJours(aujourdhui, -ANCIENNETE_MAX_JOURS), max: aujourdhui }
}

/** Même contrôle que le serveur, pour ne pas envoyer une date qu'il refusera. */
export function erreurDate(
  date: DateISO,
  aujourdhui: DateISO = aujourdhuiISO(),
): string | undefined {
  const { min, max } = bornesDate(aujourdhui)
  // Comparaison de chaînes « AAAA-MM-JJ » : l'ordre alphabétique est l'ordre chronologique.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choisissez la date de l’ordonnance.'
  if (date > max) return 'La date de l’ordonnance ne peut pas être dans le futur.'
  if (date < min) return `L’ordonnance a plus de ${ANCIENNETE_MAX_JOURS} jours.`
  return undefined
}

export function borneArticles(nombre: number): number {
  if (!Number.isFinite(nombre)) return ARTICLES_MIN
  return Math.min(ARTICLES_MAX, Math.max(ARTICLES_MIN, Math.round(nombre)))
}

/** Toutes les réponses sont là : le récapitulatif peut s'afficher. */
export function saisieComplete(saisie: Saisie): boolean {
  return Boolean(
    saisie.beneficiaire && saisie.specialite && saisie.prescripteur && saisie.pharmacie,
  )
}

/** Corps de POST /api/mobile/bons-pharmacie/, ou null si la saisie est incomplète. */
export function corpsDepuisSaisie(saisie: Saisie): NouveauBonCorps | null {
  const { beneficiaire, specialite, prescripteur, pharmacie } = saisie
  if (!beneficiaire || !specialite || !prescripteur || !pharmacie) return null
  return {
    beneficiaire: beneficiaire.matricule,
    pharmacie: pharmacie.code,
    specialite: specialite.code,
    prescripteur: prescripteur.code,
    nbArticles: borneArticles(saisie.nbArticles),
    dateOrdonnance: saisie.dateOrdonnance,
  }
}

function sansErreurs(erreurs: ErreursSaisie, ...champs: ChampNouveauBon[]): ErreursSaisie {
  const suivantes = { ...erreurs }
  for (const champ of champs) delete suivantes[champ]
  // Une erreur générale du serveur ne vaut plus une fois la saisie changée.
  delete suivantes.non_field_errors
  return suivantes
}

/** Après un choix : le récapitulatif si l'on venait le corriger, sinon l'étape suivante. */
function apresChoix(etat: EtatAssistant, saisie: Saisie, erreurs: ErreursSaisie): EtatAssistant {
  const reste = premiereEtapeEnErreur(erreurs)
  let etape: Etape
  if (etat.retourRecap && reste !== null && reste !== etat.etape) {
    // Le serveur avait refusé plusieurs champs : on enchaîne sur le suivant à corriger.
    etape = reste
  } else if (etat.retourRecap && reste === null && saisieComplete(saisie)) {
    etape = 5
  } else {
    etape = Math.min(etat.etape + 1, NB_ETAPES) as Etape
  }
  return {
    ...etat,
    etape,
    sens: 'avant',
    saisie,
    erreurs,
    retourRecap: etape === 5 ? false : etat.retourRecap,
  }
}

/** Première étape (dans l'ordre du parcours) qui porte encore une erreur de champ. */
export function premiereEtapeEnErreur(erreurs: ErreursSaisie): Etape | null {
  let premiere: Etape | null = null
  for (const champ of Object.keys(erreurs)) {
    if (!estChamp(champ) || champ === 'non_field_errors') continue
    const etape = ETAPE_DU_CHAMP[champ]
    if (premiere === null || etape < premiere) premiere = etape
  }
  return premiere
}

/**
 * Erreurs 400 du serveur → un message par champ connu. Un champ que
 * l'assistant ne connaît pas devient une erreur générale, montrée au
 * récapitulatif (on ne perd jamais un message du serveur).
 */
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

export function reducteur(etat: EtatAssistant, action: Action): EtatAssistant {
  const { saisie } = etat
  switch (action.type) {
    case 'beneficiaire':
      return apresChoix(
        etat,
        { ...saisie, beneficiaire: action.beneficiaire },
        sansErreurs(etat.erreurs, 'beneficiaire'),
      )

    case 'specialite': {
      // Autre spécialité : le prescripteur choisi n'en fait plus partie.
      const autre = saisie.specialite?.code !== action.specialite.code
      return {
        ...etat,
        sousEtape: 'prescripteur',
        sens: 'avant',
        saisie: {
          ...saisie,
          specialite: action.specialite,
          prescripteur: autre ? null : saisie.prescripteur,
        },
        erreurs: autre
          ? sansErreurs(etat.erreurs, 'specialite', 'prescripteur')
          : sansErreurs(etat.erreurs, 'specialite'),
      }
    }

    case 'prescripteur':
      return apresChoix(
        etat,
        { ...saisie, prescripteur: action.prescripteur },
        sansErreurs(etat.erreurs, 'prescripteur', 'specialite'),
      )

    case 'pharmacie':
      return apresChoix(
        etat,
        { ...saisie, pharmacie: action.pharmacie },
        sansErreurs(etat.erreurs, 'pharmacie'),
      )

    case 'date':
      return {
        ...etat,
        saisie: { ...saisie, dateOrdonnance: action.date },
        erreurs: sansErreurs(etat.erreurs, 'dateOrdonnance'),
      }

    case 'articles':
      return {
        ...etat,
        saisie: { ...saisie, nbArticles: borneArticles(action.nombre) },
        erreurs: sansErreurs(etat.erreurs, 'nbArticles'),
      }

    case 'continuer': {
      if (etat.etape !== 4) return etat
      const message = erreurDate(saisie.dateOrdonnance, action.aujourdhui)
      if (message) return { ...etat, erreurs: { ...etat.erreurs, dateOrdonnance: message } }
      // « Continuer » vaut confirmation : les remarques du serveur sur cette étape sont traitées.
      return apresChoix(etat, saisie, sansErreurs(etat.erreurs, 'dateOrdonnance', 'nbArticles'))
    }

    case 'precedent': {
      if (etat.etape === 2 && etat.sousEtape === 'prescripteur') {
        return { ...etat, sousEtape: 'specialite', sens: 'arriere' }
      }
      if (etat.etape === 1) return etat
      const etape = (etat.etape - 1) as Etape
      return {
        ...etat,
        etape,
        // En revenant à l'étape 2, on retrouve la liste où l'on avait choisi.
        sousEtape: etape === 2 && saisie.specialite ? 'prescripteur' : 'specialite',
        sens: 'arriere',
      }
    }

    case 'modifier':
      if (action.etape === 5) return etat
      return {
        ...etat,
        etape: action.etape,
        // Changer de prescripteur commence souvent par changer de spécialité.
        sousEtape: 'specialite',
        sens: 'arriere',
        retourRecap: true,
      }

    case 'erreurs-serveur': {
      const erreurs = lireErreursServeur(action.champs)
      const etape = premiereEtapeEnErreur(erreurs)
      if (etape === null) return { ...etat, erreurs, sens: 'avant' }
      return {
        ...etat,
        etape,
        // Spécialité refusée : on la rechoisit ; prescripteur refusé : on reste dans sa liste.
        sousEtape: erreurs.specialite || !saisie.specialite ? 'specialite' : 'prescripteur',
        sens: 'arriere',
        erreurs,
        retourRecap: true,
      }
    }
  }
}

/**
 * Libellé du lien avec le participant : « Vous-même », « Conjointe »,
 * « Enfant » — le même que l'accueil et le profil (utils/libelles), sauf pour
 * le participant, à qui l'assistant s'adresse.
 */
export function lienBeneficiaire(beneficiaire: Beneficiaire): string {
  if (beneficiaire.estParticipant) return 'Vous-même'
  return libelleLien(beneficiaire)
}

/** Minuscules, sans accents ni ponctuation superflue : « Médecine » trouve « MEDECINE ». */
export function normaliser(texte: string | null | undefined): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Chaque mot tapé doit se retrouver dans l'un des textes (dans n'importe quel
 * ordre) : « plateau pharm » trouve « PHARMACIE DU PLATEAU ».
 */
export function correspond(recherche: string, ...textes: (string | null | undefined)[]): boolean {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  if (mots.length === 0) return true
  const cible = normaliser(textes.filter(Boolean).join(' '))
  return mots.every((mot) => cible.includes(mot))
}

export interface Groupe<T> {
  /** « A », « B »… ou « # » pour ce qui ne commence pas par une lettre. */
  lettre: string
  elements: T[]
}

/**
 * Regroupe une liste sous des intercalaires alphabétiques, comme Contacts :
 * lettres dans l'ordre, « # » à la fin, ordre d'origine gardé dans chaque groupe.
 */
export function grouperParLettre<T>(elements: T[], libelle: (element: T) => string): Groupe<T>[] {
  const parLettre = new Map<string, T[]>()
  for (const element of elements) {
    const initiale = normaliser(libelle(element)).charAt(0).toUpperCase()
    const lettre = /^[A-Z]$/.test(initiale) ? initiale : '#'
    const groupe = parLettre.get(lettre)
    if (groupe) groupe.push(element)
    else parLettre.set(lettre, [element])
  }
  return [...parLettre.entries()]
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([lettre, groupe]) => ({ lettre, elements: groupe }))
}
