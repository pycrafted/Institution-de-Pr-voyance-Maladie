/**
 * Logique de l'assistant « Nouvelle lettre de garantie », sans React : l'état
 * de la saisie, le passage d'une étape à l'autre et la lecture des erreurs
 * du serveur. Même conduite que l'assistant du bon de pharmacie
 * (pages/NouveauBon/assistant.ts), sur six étapes :
 *
 *   1. bénéficiaire ; 2. prestataire (spécialité, puis structure) ;
 *   3. nature de la prestation ; 4. prescripteur (spécialité, puis
 *   prescripteur) ; 5. date de la prescription ; 6. récapitulatif.
 */

import type {
  Beneficiaire,
  ChampNouvelleLettre,
  CodeLibelle,
  DateISO,
  ErreursChamps,
  Fournisseur,
  NouvelleLettreCorps,
  Specialite,
} from '../../types/api'
import { ajouterJours, aujourdhuiISO } from '../../utils/format'

export type Etape = 1 | 2 | 3 | 4 | 5 | 6
export const NB_ETAPES = 6

/** Les étapes 2 et 4 se font en deux temps : la spécialité, puis la structure. */
export type SousEtape = 'specialite' | 'fournisseur'

/** La prescription ne doit pas avoir plus de 30 jours (J-30 inclus, règle du serveur). */
export const ANCIENNETE_MAX_JOURS = 30
/** Durée de validité d'une lettre, pour l'annoncer au récapitulatif. */
export const VALIDITE_LETTRE_JOURS = 30

export const NOMS_ETAPES: Record<Etape, string> = {
  1: 'Bénéficiaire',
  2: 'Prestataire',
  3: 'Prestation',
  4: 'Prescripteur',
  5: 'Prescription',
  6: 'Récapitulatif',
}

export interface Saisie {
  beneficiaire: Beneficiaire | null
  specialitePrestataire: Specialite | null
  prestataire: Fournisseur | null
  nature: CodeLibelle | null
  specialite: Specialite | null
  prescripteur: Fournisseur | null
  datePrescription: DateISO
  /** Nombre d'actes prescrits ; 0 tant qu'il n'est pas renseigné. */
  nbArticles: number
}

export type ErreursSaisie = Partial<Record<ChampNouvelleLettre, string>>

export interface EtatAssistant {
  etape: Etape
  sousEtape: SousEtape
  sens: 'avant' | 'arriere'
  saisie: Saisie
  erreurs: ErreursSaisie
  /** Venu corriger une étape depuis le récapitulatif : le choix suivant y ramène. */
  retourRecap: boolean
}

export type Action =
  | { type: 'beneficiaire'; beneficiaire: Beneficiaire }
  | { type: 'specialitePrestataire'; specialite: Specialite }
  | { type: 'prestataire'; prestataire: Fournisseur }
  | { type: 'nature'; nature: CodeLibelle }
  | { type: 'specialite'; specialite: Specialite }
  | { type: 'prescripteur'; prescripteur: Fournisseur }
  | { type: 'date'; date: DateISO }
  /** « Continuer » de l'étape 5. */
  | { type: 'continuer'; aujourdhui?: DateISO }
  | { type: 'precedent' }
  | { type: 'modifier'; etape: Etape }
  | { type: 'erreurs-serveur'; champs: ErreursChamps }

export const ETAPE_DU_CHAMP: Record<ChampNouvelleLettre, Etape> = {
  beneficiaire: 1,
  specialitePrestataire: 2,
  prestataire: 2,
  naturePrestation: 3,
  specialite: 4,
  prescripteur: 4,
  nbArticles: 5,
  datePrescription: 5,
  non_field_errors: 6,
}

function estChamp(nom: string): nom is ChampNouvelleLettre {
  return nom in ETAPE_DU_CHAMP
}

/** Les étapes en deux temps. */
function aDeuxTemps(etape: Etape): boolean {
  return etape === 2 || etape === 4
}

