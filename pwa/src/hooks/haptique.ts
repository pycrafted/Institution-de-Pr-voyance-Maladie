/**
 * Retour haptique par `navigator.vibrate` (Android). iOS/Safari ne l'expose
 * pas : les appels y sont simplement sans effet, jamais une erreur.
 * Durées courtes : une vibration longue fait « alerte », pas « application ».
 */

function vibrer(motif: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(motif)
    }
  } catch {
    // Certains navigateurs lèvent une exception hors geste de l'utilisateur.
  }
}

export const haptique = {
  /** Toucher d'un élément, changement d'onglet ou de segment. */
  leger: () => vibrer(8),
  /** Sélection dans une liste, pas franchi dans l'assistant. */
  selection: () => vibrer(12),
  /** Bon généré, action réussie. */
  succes: () => vibrer([12, 60, 18]),
  /** Refus du serveur, saisie incorrecte. */
  erreur: () => vibrer([30, 50, 30]),
  /** Avant une action destructive (déconnexion). */
  avertissement: () => vibrer(20),
}
