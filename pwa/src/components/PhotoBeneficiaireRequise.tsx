/**
 * Dans les assistants de bon (pharmacie, optique) : le bénéficiaire choisi
 * n'a pas encore de photo d'identité ? Le formulaire la demande ici, avant de
 * générer le bon - elle est imprimée dessus, et le pharmacien ou l'opticien
 * vérifie que c'est bien la personne qui se présente.
 *
 * Même mécanique que la page « Identité » (usePhoto) : le téléphone ouvre
 * son appareil photo ou sa galerie, l'image est réduite puis envoyée - pour
 * l'employé lui-même ou pour l'ayant droit choisi. La famille est ensuite
 * relue : la photo revenue du serveur fait disparaître l'encadré.
 *
 * `photoManquante` dit à l'assistant s'il doit bloquer l'envoi du bon.
 */

import { IonIcon } from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { poserPhoto, poserPhotoBeneficiaire } from '../api'
import { useOnline } from '../hooks/useOnline'
import { usePhoto } from '../pages/accueil/usePhoto'
import { useSession } from '../session'
import type { Beneficiaire } from '../types/api'
import { nomPropre } from '../utils/libelles'
import Avatar from './Avatar'
import { BoutonSecondaire } from './Boutons'

/** Vrai si ce bénéficiaire (tel que la famille à jour le connaît) n'a pas de photo. */
// eslint-disable-next-line react-refresh/only-export-components
export function photoManquante(
  choisi: Beneficiaire | null,
  famille: readonly Beneficiaire[],
): boolean {
  if (!choisi) return false
  const aJour = famille.find((b) => b.matricule === choisi.matricule) ?? choisi
  return !aJour.photo
}

interface Props {
  beneficiaire: Beneficiaire | null
  /** Le formulaire est figé (envoi en cours, bon créé). */
  fige?: boolean
}

export default function PhotoBeneficiaireRequise({ beneficiaire, fige = false }: Props) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  const [message, setMessage] = useState<string | null>(null)
  const photo = usePhoto(rafraichir, enLigne, {
    poser: (donnees) =>
      !beneficiaire || beneficiaire.estParticipant
        ? poserPhoto(donnees)
        : poserPhotoBeneficiaire(beneficiaire.matricule, donnees),
  })

  // Le message de l'envoi (erreur, ou « Photo enregistrée ») reste sous le bouton.
  useEffect(() => {
    if (!photo.message) return
    setMessage(photo.message)
    photo.oublierMessage()
  }, [photo])

  if (!beneficiaire || !photoManquante(beneficiaire, beneficiaires)) return null

  const nom = nomPropre(beneficiaire.nomComplet)
  const pourQui = beneficiaire.estParticipant ? 'votre photo' : `la photo de ${nom}`

  return (
    <div className="photo-requise" role="group" aria-label="Photo du bénéficiaire">
      <div className="photo-requise__entete">
        <Avatar nom={beneficiaire.nomComplet} taille={44} forme="identite" />
        <div className="photo-requise__texte">
          <p className="photo-requise__titre">Photo du bénéficiaire requise</p>
          <p className="photo-requise__note">
            Ajoutez {pourQui} pour générer le document. Cette photo figurera sur le document afin de
            permettre au prestataire de santé d’identifier le bénéficiaire.
          </p>
        </div>
      </div>
      <BoutonSecondaire
        icone={cameraOutline}
        occupe={photo.enCours}
        disabled={fige}
        onClick={() => {
          setMessage(null)
          photo.choisir()
        }}
      >
        {beneficiaire.estParticipant ? 'Ajouter ma photo' : 'Ajouter sa photo'}
      </BoutonSecondaire>
      {message && (
        <p className="photo-requise__message" role="status">
          <IonIcon icon={cameraOutline} aria-hidden="true" /> {message}
        </p>
      )}
      <input
        ref={photo.inputRef}
        type="file"
        accept="image/*"
        className="photo-requise__fichier"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void photo.surFichier(e.target.files?.[0])}
      />
    </div>
  )
}