export function etatInitial(aujourdhui: DateISO = aujourdhuiISO()): EtatAssistant {
  return {
    etape: 1,
    sousEtape: 'specialite',
    sens: 'avant',
    saisie: {
      beneficiaire: null,
      specialitePrestataire: null,
      prestataire: null,
      nature: null,
      specialite: null,
      prescripteur: null,
      datePrescription: aujourdhui,
      nbArticles: 1,
    },
    erreurs: {},
    retourRecap: false,
  }
}

export function bornesDate(aujourdhui: DateISO = aujourdhuiISO()): { min: DateISO; max: DateISO } {
  return { min: ajouterJours(aujourdhui, -ANCIENNETE_MAX_JOURS), max: aujourdhui }
}

/** Même contrôle que le serveur, pour ne pas envoyer une date qu'il refusera. */
export function erreurDate(
  date: DateISO,
  aujourdhui: DateISO = aujourdhuiISO(),
): string | undefined {
  const { min, max } = bornesDate(aujourdhui)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choisissez la date de la prescription.'
  if (date > max) return 'La date de prescription ne peut pas être dans le futur.'
  if (date < min) return `La prescription a plus de ${ANCIENNETE_MAX_JOURS} jours.`
  return undefined
}

/**
 * De quoi enregistrer la lettre. SEUL le bénéficiaire est exigé : c'est la
 * règle de l'écran IPM pour le même document (société, participant et type
 * de bénéficiaire sont les seuls champs à astérisque). Le prestataire, la
 * nature, le prescripteur et la prescription se renseignent plus tard.
 */
export function saisieComplete(saisie: Saisie): boolean {
  return Boolean(saisie.beneficiaire)
}

/** Corps de POST /api/mobile/lettres-garantie/, ou null faute de bénéficiaire. */
export function corpsDepuisSaisie(saisie: Saisie): NouvelleLettreCorps | null {
  const { beneficiaire, specialitePrestataire, prestataire, nature, specialite, prescripteur } =
    saisie
  if (!beneficiaire) return null
  // Ce qui n'a pas été renseigné n'est pas envoyé : le serveur laisse le champ
  // vide, et le gestionnaire le complétera au traitement.
  return {
    beneficiaire: beneficiaire.matricule,
    ...(specialitePrestataire ? { specialitePrestataire: specialitePrestataire.code } : {}),
    ...(prestataire ? { prestataire: prestataire.code } : {}),
    ...(nature ? { naturePrestation: nature.code } : {}),
    ...(specialite ? { specialite: specialite.code } : {}),
    ...(prescripteur ? { prescripteur: prescripteur.code } : {}),
    ...(saisie.nbArticles ? { nbArticles: saisie.nbArticles } : {}),
    ...(saisie.datePrescription ? { datePrescription: saisie.datePrescription } : {}),
  }
}

function sansErreurs(erreurs: ErreursSaisie, ...champs: ChampNouvelleLettre[]): ErreursSaisie {
  const suivantes = { ...erreurs }
  for (const champ of champs) delete suivantes[champ]
  delete suivantes.non_field_errors
  return suivantes
}

