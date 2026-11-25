/**
 * « L'employé est en train de faire quelque chose qui ne doit pas être
 * interrompu » - aujourd'hui : choisir et envoyer une photo (le téléphone
 * ouvre son appareil photo ou sa galerie, l'application passe en arrière-plan).
 * La mise à jour automatique (components/MiseAJour) attend que ce soit fini.
 *
 * L'occupation s'éteint d'elle-même au bout de deux minutes : un sélecteur de
 * photo refermé sans choix ne prévient pas.
 */

const DUREE_MAX_MS = 2 * 60 * 1000

let depuis: number | null = null

export function marquerOccupe(): void {
  depuis = Date.now()
}

export function liberer(): void {
  depuis = null
}

export function estOccupe(): boolean {
  return depuis !== null && Date.now() - depuis < DUREE_MAX_MS
}
