/**
 * Choisir, envoyer et retirer sa photo d'identité.
 *
 * L'employé touche son portrait sur la carte d'adhérent de l'accueil ; le
 * téléphone ouvre sa galerie ou son appareil photo, l'image est réduite ici
 * même (320 px, cf. utils/photo.ts) puis envoyée. Le profil est ensuite
 * rafraîchi : la photo revient du serveur, et c'est elle qui s'affiche — sur
 * l'accueil comme sur la fiche du participant dans l'application IPM.
 *
 * Rien n'est tenté hors ligne : une photo envoyée dans le vide laisserait
 * croire au changement. Le bouton le dit plutôt que d'échouer en silence.
 */

import { useCallback, useRef, useState, type MutableRefObject } from 'react'

import { ErreurApi, poserPhoto, retirerPhoto } from '../../api'
import { haptique } from '../../hooks/haptique'
import { ErreurPhoto, reduirePhoto } from '../../utils/photo'

export interface Photo {
  /** Envoi (ou retrait) en cours : le portrait montre son attente. */
  enCours: boolean
  /** Message à présenter en toast, effacé par `oublierMessage`. */
  message: string | null
  /** Ouvre le sélecteur de fichier du téléphone. */
  choisir: () => void
  /** Retire la photo enregistrée. */
  retirer: () => Promise<void>
  /** À poser sur un <input type="file"> caché. */
  surFichier: (fichier: File | undefined | null) => Promise<void>
  inputRef: MutableRefObject<HTMLInputElement | null>
  oublierMessage: () => void
}

export function usePhoto(rafraichir: () => Promise<void>, enLigne: boolean): Photo {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const choisir = useCallback(() => {
    if (!enLigne) {
      setMessage('Connexion nécessaire pour changer votre photo.')
      return
    }
    haptique.leger()
    inputRef.current?.click()
  }, [enLigne])

  const surFichier = useCallback(
    async (fichier: File | undefined | null) => {
      // Le champ garde le dernier fichier : le vider permet de rechoisir le
      // même après une erreur.
      if (inputRef.current) inputRef.current.value = ''
      if (!fichier) return
      setEnCours(true)
      try {
        const reduite = await reduirePhoto(fichier)
        await poserPhoto(reduite)
        await rafraichir()
        haptique.succes()
        setMessage('Photo mise à jour.')
      } catch (e) {
        setMessage(messageErreur(e))
      } finally {
        setEnCours(false)
      }
    },
    [rafraichir],
  )

  const retirer = useCallback(async () => {
    setEnCours(true)
    try {
      await retirerPhoto()
      await rafraichir()
      setMessage('Photo retirée.')
    } catch (e) {
      setMessage(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }, [rafraichir])

  return {
    enCours,
    message,
    choisir,
    retirer,
    surFichier,
    inputRef,
    oublierMessage: useCallback(() => setMessage(null), []),
  }
}

function messageErreur(e: unknown): string {
  // Erreur de l'image (mauvais fichier, trop lourd) : le message est déjà
  // écrit pour l'employé.
  if (e instanceof ErreurPhoto) return e.message
  if (e instanceof ErreurApi) return e.message
  return 'Photo non enregistrée. Réessayez.'
}