export function premiereEtapeEnErreur(erreurs: ErreursSaisie): Etape | null {
  let premiere: Etape | null = null
  for (const champ of Object.keys(erreurs)) {
    if (!estChamp(champ) || champ === 'non_field_errors') continue
    const etape = ETAPE_DU_CHAMP[champ]
    if (premiere === null || etape < premiere) premiere = etape
  }
  return premiere
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

/**
 * Sous-étape où arriver sur une étape en deux temps : la liste des
 * structures si la spécialité est déjà choisie et ne pose pas problème, la
 * spécialité sinon.
 */
function sousEtapeDe(etape: Etape, saisie: Saisie, erreurs: ErreursSaisie): SousEtape {
  if (etape === 2) {
    return saisie.specialitePrestataire && !erreurs.specialitePrestataire
      ? 'fournisseur'
      : 'specialite'
  }
  if (etape === 4) return saisie.specialite && !erreurs.specialite ? 'fournisseur' : 'specialite'
  return 'specialite'
}

/** Après un choix : le récapitulatif si l'on venait le corriger, sinon l'étape suivante. */
function apresChoix(etat: EtatAssistant, saisie: Saisie, erreurs: ErreursSaisie): EtatAssistant {
  const reste = premiereEtapeEnErreur(erreurs)
  let etape: Etape
  let sousEtape: SousEtape = 'specialite'
  if (etat.retourRecap && reste !== null && reste !== etat.etape) {
    etape = reste
    sousEtape = sousEtapeDe(etape, saisie, erreurs)
  } else if (etat.retourRecap && reste === null && saisieComplete(saisie)) {
    etape = 6
  } else {
    // En avançant, une étape en deux temps commence par la spécialité.
    etape = Math.min(etat.etape + 1, NB_ETAPES) as Etape
  }
  return {
    ...etat,
    etape,
    sousEtape,
    sens: 'avant',
    saisie,
    erreurs,
    retourRecap: etape === 6 ? false : etat.retourRecap,
  }
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

    case 'specialitePrestataire': {
      // Autre spécialité : la structure choisie n'en fait plus partie.
      const autre = saisie.specialitePrestataire?.code !== action.specialite.code
      return {
        ...etat,
        sousEtape: 'fournisseur',
        sens: 'avant',
        saisie: {
          ...saisie,
          specialitePrestataire: action.specialite,
          prestataire: autre ? null : saisie.prestataire,
        },
        erreurs: autre
          ? sansErreurs(etat.erreurs, 'specialitePrestataire', 'prestataire')
          : sansErreurs(etat.erreurs, 'specialitePrestataire'),
      }
    }

    case 'prestataire':
      return apresChoix(
        etat,
        { ...saisie, prestataire: action.prestataire },
        sansErreurs(etat.erreurs, 'prestataire', 'specialitePrestataire'),
      )

    case 'nature':
      return apresChoix(
        etat,
        { ...saisie, nature: action.nature },
        sansErreurs(etat.erreurs, 'naturePrestation'),
      )

    case 'specialite': {
      const autre = saisie.specialite?.code !== action.specialite.code
      return {
        ...etat,
        sousEtape: 'fournisseur',
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

    case 'date':
      return {
        ...etat,
        saisie: { ...saisie, datePrescription: action.date },
        erreurs: sansErreurs(etat.erreurs, 'datePrescription'),
      }

    case 'continuer': {
      if (etat.etape !== 5) return etat
      const message = erreurDate(saisie.datePrescription, action.aujourdhui)
      if (message) return { ...etat, erreurs: { ...etat.erreurs, datePrescription: message } }
      return apresChoix(etat, saisie, sansErreurs(etat.erreurs, 'datePrescription'))
    }

    case 'precedent': {
      if (aDeuxTemps(etat.etape) && etat.sousEtape === 'fournisseur') {
        return { ...etat, sousEtape: 'specialite', sens: 'arriere' }
      }
      if (etat.etape === 1) return etat
      const etape = (etat.etape - 1) as Etape
      return {
        ...etat,
        etape,
        // En revenant sur une étape en deux temps, on retrouve la liste où l'on avait choisi.
        sousEtape: sousEtapeDe(etape, saisie, {}),
        sens: 'arriere',
      }
    }

    case 'modifier':
      if (action.etape === 6) return etat
      return {
        ...etat,
        etape: action.etape,
        // Changer de structure commence souvent par changer de spécialité.
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
        sousEtape: sousEtapeDe(etape, saisie, erreurs),
        sens: 'arriere',
        erreurs,
        retourRecap: true,
      }
    }
  }
}
