/**
 * Représentations renvoyées par l'API mobile d'IPM (/api/mobile/, SPEC §2).
 *
 * Calquées EXACTEMENT sur backend/apps/mobile/serializers.py : même nom de
 * champ (camelCase), même nullabilité. Les dates sont des chaînes ISO
 * (« AAAA-MM-JJ ») et ne sont jamais converties en Date à la lecture : on les
 * formate à l'affichage (src/utils/format.ts), ce qui évite tout décalage de
 * fuseau sur une date sans heure.
 */

/** Date sans heure, « AAAA-MM-JJ ». */
export type DateISO = string
/** Date-heure ISO 8601 avec fuseau (rendu DRF), ex. « 2026-09-18T11:21:04.123456Z ». */
export type DateHeureISO = string

/** Code + libellé d'un référentiel (société, type de bénéficiaire, spécialité). */
export interface CodeLibelle {
  code: string
  libelle: string
}

/**
 * Nature de prestation, telle que l'API la range pour une spécialité de
 * prestataire : `courante` dit si cette spécialité la donne vraiment, d'après
 * les lettres réelles de LAMPS. Les autres restent proposées, à la suite.
 */
export interface NaturePrestation extends CodeLibelle {
  courante?: boolean
}

export interface Participant {
  /** Matricule seul, ex. « 1204 ». */
  matricule: string
  /** Matricule précédé du code société, comme sur le bon imprimé : « 01-1204 ». */
  matriculeAffiche: string
  prenoms: string
  nom: string
  nomComplet: string
  /** « M » ou « F » (valeurs du référentiel IPM) ; peut être vide. */
  sexe: string
  dateNaissance: DateISO | null
  /** Âge révolu, null si la date de naissance manque. */
  age: number | null
  lieuNaissance: string | null
  situationFamiliale: string | null
  societe: CodeLibelle | null
  /** Coordonnées tenues par l'IPM ; le mobile les montre, il ne les change pas. */
  telephone: string | null
  email: string | null
  adresse: string | null
  /** État du dossier IPM : « Actif », « Suspendu »… */
  etat: string | null
  /**
   * Photo d'identité en URL de données (« data:image/jpeg;base64,… »), ou
   * null. C'est celle que tient l'IPM : la changer ici la change sur la fiche.
   */
  photo: string | null
  /** Une demande de réinitialisation de cette photo attend l'IPM. */
  demandePhoto?: boolean
}

/** Le participant lui-même (en tête de liste) ou un de ses ayants droit. */
export interface Beneficiaire {
  /** Matricule bénéficiaire ; celui du participant pour lui-même. À passer tel quel à la création d'un bon. */
  matricule: string
  nomComplet: string
  prenoms: string
  nom: string
  sexe: string
  age: number | null
  /** Lien avec le participant (PARTICIPANT, CONJOINT, ENFANT…). */
  type: CodeLibelle | null
  estParticipant: boolean
  /** Photo d'identité (URL de données), ou null : posée par le titulaire. */
  photo: string | null
  /** Une demande de réinitialisation de cette photo attend l'IPM. */
  demandePhoto?: boolean
}

/** Pharmacie ou prescripteur (médecin, clinique…). */
export interface Fournisseur {
  code: string
  libelle: string
  adresse: string | null
  /** Le fixe, à défaut le portable. */
  telephone: string | null
}

/**
 * Une structure conventionnée de l'annuaire (`GET /api/mobile/conventionnes/`) :
 * un fournisseur, avec la spécialité qui sert à le filtrer.
 */
export interface Conventionne extends Fournisseur {
  specialite: CodeLibelle | null
  /**
   * Position de la structure (degrés décimaux), renseignée par l'IPM dans la
   * fiche du fournisseur ; null tant qu'elle ne l'est pas — le bouton
   * « S'y rendre » guide alors vers l'adresse écrite.
   */
  position: { latitude: number; longitude: number } | null
}

export interface Specialite {
  code: string
  libelle: string
  /** Nombre de prescripteurs actifs de la spécialité. */
  nombre: number
}

/**
 * Où en est un bon. Priorité côté serveur : annule > traite > expire > valide.
 */
export type StatutBon = 'valide' | 'attente' | 'expire' | 'annule' | 'traite'

