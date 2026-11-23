/**
 * Formulaire « J'ai un code de l'IPM » (première connexion, mot de passe
 * oublié) : matricule, code d'activation à six chiffres, mot de passe choisi
 * et sa confirmation. Les contrôles d'ici ne sont qu'un confort : le serveur
 * applique les vraies règles (cf. mobile.compte) et son message est montré.
 */

import { useRef, useState } from 'react'

import { estErreurApi, messageErreur } from '../../api'
import {
  matriculePourEnvoi,
  nettoyerMatricule,
  verifierMatricule,
  type IssueEnvoi,
} from './formulaire'

export const LONGUEUR_MIN_MOT_DE_PASSE = 8

export function nettoyerCode(saisie: string): string {
  return saisie.replace(/\D/g, '').slice(0, 6)
}

export function verifierCode(code: string): string | undefined {
  if (!code) return 'Saisissez le code remis par l’IPM.'
  if (code.length !== 6) return 'Le code a 6 chiffres.'
  return undefined
}

/** Les règles visibles du mot de passe (le serveur ajoute les siennes). */
export function verifierNouveauMotDePasse(
  motDePasse: string,
  matricule: string,
): string | undefined {
  if (!motDePasse) return 'Choisissez un mot de passe.'
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE)
    return `Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`
  if (/^\d+$/.test(motDePasse)) return 'Pas uniquement des chiffres : ajoutez des lettres.'
  const m = matricule.split('-').pop()?.replace(/^0+/, '')
  if (m && motDePasse.replace(/^0+/, '') === m) return 'Pas votre matricule.'
  return undefined
}

export function verifierConfirmation(motDePasse: string, confirmation: string): string | undefined {
  if (!confirmation) return 'Retapez le mot de passe.'
  return confirmation === motDePasse ? undefined : 'Les deux mots de passe sont différents.'
}

export interface ErreursActivation {
  matricule?: string
  code?: string
  motDePasse?: string
  confirmation?: string
}

export function useFormulaireActivation(
  activer: (matricule: string, code: string, motDePasse: string) => Promise<void>,
) {
  const [matricule, setMatricule] = useState('')
  const [code, setCode] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreurServeur, setErreurServeur] = useState<string | null>(null)
  const enCours = useRef(false)

  const m = matriculePourEnvoi(matricule)
  const erreurs: ErreursActivation = {
    matricule: verifierMatricule(m),
    code: verifierCode(code),
    motDePasse: verifierNouveauMotDePasse(motDePasse, m),
    confirmation: verifierConfirmation(motDePasse, confirmation),
  }

  function effacer<T>(fixer: (v: T) => void) {
    return (v: T) => {
      fixer(v)
      setErreurServeur(null)
    }
  }

  async function envoyer(): Promise<IssueEnvoi> {
    if (enCours.current) return 'occupe'
    setTente(true)
    if (Object.values(erreurs).some(Boolean)) return 'invalide'
    enCours.current = true
    setEnvoi(true)
    setErreurServeur(null)
    try {
      await activer(m, code, motDePasse)
      return 'ok'
    } catch (e) {
      if (estErreurApi(e) && e.genre === 'annulee') return 'annule'
      setErreurServeur(messageErreur(e))
      return 'refuse'
    } finally {
      enCours.current = false
      setEnvoi(false)
    }
  }

  return {
    matricule,
    code,
    motDePasse,
    confirmation,
    envoi,
    erreurServeur,
    erreurs: tente ? erreurs : ({} as ErreursActivation),
    controle: erreurs,
    changerMatricule: (s: string) => {
      const propre = nettoyerMatricule(s)
      setMatricule(propre)
      setErreurServeur(null)
      return propre
    },
    changerCode: (s: string) => {
      const propre = nettoyerCode(s)
      setCode(propre)
      setErreurServeur(null)
      return propre
    },
    changerMotDePasse: effacer(setMotDePasse),
    changerConfirmation: effacer(setConfirmation),
    envoyer,
  }
}
