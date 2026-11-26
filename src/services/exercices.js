/**
 * Les exercices ouverts - les années que la base porte vraiment.
 *
 * Chaque écran qui filtre par exercice (documents, factures, règlements,
 * remboursements, suspensions, journal central, tableau de bord) calculait sa
 * propre liste dans le navigateur : « l'année en cours », ou « les huit
 * dernières ». Les deux mentaient. Après la purge d'octobre il n'y avait plus
 * qu'une année à montrer ; depuis la reprise du 2026-11-26 la base remonte à
 * 2016, et le sélecteur restait bloqué sur 2026.
 *
 * Le serveur la calcule maintenant sur les DONNÉES (GET /api/exercices/, cf.
 * backend/apps/donnees_de_base/exercices.py) et la liste se charge une fois au
 * démarrage, avec les référentiels.
 *
 * Tant que la réponse n'est pas là, `exercices()` rend l'année en cours : un
 * sélecteur vide empêcherait de travailler, et c'est l'année dans laquelle on
 * saisit.
 */

import { request } from './api'

const anneeCourante = () => String(new Date().getFullYear())

let liste = [anneeCourante()]
let enCours = null

/** Les exercices, du plus récent au plus ancien, en { valeur, libelle }. */
export const exercices = () => liste.map((an) => ({ valeur: an, libelle: an }))

/** Le plus récent - celui sur lequel les écrans s'ouvrent. */
export const exerciceCourant = () => liste[0] || anneeCourante()

/**
 * Charge la liste depuis le serveur. Appelée au démarrage ; l'appeler
 * plusieurs fois ne déclenche qu'une requête, et rend la liste à jour.
 */
export function chargerExercices() {
  if (!enCours) {
    enCours = request('/exercices/')
      .then((reponse) => {
        const annees = (reponse?.exercices || []).map(String).filter(Boolean)
        if (annees.length) liste = annees
        return exercices()
      })
      .catch(() => {
        // Hors ligne ou session close : on garde l'année en cours plutôt que
        // de rendre le filtre inutilisable.
        enCours = null
        return exercices()
      })
  }
  return enCours
}
