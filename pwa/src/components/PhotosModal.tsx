/**
 * Feuille « Photos d'identité » — ouverte depuis l'accueil, à côté de la
 * bascule jour/nuit.
 *
 * L'employé y dote d'un portrait sa propre carte d'adhérent et celle de
 * chacun de ses ayants droit. C'est le SEUL endroit où une photo s'envoie :
 * les cartes elles-mêmes ne se touchent plus, pour qu'on ne change pas une
 * pièce d'identité au moment de la présenter.
 *
 * **Une seule fois.** Une photo posée ne se remplace ni ne se retire depuis le
 * téléphone. Pour la changer, l'employé DEMANDE sa réinitialisation (« Changer ») ;
 * l'IPM l'instruit depuis son application de gestion, et la photo réinitialisée
 * se repose ici comme la première fois. La règle est tenue par le serveur
 * (apps/mobile/views.py) ; l'écran ne fait que la montrer.
 */

import { IonIcon, IonSpinner, useIonToast } from '@ionic/react'
import { addOutline, cameraOutline, hourglassOutline, refreshOutline } from 'ionicons/icons'
import { useEffect, useRef, useState } from 'react'

import { demanderChangementPhoto, messageErreur, poserPhoto, poserPhotoBeneficiaire } from '../api'
import { useOnline } from '../hooks/useOnline'
import { usePhoto } from '../pages/accueil/usePhoto'
import { libelleLien } from '../pages/profil/famille'
import { useParticipant, useSession } from '../session'
import Avatar from './Avatar'
import { useFamille } from './CartePleinEcran'
import Feuille from './Feuille'

interface Props {
  ouverte: boolean
  onFermer: () => void
}

export default function PhotosModal({ ouverte, onFermer }: Props) {
  const { participant } = useParticipant()
  const { rafraichir } = useSession()
  const famille = useFamille()
  const enLigne = useOnline()
  const [presenterToast] = useIonToast()

  // Qui reçoit la photo que le téléphone va rendre : `null` = le titulaire,
  // sinon le matricule de l'ayant droit. En ref et non en état : `choisir()`
  // ouvre le sélecteur dans la foulée, avant tout rendu.
  const cible = useRef<string | null>(null)

  const photo = usePhoto(rafraichir, enLigne, {
    poser: (donnees) =>
      cible.current ? poserPhotoBeneficiaire(cible.current, donnees) : poserPhoto(donnees),
  })

  // À chaque ouverture, la famille se relit : l'IPM a pu réinitialiser une
  // photo ou instruire une demande depuis la dernière visite, et la feuille
  // proposerait sinon « Changer » là où il faut « Ajouter ».
  useEffect(() => {
    if (ouverte && enLigne) void rafraichir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte])

  // Message de l'envoi (succès, ou refus du serveur) en toast, puis oublié.
  useEffect(() => {
    if (!photo.message) return
    void presenterToast({ message: photo.message, duration: 3500, position: 'top' })
    photo.oublierMessage()
  }, [photo, presenterToast])

  // Matricule dont la demande de changement part en ce moment.
  const [demandeEnCours, setDemandeEnCours] = useState<string | null>(null)

  async function demanderChangement(matricule: string) {
    setDemandeEnCours(matricule)
    try {
      await demanderChangementPhoto(matricule)
      await rafraichir()
      void presenterToast({
        message: 'Demande envoyée : l’IPM va réinitialiser la photo.',
        duration: 3500,
        position: 'top',
      })
    } catch (e) {
      void presenterToast({ message: messageErreur(e), duration: 3500, position: 'top' })
    } finally {
      setDemandeEnCours(null)
    }
  }

  function ajouter(matricule: string | null) {
    cible.current = matricule
    photo.choisir()
  }

  const lignes = [
    {
      cle: 'moi',
      matricule: null as string | null,
      nom: participant.nomComplet,
      qualite: 'Vous',
      photo: participant.photo,
      demande: Boolean(participant.demandePhoto),
      // La demande désigne la photo par le matricule de la personne.
      matriculeDemande: participant.matricule,
    },
    ...famille.map((membre) => ({
      cle: membre.matricule,
      matricule: membre.matricule as string | null,
      nom: `${membre.prenoms} ${membre.nom}`.trim(),
      qualite: libelleLien(membre),
      photo: membre.photo,
      demande: Boolean(membre.demandePhoto),
      matriculeDemande: membre.matricule,
    })),
  ]

  return (
    <Feuille
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Photos d’identité"
      icone={cameraOutline}
      className="photos"
    >
      <p className="photos__consigne">
        Ajoutez le portrait qui figurera sur la carte, la vôtre ou celle d’un de vos ayants droit.{' '}
        <strong>Une photo ne s’envoie qu’une fois</strong> : pour la remplacer ensuite, demandez son
        changement, l’IPM la réinitialisera.
      </p>

      <ul className="photos__liste">
        {lignes.map((ligne) => (
          <li key={ligne.cle} className="photos__ligne">
            <Avatar nom={ligne.nom} photo={ligne.photo} taille={48} />
            <span className="photos__personne">
              <span className="photos__nom">{ligne.nom}</span>
              <span className="photos__qualite">{ligne.qualite}</span>
            </span>
            {ligne.photo && ligne.demande ? (
              // La demande attend l'IPM : rien d'autre à faire ici.
              <span className="photos__verrou">
                <IonIcon icon={hourglassOutline} aria-hidden="true" />
                Demande envoyée
              </span>
            ) : ligne.photo ? (
              <button
                type="button"
                className="photos__ajouter ipm-appui"
                disabled={!enLigne || demandeEnCours !== null}
                aria-label={`Demander le changement de la photo de ${ligne.nom}`}
                onClick={() => void demanderChangement(ligne.matriculeDemande)}
              >
                {demandeEnCours === ligne.matriculeDemande ? (
                  <IonSpinner name="crescent" />
                ) : (
                  <IonIcon icon={refreshOutline} aria-hidden="true" />
                )}
                Changer
              </button>
            ) : (
              <button
                type="button"
                className="photos__ajouter ipm-appui"
                disabled={photo.enCours}
                onClick={() => ajouter(ligne.matricule)}
              >
                {photo.enCours ? (
                  <IonSpinner name="crescent" />
                ) : (
                  <IonIcon icon={addOutline} aria-hidden="true" />
                )}
                Ajouter
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Sélecteur de fichier du téléphone, caché : ce sont les boutons
          « Ajouter » qui l'ouvrent. */}
      <input
        ref={photo.inputRef}
        type="file"
        accept="image/*"
        className="photos__fichier"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void photo.surFichier(e.target.files?.[0])}
      />
    </Feuille>
  )
}