/**
 * Genre d'un document de « Mes bons ». Le numéro interne (`id`) n'est
 * unique que dans son genre : un bon et une lettre peuvent porter le même.
 */
export type GenreDocument = 'bon-pharmacie' | 'bon-optique' | 'lettre-garantie'

/** Un article d'un bon d'optique (GET /api/mobile/articles-optique/ : code et libellé). */
export interface ArticleOptique extends CodeLibelle {
  quantite: number
}

/** Bénéficiaire tel que résumé dans un bon. */
export interface BeneficiaireBon {
  matricule: string
  nomComplet: string
  type: CodeLibelle | null
}

/**
 * Un document du participant : bon de pharmacie ou lettre de garantie, sous
 * une même forme (backend/apps/mobile/serializers.py, representer_bon et
 * representer_lettre). Ce qui n'a pas de sens pour un genre y est null.
 */
export interface Bon {
  /** Absent des listes mises en cache avant les lettres : c'est alors un bon. */
  genre?: GenreDocument
  id: number
  /** Numéro imprimé, ex. « BPI000123 ». */
  code: string
  date: DateISO
  /** date + 30 jours. */
  valableJusquAu: DateISO
  statut: StatutBon
  beneficiaire: BeneficiaireBon | null
  /** Bon de pharmacie seulement. */
  pharmacie: Fournisseur | null
  /** Lettre de garantie seulement : la structure qui soigne. */
  prestataire?: Fournisseur | null
  /** Lettre de garantie seulement : visite, analyses, radiologie… */
  naturePrestation?: CodeLibelle | null
  specialite: CodeLibelle | null
  prescripteur: Fournisseur | null
  /** Bon de pharmacie seulement. */
  nbArticles: number | null
  /** Bon d'optique seulement : les articles commandés (montures, verres…). */
  articles?: ArticleOptique[] | null
  /** Date de l'ordonnance (bon) ou de la prescription (lettre). */
  dateOrdonnance: DateISO | null
  creeLe: DateHeureISO
}

// ---------------------------------------------------------------------------
// Corps et réponses des points d'entrée
// ---------------------------------------------------------------------------

/** POST /api/mobile/identification/ — le matricule affiché « 01-1204 » est accepté. */
export interface IdentificationCorps {
  matricule: string
  mot_de_passe: string
}

export interface IdentificationReponse {
  jeton: string
  participant: Participant
}

/** POST /api/mobile/activation/ — code d'activation de l'IPM + mot de passe choisi. */
export interface ActivationCorps {
  matricule: string
  code: string
  mot_de_passe: string
}

/** Options WebAuthn (base64url) et jeton signé du défi, à renvoyer avec la réponse. */
export interface OptionsCle {
  options: Record<string, unknown>
  jeton: string
}

/** Une clé d'accès (empreinte / Face ID) enregistrée sur un appareil. */
export interface CleAcces {
  id: number
  nom: string
  creeLe: string
  utiliseeLe: string | null
}

/** GET /api/mobile/moi/ */
export interface MoiReponse {
  participant: Participant
  /** Le participant en premier, puis ses ayants droit actifs par matricule. */
  beneficiaires: Beneficiaire[]
}

/**
 * Un soin pris en charge : ce que l'IPM a payé et ce qui reste à la charge de
 * l'agent (le ticket modérateur), pour un bon donné.
 */
export interface Soin {
  id: number
  /** Mois du soin (date ISO). */
  date: DateISO
  /** N° du bon, s'il y en a un. */
  numeroBon: string
  /** Part de l'agent : ce qu'il doit pour ce soin. */
  partAgent: number
  /** Part IPM : ce que l'IPM a pris en charge pour ce soin. */
  partIpm: number
  /** Reste dû à l'IPM après ce soin. */
  reste: number
  /**
   * Le document de l'agent (pour ouvrir son détail), ou null si le n° de bon
   * ne désigne aucun document visible dans « Mes bons ».
   */
  document: { genre: GenreDocument; id: number } | null
}

/**
 * Un mouvement d'argent d'un mois donné : une retenue sur salaire (journal RP)
 * ou un remboursement versé à l'agent (journaux RIB/RIC). Groupé par mois.
 */
export interface MouvementMensuel {
  /** Clé du mois (ex. « 2026-01-01 »). */
  id: string
  /** Mois du mouvement (date ISO, le 1er du mois). */
  date: DateISO
  /** Montant du mois. */
  montant: number
}

