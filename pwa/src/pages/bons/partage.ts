/**
 * « Partager / Imprimer » et « Télécharger » le PDF officiel d'un bon.
 *
 * Le partage passe par la feuille de partage du téléphone (Web Share API
 * niveau 2, avec le fichier) : elle propose WhatsApp, e-mail… et surtout
 * « Imprimer » sur iOS comme sur Android. Quand le navigateur ne sait pas
 * partager un fichier, on retombe sur le téléchargement.
 */

import type { Bon } from '../../types/api'
import { typeDocument } from './affichage'

/** « BPI000123.pdf », comme le nom donné par le serveur. */
export function nomFichierPdf(bon: Pick<Bon, 'code' | 'id'>): string {
  const code = (bon.code || `bon-${bon.id}`).replace(/[^\w-]+/g, '_')
  return `${code}.pdf`
}

export function fichierPdf(pdf: Blob, bon: Pick<Bon, 'code' | 'id'>): File {
  return new File([pdf], nomFichierPdf(bon), { type: 'application/pdf' })
}

/** true si le navigateur sait partager ce fichier (sinon : téléchargement). */
export function partageFichierPossible(fichier: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [fichier] })
  } catch {
    return false
  }
}

/**
 * Enregistre le fichier sur l'appareil par un lien `download` éphémère :
 * « Téléchargements » sur Android, invite « Télécharger » (puis app Fichiers)
 * sur iOS.
 */
export function telechargerFichier(pdf: Blob, nom: string): void {
  const url = URL.createObjectURL(pdf)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  lien.rel = 'noopener'
  lien.style.display = 'none'
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  // Laisser au navigateur le temps de lire le Blob avant de le libérer.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export type ResultatPartage = 'partage' | 'annule' | 'telecharge'

/**
 * Ouvre la feuille de partage avec le PDF ; repli : téléchargement.
 *
 * À appeler DIRECTEMENT dans le gestionnaire du toucher, PDF déjà en main :
 * Safari refuse `navigator.share` si un `await` réseau s'intercale entre le
 * geste et l'appel (« NotAllowedError »).
 */
export async function partagerPdf(
  pdf: Blob,
  bon: Pick<Bon, 'code' | 'id' | 'genre'>,
): Promise<ResultatPartage> {
  const fichier = fichierPdf(pdf, bon)
  if (partageFichierPossible(fichier)) {
    try {
      await navigator.share({
        files: [fichier],
        title: `${typeDocument(bon).libelle} ${bon.code}`,
      })
      return 'partage'
    } catch (e) {
      // L'employé a refermé la feuille de partage : ce n'est pas une erreur.
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule'
      // Autre refus (geste expiré, type non partageable…) : téléchargement.
    }
  }
  telechargerFichier(pdf, fichier.name)
  return 'telecharge'
}
