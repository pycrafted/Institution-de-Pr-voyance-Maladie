/**
 * Écoute de fond des listes : le tableau se met à jour tout seul.
 *
 * Un bon de pharmacie émis depuis le mobile d'un employé écrit dans la même
 * base que l'écran ouvert à l'IPM. Sans rien de plus, l'agent ne le verrait
 * qu'en rafraîchissant la page - et ne saurait donc pas qu'il doit le faire.
 *
 * Le serveur ne peut pas prévenir de lui-même : Django tourne sous waitress
 * derrière IIS, avec quatre fils. Une connexion maintenue ouverte (WebSocket,
 * SSE, attente longue) immobiliserait un fil par écran ouvert et finirait par
 * bloquer le site entier. On interroge donc régulièrement, mais on n'interroge
 * presque rien : l'action `etat` du référentiel (cf. backend, socle des
 * référentiels) ne renvoie que deux valeurs - le nombre de fiches et la date de
 * la dernière modification - calculées par une seule agrégation SQL. La liste
 * elle-même n'est rechargée que lorsque l'une des deux a bougé.
 *
 * Règle de conduite : cette écoute est invisible. Elle ne montre jamais
 * d'erreur, ne fait jamais clignoter la page, et surtout n'interrompt jamais
 * l'utilisateur - un tableau qui se recharge sous les doigts de qui remplit un
 * formulaire ou coche des lignes est pire que pas de mise à jour du tout.
 */

import { useEffect, useRef } from 'react'

import { ecritureEnVol } from '../../services/api'
import { ecoutable, etatReferentiel } from '../../services/referentiels'

/** Rythme de croisière : assez court pour que l'apparition paraisse immédiate. */
const DELAI = 3000
/**
 * Serveur muet ou en erreur : on espace (3 s → 6 s → 12 s…) plutôt que de
 * marteler une machine déjà en peine. Plafonné, pour retrouver le rythme normal
 * dans la demi-minute qui suit son rétablissement.
 */
const DELAI_MAX = 30000
/**
 * Refus de suite (4xx autres que 401) avant de renoncer : le premier peut
 * n'être qu'un incident du relais, le troisième dit que ce référentiel n'a
 * pas d'état à interroger.
 */
const REFUS_AVANT_ABANDON = 3

/**
 * @param cle          clé du référentiel à surveiller
 * @param occupe       l'écran est-il en cours d'usage (formulaire ouvert,
 *                     confirmation affichée, lignes cochées) ? Un changement vu
 *                     pendant ce temps est mémorisé et appliqué au retour au
 *                     calme.
 * @param recharger    recharge la liste, sans indicateur de chargement
 */
export function useEcouteChangements({ cle, occupe, recharger }) {
  const rechargerRef = useRef(recharger)
  const occupeRef = useRef(occupe)
  // Changement repéré alors que l'écran était occupé : en attente d'un moment
  // où l'appliquer ne dérangera personne.
  const enAttente = useRef(false)

  // Les deux vivent dans des refs : l'écoute est montée une fois pour toutes et
  // ne doit pas se relancer à chaque frappe ou à chaque case cochée.
  useEffect(() => {
    rechargerRef.current = recharger
    occupeRef.current = occupe
  })

  useEffect(() => {
    // Un référentiel encore servi par le navigateur n'a pas d'état à interroger.
    if (!ecoutable(cle)) return undefined

    let vivant = true
    let minuteur = null
    // Jamais deux interrogations en vol : sur un serveur lent, elles
    // s'empileraient et finiraient par coûter plus cher que la liste elle-même.
    let enVol = false
    let delai = DELAI
    let etatConnu = null
    // Refus 4xx consécutifs (cf. REFUS_AVANT_ABANDON).
    let refus = 0

    const programmer = (ms) => {
      // Onglet en arrière-plan : on ne programme rien. Personne ne regarde, et
      // dix écrans oubliés dans des onglets pèseraient autant que dix agents au
      // travail. Le retour au premier plan relance aussitôt (cf. `reveiller`).
      if (!vivant || document.visibilityState === 'hidden') return
      clearTimeout(minuteur)
      minuteur = setTimeout(verifier, ms)
    }

    const arreter = () => {
      vivant = false
      clearTimeout(minuteur)
    }

    const verifier = async () => {
      // Le tick en vol reprogrammera la suite : ne pas en lancer un second.
      if (!vivant || enVol) return
      // Changement mis en attente que l'effet ci-dessous n'a pas pu appliquer -
      // l'écran n'était bloqué que par une écriture en vol, qui ne provoque
      // aucun rendu en se terminant. Rattrapé ici, au tour suivant.
      if (enAttente.current && !occupeRef.current && !ecritureEnVol()) {
        enAttente.current = false
        rechargerRef.current()
      }
      enVol = true
      try {
        const etat = await etatReferentiel(cle)
        if (!vivant) return
        delai = DELAI
        refus = 0
        const change =
          etatConnu !== null &&
          (etat.nombre !== etatConnu.nombre ||
            etat.dernier_changement !== etatConnu.dernier_changement)
        // Retenu dans tous les cas, y compris quand l'écran est occupé : sinon
        // le même changement serait redécouvert à chaque tour.
        etatConnu = etat
        if (change) {
          if (occupeRef.current || ecritureEnVol()) enAttente.current = true
          else rechargerRef.current()
        }
      } catch (e) {
        if (!vivant) return
        // 401 : la session a expiré - le service API ramène déjà à la
        // connexion, cette écoute n'a plus rien à faire.
        if (e.statut === 401) {
          arreter()
          return
        }
        // Autre 4xx : ce référentiel n'a peut-être pas d'action `etat`, et
        // insister ne servirait à rien - mais un refus isolé (relais IIS qui
        // coupe, jeton renouvelé au même instant) ne doit pas éteindre
        // l'écoute pour le reste de la journée : l'agent croirait son tableau
        // à jour alors qu'il ne l'est plus. On n'abandonne donc qu'après
        // plusieurs refus de suite.
        if (e.statut >= 400 && e.statut < 500) {
          refus += 1
          if (refus >= REFUS_AVANT_ABANDON) {
            arreter()
            return
          }
        }
        // Réseau coupé ou serveur en erreur : on espace, en silence.
        delai = Math.min(delai * 2, DELAI_MAX)
      } finally {
        enVol = false
        programmer(delai)
      }
    }

    const reveiller = () => {
      if (!vivant || document.visibilityState === 'hidden') return
      // Au retour au premier plan, l'écran peut avoir plusieurs minutes de
      // retard : on vérifie tout de suite, et au rythme normal.
      delai = DELAI
      programmer(0)
    }

    document.addEventListener('visibilitychange', reveiller)
    window.addEventListener('focus', reveiller)
    // Premier relevé immédiat : il fixe la référence au plus près du moment où
    // la liste elle-même a été chargée.
    programmer(0)

    return () => {
      arreter()
      document.removeEventListener('visibilitychange', reveiller)
      window.removeEventListener('focus', reveiller)
    }
  }, [cle])

  // Changement mis en attente : appliqué dès que l'écran redevient disponible.
  useEffect(() => {
    if (occupe || !enAttente.current) return
    enAttente.current = false
    recharger()
  }, [occupe, recharger])
}