/** GET /api/mobile/moi/compte/ — le relevé du compte IPM du participant. */
export interface ReleveCompte {
  /** Compte participant (ex. « 411002 »). */
  compte: string
  /** Tiers de l'agent (ex. « 02-0001 »). */
  tiers: string
  /** Reste à payer à l'IPM (positif = dette, 0 = à jour, négatif = avance). */
  solde: number
  /** Total pris en charge par l'IPM, cumulé. */
  totalPartIpm: number
  /** Total coupé sur le salaire (retenues RP), cumulé. */
  totalRetenu: number
  /** Total remboursé à l'agent (RIB/RIC), cumulé. */
  totalRembourse: number
  /** Les soins, du plus récent au plus ancien. */
  soins: Soin[]
  /** Les retenues sur salaire, par mois, du plus récent au plus ancien. */
  retenues: MouvementMensuel[]
  /** Les remboursements versés à l'agent, par mois, du plus récent au plus ancien. */
  remboursements: MouvementMensuel[]
}

/** POST /api/mobile/bons-pharmacie/ */
export interface NouveauBonCorps {
  /**
   * Beneficiaire.matricule - LE SEUL champ exigé, comme à l'écran IPM, où
   * seuls la société, le participant et le type de bénéficiaire portent
   * l'astérisque. Tout le reste se renseigne plus tard.
   */
  beneficiaire: string
  /** Fournisseur.code de la pharmacie */
  pharmacie?: string
  /** Specialite.code du prescripteur */
  specialite?: string
  /** Fournisseur.code du prescripteur */
  prescripteur?: string
  /** 1 à 8 (le bon imprimé a 8 lignes). */
  nbArticles?: number
  /** Ni dans le futur, ni plus de 30 jours. */
  dateOrdonnance?: DateISO
}

/** Champs sur lesquels le serveur peut poser une erreur 400 à la création. */
export type ChampNouveauBon = keyof NouveauBonCorps | 'non_field_errors'

/** POST /api/mobile/lettres-garantie/ */
export interface NouvelleLettreCorps {
  /**
   * Beneficiaire.matricule - LE SEUL champ exigé, comme à l'écran IPM.
   * Tout le reste se renseigne plus tard.
   */
  beneficiaire: string
  /** Specialite.code du prestataire */
  specialitePrestataire?: string
  /** Fournisseur.code du prestataire */
  prestataire?: string
  /** Code de la nature de prestation (GET /api/mobile/natures-prestation/). */
  naturePrestation?: string
  /** Specialite.code du prescripteur */
  specialite?: string
  /** Fournisseur.code du prescripteur */
  prescripteur?: string
  /** 1 à 8 (la lettre imprimée a 8 lignes). */
  nbArticles?: number
  /** Ni dans le futur, ni plus de 30 jours. */
  datePrescription?: DateISO
}

export type ChampNouvelleLettre = keyof NouvelleLettreCorps | 'non_field_errors'

/** POST /api/mobile/bons-optique/ */
export interface NouveauBonOptiqueCorps {
  /** Beneficiaire.matricule - LE SEUL champ exigé, comme à l'écran IPM. */
  beneficiaire: string
  /** Fournisseur.code de l'opticien (GET /api/mobile/opticiens/). */
  opticien?: string
  /** Specialite.code du prescripteur */
  specialite?: string
  /** Fournisseur.code du prescripteur */
  prescripteur?: string
  /** Articles choisis dans la nomenclature (GET /api/mobile/articles-optique/). */
  articles?: { code: string; quantite?: number }[]
  /** Ni dans le futur, ni plus de 30 jours. */
  datePrescription?: DateISO
}

export type ChampNouveauBonOptique = keyof NouveauBonOptiqueCorps | 'non_field_errors'

/** GET /api/mobile/notifications/ : une décision de l'IPM sur une demande de l'employé. */
export interface NotificationMobile {
  /** Stable : « photo-12 », « optique-40 ». */
  id: string
  genre: 'photo' | 'bon-optique'
  titre: string
  message: string
  /** Date-heure ISO de la décision. */
  date: string
  /** Écran à ouvrir au toucher (le détail du bon), ou null. */
  lien: string | null
}

/** Erreurs 400 au format DRF : { champ: [messages] }. */
export type ErreursChamps = Record<string, string[]>
