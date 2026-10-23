/**
 * Points d'entrée de l'API mobile d'IPM (/api/mobile/, SPEC §2).
 *
 * Une fonction par point d'entrée ; les écrans n'appellent jamais `requete`
 * directement. Toutes acceptent un `signal` pour s'annuler quand l'écran
 * est quitté.
 */

import type {
  Bon,
  Conventionne,
  Fournisseur,
  GenreDocument,
  IdentificationCorps,
  IdentificationReponse,
  MoiReponse,
  NaturePrestation,
  NouveauBonCorps,
  NouvelleLettreCorps,
  Specialite,
} from '../types/api'
import { requete } from './client'

type Signal = { signal?: AbortSignal }

/**
 * Matricule + mot de passe → jeton. Seul appel sans jeton : un 401 y
 * signifie « identité incorrecte » (message du serveur) et ne déconnecte rien.
 */
export function identifier(corps: IdentificationCorps, { signal }: Signal = {}) {
  return requete<IdentificationReponse>('/mobile/identification/', {
    methode: 'POST',
    corps,
    signal,
    authentifiee: false,
  })
}

/** Le participant et ses bénéficiaires (lui-même en premier). */
export function lireMoi({ signal }: Signal = {}) {
  return requete<MoiReponse>('/mobile/moi/', { signal })
}

/**
 * Pose la photo d'identité du participant (URL de données JPEG/PNG/WEBP,
 * 400 Ko au plus — cf. utils/photo.ts, qui la réduit avant l'envoi).
 *
 * UNE SEULE FOIS : si une photo est déjà enregistrée, le serveur refuse
 * (400) et renvoie le message à montrer. Le remplacement et le retrait
 * appartiennent à l'IPM, depuis son application de gestion — c'est une pièce
 * d'identité présentée au prestataire, pas un avatar.
 */
export function poserPhoto(photo: string, { signal }: Signal = {}) {
  return requete<{ photo: string }>('/mobile/moi/photo/', {
    methode: 'PUT',
    corps: { photo },
    signal,
  })
}

/**
 * Pose la photo d'un ayant droit (même format, mêmes limites et même règle du
 * « une seule fois » que la photo du titulaire). Le bénéficiaire doit
 * appartenir à la famille du participant connecté ; le serveur le vérifie.
 */
export function poserPhotoBeneficiaire(matricule: string, photo: string, { signal }: Signal = {}) {
  return requete<{ photo: string }>(
    `/mobile/moi/beneficiaires/${encodeURIComponent(matricule)}/photo/`,
    { methode: 'PUT', corps: { photo }, signal },
  )
}

/**
 * Toutes les structures conventionnées, toutes spécialités confondues, par
 * libellé — l'annuaire de l'écran « Conventionnés ».
 */
export function listerConventionnes({ signal }: Signal = {}) {
  return requete<Conventionne[]>('/mobile/conventionnes/', { signal })
}

/** Pharmacies conventionnées, par libellé. */
export function listerPharmacies({ signal }: Signal = {}) {
  return requete<Fournisseur[]>('/mobile/pharmacies/', { signal })
}

/** Spécialités des prescripteurs (hors pharmacies et optique), par libellé. */
export function listerSpecialites({ signal }: Signal = {}) {
  return requete<Specialite[]>('/mobile/specialites/', { signal })
}

/** Prescripteurs actifs d'une spécialité (400 si le code est inconnu). */
export function listerPrescripteurs(specialite: string, { signal }: Signal = {}) {
  return requete<Fournisseur[]>('/mobile/prescripteurs/', { params: { specialite }, signal })
}

/** Chemin de l'API de chaque genre de document. */
const CHEMIN_API: Record<GenreDocument, string> = {
  'bon-pharmacie': '/mobile/bons-pharmacie/',
  'lettre-garantie': '/mobile/lettres-garantie/',
}

/**
 * Tous les documents du participant (y compris émis par IPM) : ses bons de
 * pharmacie et ses lettres de garantie, lus ensemble. Le tri est fait par
 * data/bons.trierBons.
 */
export async function listerBons({ signal }: Signal = {}) {
  const [bons, lettres] = await Promise.all([
    requete<Bon[]>(CHEMIN_API['bon-pharmacie'], { signal }),
    requete<Bon[]>(CHEMIN_API['lettre-garantie'], { signal }),
  ])
  return [...bons, ...lettres]
}

export function lireBon(genre: GenreDocument, id: number, { signal }: Signal = {}) {
  return requete<Bon>(`${CHEMIN_API[genre]}${id}/`, { signal })
}

/** Natures de prestation qu'une lettre de garantie peut couvrir. */
export function listerNaturesPrestation(
  specialite?: string | null,
  { signal }: Signal = {},
) {
  // La spécialité du prestataire range la liste : un cardiologue voit
  // « CONSULTATION CARDIOLOGIE » en tête, l'échographie avec les autres.
  const requis = specialite ? `?specialite=${encodeURIComponent(specialite)}` : ''
  return requete<NaturePrestation[]>(`/mobile/natures-prestation/${requis}`, { signal })
}

/** Crée une lettre. 400 : erreurs par champ de NouvelleLettreCorps dans ErreurApi.champs. */
export function creerLettre(corps: NouvelleLettreCorps, { signal }: Signal = {}) {
  return requete<Bon>(CHEMIN_API['lettre-garantie'], { methode: 'POST', corps, signal })
}

/** Crée un bon. 400 : erreurs par champ de NouveauBonCorps dans ErreurApi.champs. */
export function creerBon(corps: NouveauBonCorps, { signal }: Signal = {}) {
  return requete<Bon>('/mobile/bons-pharmacie/', { methode: 'POST', corps, signal })
}

/** Le PDF officiel du document (original + copie), tel qu'IPM l'imprime. */
export function telechargerPdfBon(genre: GenreDocument, id: number, { signal }: Signal = {}) {
  return requete<Blob>(`${CHEMIN_API[genre]}${id}/pdf/`, {
    reponse: 'blob',
    signal,
    // Un PDF sur un réseau mobile lent : plus de marge que les appels JSON.
    delaiMs: 30_000,
  })
}
