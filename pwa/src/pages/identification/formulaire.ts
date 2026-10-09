/**
 * Logique de l'écran d'identification, séparée de l'affichage pour être
 * testée sans Ionic : nettoyage du matricule saisi, contrôles avant envoi,
 * état du formulaire et appel à useSession().identifier.
 *
 * Les contrôles d'ici ne sont qu'un confort (réponse immédiate, pas
 * d'aller-retour pour un champ vide) : c'est le serveur qui décide si
 * l'identité est la bonne.
 */

import { useRef, useState } from 'react'

import { estErreurApi, messageErreur } from '../../api'

// Un matricule IPM fait quelques chiffres (« 0949 », « 01-0949 ») : une
// saisie plus longue est forcément une erreur de frappe.
const LONGUEUR_MAX_MATRICULE = 20

/**
 * Nettoie la saisie au fil de la frappe : chiffres et un tiret seulement.
 * Espace, point, barre ou tiret long deviennent un tiret (« 01 1204 »,
 * « 01.1204 », collé depuis un SMS : « 01–1204 »). Le tiret final est gardé :
 * l'employé est peut-être en train de taper « 01- ».
 */
export function nettoyerMatricule(saisie: string): string {
  return saisie
    .replace(/[\s./_\u2010-\u2015]+/g, '-')
    .replace(/[^\d-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
    .slice(0, LONGUEUR_MAX_MATRICULE)
}

/** Le matricule tel qu'envoyé au serveur (sans tiret final oublié). */
export function matriculePourEnvoi(saisie: string): string {
  return nettoyerMatricule(saisie).replace(/-+$/, '')
}

/** Message d'erreur du matricule, ou undefined s'il a la bonne forme. */
export function verifierMatricule(matricule: string): string | undefined {
  if (!matricule) return 'Saisissez votre matricule.'
  if (!/^\d+(-\d+)?$/.test(matricule)) {
    return 'Un matricule s’écrit en chiffres, par exemple 949.'
  }
  return undefined
}

/** Message d'erreur du mot de passe, ou undefined s'il est saisi. */
export function verifierMotDePasse(motDePasse: string): string | undefined {
  if (!motDePasse) return 'Saisissez votre mot de passe.'
  return undefined
}

export interface ErreursIdentification {
  matricule?: string
  motDePasse?: string
}

/** Issue d'un envoi, pour le retour haptique et le placement du focus. */
export type IssueEnvoi = 'ok' | 'invalide' | 'refuse' | 'annule' | 'occupe'

/**
 * État du formulaire. Les erreurs de champ n'apparaissent qu'après un
 * premier appui sur « Continuer » : on ne gronde pas quelqu'un qui n'a pas
 * encore fini de taper.
 */
export function useFormulaireIdentification(
  identifier: (matricule: string, motDePasse: string) => Promise<void>,
) {
  const [matricule, setMatricule] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreurServeur, setErreurServeur] = useState<string | null>(null)
  // Garde contre le double appui (l'état « envoi » n'est relu qu'au rendu suivant).
  const enCours = useRef(false)

  const erreurs: ErreursIdentification = {
    matricule: verifierMatricule(matriculePourEnvoi(matricule)),
    motDePasse: verifierMotDePasse(motDePasse),
  }

  function changerMatricule(saisie: string): string {
    const propre = nettoyerMatricule(saisie)
    setMatricule(propre)
    setErreurServeur(null)
    return propre
  }

  function changerMotDePasse(saisie: string) {
    setMotDePasse(saisie)
    setErreurServeur(null)
  }

  async function envoyer(): Promise<IssueEnvoi> {
    if (enCours.current) return 'occupe'
    setTente(true)
    if (erreurs.matricule || erreurs.motDePasse) return 'invalide'
    enCours.current = true
    setEnvoi(true)
    setErreurServeur(null)
    try {
      await identifier(matriculePourEnvoi(matricule), motDePasse)
      return 'ok'
    } catch (e) {
      if (estErreurApi(e) && e.genre === 'annulee') return 'annule'
      // 401 identité incorrecte, 403 dossier inactif, 429, réseau… : le
      // message du client est déjà une phrase française montrable.
      setErreurServeur(messageErreur(e))
      return 'refuse'
    } finally {
      enCours.current = false
      setEnvoi(false)
    }
  }

  return {
    matricule,
    motDePasse,
    envoi,
    erreurServeur,
    /** Erreurs à afficher (vides tant que l'employé n'a pas tenté d'envoyer). */
    erreurs: tente ? erreurs : ({} as ErreursIdentification),
    /** Contrôles de l'état courant, affichés ou non (où placer le focus). */
    controle: erreurs,
    changerMatricule,
    changerMotDePasse,
    envoyer,
  }
}
