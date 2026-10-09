/**
 * Données de l'écran « Détail du bon » : le bon lui-même et son PDF officiel.
 *
 * Tout doit pouvoir s'afficher hors ligne : le bon vient de la liste partagée
 * ou du cache, puis le serveur le rafraîchit ; le PDF déjà vu est relu dans
 * IndexedDB (il n'est téléchargé qu'une fois).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { ErreurApi, estErreurApi, lireBon, telechargerPdfBon } from '../../api'
import { etatBons, memoriserBon, useBonConnu } from '../../data/bons'
import { useOnline } from '../../hooks/useOnline'
import {
  enregistrerPdfEnCache,
  generationCache,
  lireBonEnCache,
  lirePdfEnCache,
} from '../../offline/stockage'
import type { Bon, GenreDocument } from '../../types/api'

function versErreurApi(e: unknown): ErreurApi {
  return estErreurApi(e) ? e : new ErreurApi('inconnue')
}

/** Identifiant de l'URL (/bons/:id, /bons/lettres/:id) → nombre, ou null s'il est illisible. */
export function lireIdentifiant(valeur: string | undefined): number | null {
  if (!valeur || !/^\d+$/.test(valeur)) return null
  const id = Number(valeur)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * Ce qui est imprimé sur le bon. Si l'IPM modifie le bon (autre pharmacie,
 * nombre d'articles…), l'empreinte change et le PDF en cache est périmé.
 */
export function empreinteImpression(bon: Bon): string {
  return JSON.stringify([
    bon.code,
    bon.beneficiaire?.matricule ?? null,
    bon.pharmacie?.code ?? null,
    bon.prestataire?.code ?? null,
    bon.naturePrestation?.code ?? null,
    bon.prescripteur?.code ?? null,
    bon.specialite?.code ?? null,
    bon.nbArticles,
    bon.dateOrdonnance,
    bon.date,
  ])
}

export interface EtatDetailBon {
  /** undefined tant que ni la liste, ni le cache, ni le serveur ne l'ont donné. */
  bon: Bon | undefined
  /** Une requête vers le serveur est en cours. */
  chargement: boolean
  /** Dernier échec (le bon déjà connu reste affiché). */
  erreur: ErreurApi | null
  /** Le serveur ne connaît pas ce bon (ou il n'appartient pas au participant). */
  introuvable: boolean
  recharger: () => Promise<void>
}

export function useDetailBon(genre: GenreDocument, id: number | null): EtatDetailBon {
  const connu = useBonConnu(genre, id ?? -1)
  const [frais, setFrais] = useState<Bon>()
  const [enCache, setEnCache] = useState<Bon>()
  const [chargement, setChargement] = useState(id !== null)
  const [erreur, setErreur] = useState<ErreurApi | null>(null)
  const [introuvable, setIntrouvable] = useState(id === null)

  // Le cache d'abord : ouvert depuis un lien ou hors ligne, avant la liste.
  useEffect(() => {
    if (id === null) return
    let actif = true
    void lireBonEnCache(genre, id).then((bon) => {
      if (actif) setEnCache(bon)
    })
    return () => {
      actif = false
    }
  }, [genre, id])

  const charger = useCallback(
    async (signal?: AbortSignal) => {
      if (id === null) return
      setChargement(true)
      try {
        const bon = await lireBon(genre, id, { signal })
        setFrais(bon)
        setErreur(null)
        setIntrouvable(false)
        // La liste partagée n'est mise à jour que si elle est déjà connue :
        // memoriserBon sur une liste vide remplacerait tout le cache hors
        // ligne par ce seul bon.
        if (etatBons().bons !== null) memoriserBon(bon)
      } catch (e) {
        const erreurApi = versErreurApi(e)
        if (erreurApi.genre === 'annulee') return
        if (erreurApi.genre === 'introuvable') setIntrouvable(true)
        else setErreur(erreurApi)
      } finally {
        if (!signal?.aborted) setChargement(false)
      }
    },
    [genre, id],
  )

  useEffect(() => {
    const controleur = new AbortController()
    void charger(controleur.signal)
    return () => controleur.abort()
  }, [charger])

  const recharger = useCallback(() => charger(), [charger])

  return { bon: connu ?? frais ?? enCache, chargement, erreur, introuvable, recharger }
}

export interface EtatPdfBon {
  /** Le PDF à montrer (cache ou serveur), null tant qu'il n'est pas là. */
  pdf: Blob | null
  chargement: boolean
  erreur: ErreurApi | null
  /** Retélécharge le PDF (bouton « Réessayer », tirer pour rafraîchir). */
  recharger: () => Promise<void>
}

/**
 * Le PDF officiel d'un bon : relu dans le cache s'il a déjà été vu, sinon
 * téléchargé puis mis en cache pour le hors-ligne. Au retour du réseau, un
 * téléchargement qui avait échoué est relancé seul.
 *
 * `empreinte` : celle du bon affiché (empreinteImpression), null tant qu'il
 * n'est pas connu. Elle est enregistrée avec le PDF ; si elle ne correspond
 * plus (l'IPM a modifié le bon depuis, y compris entre deux visites), le PDF
 * est retéléchargé dès que le réseau le permet. Hors ligne, l'ancien PDF
 * reste montré : c'est mieux que rien.
 */
export function usePdfBon(
  genre: GenreDocument,
  id: number | null,
  empreinte: string | null = null,
): EtatPdfBon {
  const enLigne = useOnline()
  const [pdf, setPdf] = useState<Blob | null>(null)
  // Empreinte du bon qu'imprime le PDF affiché (null : inconnue).
  const [empreintePdf, setEmpreintePdf] = useState<string | null>(null)
  const [chargement, setChargement] = useState(id !== null)
  const [erreur, setErreur] = useState<ErreurApi | null>(null)

  // Empreinte à jour lue par le téléchargement, sans le recréer à chaque rendu.
  const empreinteRef = useRef(empreinte)
  empreinteRef.current = empreinte
  // PDF téléchargé ici même avant que le bon soit connu : il est à jour, il
  // ne lui manque que son empreinte (et la génération du cache au départ).
  const frais = useRef<{ generation: number } | null>(null)

  // Tout téléchargement, même relancé à la main ou au retour du réseau, est
  // annulé au démontage (déconnexion comprise) : rien ne doit arriver après.
  const monte = useRef(true)
  const controleurs = useRef(new Set<AbortController>())
  useEffect(() => {
    monte.current = true
    const actifs = controleurs.current
    return () => {
      monte.current = false
      actifs.forEach((controleur) => controleur.abort())
      actifs.clear()
    }
  }, [])

  const telecharger = useCallback(
    async (signalExterne?: AbortSignal) => {
      if (id === null) return
      const controleur = new AbortController()
      signalExterne?.addEventListener('abort', () => controleur.abort(), { once: true })
      controleurs.current.add(controleur)
      const { signal } = controleur
      // Relevées au départ : c'est ce bon-là, dans cette session-là, que le
      // PDF téléchargé imprime.
      const generation = generationCache()
      const empreinteDemandee = empreinteRef.current
      setChargement(true)
      setErreur(null)
      try {
        const blob = await telechargerPdfBon(genre, id, { signal })
        if (signal.aborted || !monte.current) return
        setPdf(blob)
        setEmpreintePdf(empreinteDemandee)
        frais.current = empreinteDemandee === null ? { generation } : null
        await enregistrerPdfEnCache(genre, id, blob, { empreinte: empreinteDemandee, generation })
      } catch (e) {
        const erreurApi = versErreurApi(e)
        if (erreurApi.genre !== 'annulee' && !signal.aborted && monte.current) setErreur(erreurApi)
      } finally {
        controleurs.current.delete(controleur)
        if (!signal.aborted && monte.current) setChargement(false)
      }
    },
    [genre, id],
  )

  useEffect(() => {
    if (id === null) return
    const controleur = new AbortController()
    let actif = true
    void (async () => {
      const enCache = await lirePdfEnCache(genre, id)
      if (!actif) return
      if (enCache) {
        setPdf(enCache.pdf)
        setEmpreintePdf(enCache.empreinte)
        frais.current = null
        setChargement(false)
        return
      }
      await telecharger(controleur.signal)
    })()
    return () => {
      actif = false
      controleur.abort()
    }
  }, [genre, id, telecharger])

  // Le PDF affiché n'imprime pas le bon tel qu'il est connu maintenant (bon
  // modifié par l'IPM, ou PDF mis en cache sans empreinte) : on le
  // retélécharge, une seule fois par empreinte pour ne jamais boucler sur une
  // erreur du serveur.
  const dejaTentee = useRef<string | null>(null)
  useEffect(() => {
    if (id === null || pdf === null || empreinte === null || chargement) return
    if (empreintePdf === empreinte) return
    if (empreintePdf === null && frais.current) {
      // Téléchargé à l'instant, avant que le bon soit connu : inutile de le
      // retélécharger, on lui donne son empreinte.
      const { generation } = frais.current
      frais.current = null
      setEmpreintePdf(empreinte)
      void enregistrerPdfEnCache(genre, id, pdf, { empreinte, generation })
      return
    }
    if (!enLigne || dejaTentee.current === empreinte) return
    dejaTentee.current = empreinte
    void telecharger()
  }, [genre, id, pdf, empreinte, empreintePdf, chargement, enLigne, telecharger])

  // Le réseau revient alors que le PDF n'avait pas pu être téléchargé : on
  // relance une seule fois, au passage hors ligne → en ligne (jamais en
  // boucle sur une erreur du serveur).
  const etaitHorsLigne = useRef(!enLigne)
  useEffect(() => {
    if (!enLigne) {
      etaitHorsLigne.current = true
      return
    }
    if (!etaitHorsLigne.current) return
    etaitHorsLigne.current = false
    if (pdf === null && (erreur?.genre === 'reseau' || erreur?.genre === 'delai'))
      void telecharger()
  }, [enLigne, pdf, erreur, telecharger])

  const recharger = useCallback(() => telecharger(), [telecharger])

  return { pdf, chargement, erreur, recharger }
}
