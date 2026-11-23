/**
 * Session de l'employé : jeton, participant, bénéficiaires.
 *
 * Trois façons d'obtenir le jeton signé (valable 90 jours, conservé en
 * IndexedDB pour ne pas se réidentifier à chaque lancement) :
 *   - matricule + mot de passe choisi par l'employé ;
 *   - activation : matricule + code de l'IPM + nouveau mot de passe ;
 *   - empreinte digitale / Face ID (clé d'accès de l'appareil).
 * Toutes ouvrent la session de la même façon (`ouvrir`).
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  activer as activerApi,
  chargerConfig,
  configurerClient,
  connecterParCle,
  identifier as identifierApi,
  lireMoi,
  optionsConnexionCle,
} from '../api'
import { reinitialiserBons } from '../data/bons'
import { reinitialiserCompte } from '../data/compte'
import { effacerSession, enregistrerSession, lireSession, viderCache } from '../offline/stockage'
import type { Beneficiaire, IdentificationReponse, Participant } from '../types/api'
import { utiliserCle } from '../utils/clesAcces'

export type StatutSession = 'chargement' | 'anonyme' | 'identifie'

/** Pourquoi on est revenu à l'identification (message à afficher), null au premier lancement. */
export type MotifDeconnexion = 'volontaire' | 'expiree' | null

