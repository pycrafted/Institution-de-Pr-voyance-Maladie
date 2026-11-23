/**
 * Activer ou retirer la connexion par empreinte / Face ID sur CET appareil
 * (l'employé est connecté). Le serveur garde la clé publique ; l'appareil
 * retient seulement le numéro de sa clé (utils/clesAcces).
 */

import { inscrireCle, optionsInscriptionCle, retirerCle } from '../api'
import { cleDeLAppareil, creerCle, retenirCle } from '../utils/clesAcces'

/** Crée et enregistre la clé de cet appareil (fenêtre empreinte / Face ID). */
export async function activerEmpreinte(matricule: string): Promise<void> {
  const { options, jeton } = await optionsInscriptionCle()
  const reponse = await creerCle(options)
  const cle = await inscrireCle(jeton, reponse)
  retenirCle({ id: cle.id, matricule })
}

/** Retire la clé de cet appareil, côté serveur puis ici. */
export async function desactiverEmpreinte(): Promise<void> {
  const cle = cleDeLAppareil()
  if (cle) {
    try {
      await retirerCle(cle.id)
    } catch {
      // Déjà retirée côté serveur, ou hors ligne : l'appareil l'oublie quand même.
    }
  }
  retenirCle(null)
}
