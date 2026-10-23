/**
 * Choisir et envoyer une photo d'identité — la sienne ou celle d'un ayant droit.
 *
 * L'employé ouvre la feuille « Photos d'identité » depuis l'accueil ; le
 * téléphone ouvre sa galerie ou son appareil photo, l'image est réduite ici
 * même (320 px, cf. utils/photo.ts) puis envoyée. Le profil est ensuite
 * rafraîchi : la photo revient du serveur, et c'est elle qui s'affiche — sur
 * l'accueil comme sur la fiche du participant dans l'application IPM.
 *
 * Pas de retrait : une photo ne se pose qu'une fois, et seule l'IPM peut la
 * réinitialiser. Le serveur refuse le second envoi, et son message est
 * présenté tel quel.
 *
 * Rien n'est tenté hors ligne : une photo envoyée dans le vide laisserait
 * croire au changement. Le bouton le dit plutôt que d'échouer en silence.
 */

import { useCallback, useRef, useState, type MutableRefObject } from 'react'

import { ErreurApi, poserPhoto } from '../../api'
import { haptique } from '../../hooks/haptique'
import { ErreurPhoto, reduirePhoto } from '../../utils/photo'

export interface Photo {
  /** Envoi en cours : la ligne montre son attente. */
  enCours: boolean
  /** Message à présenter en toast, effacé par `oublierMessage`. */
  message: string | null
  /** Ouvre le sélecteur de fichier du téléphone. */
  choisir: () => void
  /** À poser sur un <input type="file"> caché. */
  surFichier: (fichier: File | undefined | null) => Promise<void>
  inputRef: MutableRefObject<HTMLInputElement | null>
  oublierMessage: () => void
}

/**
 * De quoi viser une autre photo que celle du titulaire : la même mécanique
 * sert à poser la photo d'un ayant droit (cf. poserPhotoBeneficiaire). Par
 * défaut, c'est la photo du participant.
 */
interface CiblePhoto {
  poser?: (photo: string) => Promise<unknown>
}

export function usePhoto(
  rafraichir: () => Promise<void>,
  enLigne: boolean,
  cible: CiblePhoto = {},
): Photo {
  const { poser = poserPhoto } = cible
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const choisir = useCallback(() => {
    if (!enLigne) {
      setMessage('Connexion nécessaire pour envoyer une photo.')
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
        await poser(reduite)
        await rafraichir()
        haptique.succes()
        setMessage('Photo enregistrée.')
      } catch (e) {
        setMessage(messageErreur(e))
      } finally {
        setEnCours(false)
      }
    },
    [rafraichir, poser],
  )

  return {
    enCours,
    message,
    choisir,
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