export interface Session {
  statut: StatutSession
  participant: Participant | null
  /** Le participant en premier, puis ses ayants droit actifs. */
  beneficiaires: Beneficiaire[]
  motifDeconnexion: MotifDeconnexion
  /**
   * Identifie l'employé. Rejette une ErreurApi (401 identité incorrecte, 403
   * dossier inactif, 429 trop de tentatives, réseau…) dont le message est
   * montrable tel quel.
   */
  identifier: (matricule: string, motDePasse: string) => Promise<void>
  /**
   * Première connexion ou mot de passe oublié : matricule + code d'activation
   * remis par l'IPM + mot de passe choisi. Ouvre la session.
   */
  activer: (matricule: string, code: string, motDePasse: string) => Promise<void>
  /**
   * Connexion par empreinte / Face ID. Rejette l'erreur du navigateur si
   * l'employé referme la fenêtre (cf. estAbandon), ou une ErreurApi.
   */
  connecterParEmpreinte: () => Promise<void>
  /** Recharge participant et bénéficiaires (profil) ; silencieux hors ligne. */
  rafraichir: () => Promise<void>
  /** Efface jeton, profil, bons et PDF en cache. */
  deconnecter: (motif?: Exclude<MotifDeconnexion, null>) => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<Session | null>(null)

interface EtatInterne {
  statut: StatutSession
  jeton: string | null
  participant: Participant | null
  beneficiaires: Beneficiaire[]
  motifDeconnexion: MotifDeconnexion
}

const ANONYME: Omit<EtatInterne, 'motifDeconnexion'> = {
  statut: 'anonyme',
  jeton: null,
  participant: null,
  beneficiaires: [],
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatInterne>({
    ...ANONYME,
    statut: 'chargement',
    motifDeconnexion: null,
  })
  // Dernier état connu, lu par les callbacks sans les recréer.
  const etatRef = useRef(etat)
  etatRef.current = etat
  // Incrémentée, de façon synchrone, à chaque déconnexion. etatRef ne suit
  // qu'au rendu suivant : il ne suffit pas à savoir si une déconnexion a eu
  // lieu pendant un await (cf. rafraichir).
  const generation = useRef(0)

  const deconnecter = useCallback(async (motif: Exclude<MotifDeconnexion, null> = 'volontaire') => {
    generation.current += 1
    configurerClient({ jeton: null })
    reinitialiserBons()
    reinitialiserCompte()
    setEtat({ ...ANONYME, motifDeconnexion: motif })
    await Promise.all([effacerSession(), viderCache()])
  }, [])

  const rafraichir = useCallback(async () => {
    const { jeton } = etatRef.current
    if (!jeton) return
    const ma = generation.current
    // Déconnecté pendant un await : ne rien écrire, sans quoi la session
    // effacée serait réenregistrée et rouverte au lancement suivant — pour
    // l'employé suivant sur ce téléphone.
    const toujoursLaMeme = () => generation.current === ma && etatRef.current.jeton === jeton
    try {
      const moi = await lireMoi()
      if (!toujoursLaMeme()) return
      setEtat((e) => ({ ...e, participant: moi.participant, beneficiaires: moi.beneficiaires }))
      const precedente = await lireSession()
      if (!toujoursLaMeme()) return
      await enregistrerSession({
        jeton,
        participant: moi.participant,
        beneficiaires: moi.beneficiaires,
        depuis: precedente?.depuis ?? new Date().toISOString(),
      })
    } catch {
      // Hors ligne ou serveur indisponible : on garde le profil connu. Un
      // 401 a déjà déclenché la déconnexion via le client.
    }
  }, [])

  /** Ouvre la session avec la réponse du serveur (jeton + participant). */
  const ouvrir = useCallback(async ({ jeton, participant }: IdentificationReponse) => {
    configurerClient({ jeton })
    // Bénéficiaires tout de suite : l'accueil et l'assistant en ont besoin.
    // S'ils ne viennent pas (réseau), la session reste ouverte et le profil
    // se complètera au prochain rafraîchissement.
    let beneficiaires: Beneficiaire[] = []
    let profil = participant
    try {
      const moi = await lireMoi()
      beneficiaires = moi.beneficiaires
      profil = moi.participant
    } catch {
      /* complété plus tard */
    }
    await enregistrerSession({
      jeton,
      participant: profil,
      beneficiaires,
      depuis: new Date().toISOString(),
    })
    setEtat({
      statut: 'identifie',
      jeton,
      participant: profil,
      beneficiaires,
      motifDeconnexion: null,
    })
  }, [])

  const identifier = useCallback(
    async (matricule: string, motDePasse: string) => {
      await ouvrir(await identifierApi({ matricule: matricule.trim(), mot_de_passe: motDePasse }))
    },
    [ouvrir],
  )

  const activer = useCallback(
    async (matricule: string, code: string, motDePasse: string) => {
      await ouvrir(
        await activerApi({
          matricule: matricule.trim(),
          code: code.replace(/\s/g, ''),
          mot_de_passe: motDePasse,
        }),
      )
    },
    [ouvrir],
  )

  const connecterParEmpreinte = useCallback(async () => {
    const { options, jeton } = await optionsConnexionCle()
    const reponse = await utiliserCle(options)
    await ouvrir(await connecterParCle(jeton, reponse))
  }, [ouvrir])

  // Démarrage : config.json, puis session enregistrée.
  useEffect(() => {
    let actif = true
    configurerClient({
      // 401 sur un appel authentifié : jeton expiré ou dossier devenu inactif.
      surSessionExpiree: () => {
        if (etatRef.current.jeton) void deconnecter('expiree')
      },
    })
    void (async () => {
      const [config, enregistree] = await Promise.all([chargerConfig(), lireSession()])
      if (!actif) return
      configurerClient({ apiBase: config.apiBase, jeton: enregistree?.jeton ?? null })
      if (enregistree) {
        setEtat({
          statut: 'identifie',
          jeton: enregistree.jeton,
          participant: enregistree.participant,
          beneficiaires: enregistree.beneficiaires,
          motifDeconnexion: null,
        })
      } else {
        setEtat({ ...ANONYME, motifDeconnexion: null })
      }
    })()
    return () => {
      actif = false
    }
  }, [deconnecter])

  // Profil rafraîchi en arrière-plan à chaque ouverture de session.
  useEffect(() => {
    if (etat.statut === 'identifie') void rafraichir()
  }, [etat.statut, rafraichir])

  const valeur = useMemo<Session>(
    () => ({
      statut: etat.statut,
      participant: etat.participant,
      beneficiaires: etat.beneficiaires,
      motifDeconnexion: etat.motifDeconnexion,
      identifier,
      activer,
      connecterParEmpreinte,
      rafraichir,
      deconnecter,
    }),
    [etat, identifier, activer, connecterParEmpreinte, rafraichir, deconnecter],
  )

  return <SessionContext.Provider value={valeur}>{children}</SessionContext.Provider>
}
