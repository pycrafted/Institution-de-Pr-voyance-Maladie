/**
 * Une carte - celle du titulaire ou celle d'un ayant droit - en plein écran
 * et en paysage.
 *
 * On l'ouvre pour la TENDRE au prestataire (pharmacie, clinique…) : le
 * téléphone se tient à l'horizontale, la carte occupe toute la largeur et se
 * lit comme une carte physique. La « scène » pivote d'un quart de tour ; la
 * croix de fermeture, elle, reste dans le coin de l'écran.
 *
 * La carte ne se MODIFIE pas d'ici : son portrait ne se touche pas. Une pièce
 * d'identité ne se change pas au moment où on la présente au prestataire, et
 * une photo ne s'envoie qu'une fois - cela se fait depuis la feuille « Photos
 * d'identité » de l'accueil (components/PhotosModal).
 *
 * On lui passe une CIBLE et non une fiche : `'moi'` pour le titulaire, sinon
 * le matricule d'un ayant droit. La fiche est redérivée à chaque rendu, si
 * bien qu'une photo fraîchement posée apparaît sans rien faire de plus.
 */

import { IonIcon, IonModal } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useMemo } from 'react'

import { libelleLisible } from '../pages/accueil/accueil-utils'
import { libelleLien } from '../pages/profil/famille'
import { useParticipant } from '../session'
import { matriculeSansSociete } from '../utils/format'
import CarteIdentite from './CarteIdentite'

/** Le titulaire lui-même. Aucun matricule d'ayant droit ne vaut « moi ». */
export const MOI = 'moi'

interface Props {
  /** `MOI`, le matricule d'un ayant droit, ou `null` si rien n'est ouvert. */
  cible: string | null
  onFermer: () => void
}

/** Les ayants droit du participant : le titulaire a déjà sa propre carte. */
export function useFamille() {
  const { beneficiaires } = useParticipant()
  return useMemo(
    () => beneficiaires.filter((beneficiaire) => !beneficiaire.estParticipant),
    [beneficiaires],
  )
}

export default function CartePleinEcran({ cible, onFermer }: Props) {
  const { participant } = useParticipant()
  const famille = useFamille()
  const societe = libelleLisible(participant.societe?.libelle)

  // L'ayant droit ouvert, redérivé de la liste à jour (et non figé à
  // l'ouverture) ; `null` quand c'est la carte du titulaire qu'on montre.
  const membre = useMemo(
    () => famille.find((beneficiaire) => beneficiaire.matricule === cible) ?? null,
    [famille, cible],
  )
  const ouverte = cible === MOI || membre !== null

  return (
    <IonModal className="carte-plein" isOpen={ouverte} onDidDismiss={onFermer}>
      <div className="carte-plein__contenu">
        <button
          type="button"
          className="carte-plein__fermer ipm-appui"
          aria-label="Fermer"
          onClick={onFermer}
        >
          <IonIcon icon={closeOutline} aria-hidden="true" />
        </button>
        {ouverte && (
          <div className="carte-plein__scene">
            {membre ? (
              <CarteIdentite
                className="carte-plein__carte"
                intitule="Carte d’ayant droit"
                nom={membre.nom}
                prenoms={membre.prenoms}
                matricule={matriculeSansSociete(membre.matricule)}
                qualite={libelleLien(membre)}
                societe={societe || undefined}
                rattachement={`${participant.nomComplet} · ${participant.matriculeAffiche}`}
                photo={membre.photo}
              />
            ) : (
              /* La carte du titulaire : exactement celle de l'accueil, en
                 grand et pivotée. */
              <CarteIdentite
                className="carte-plein__carte"
                nom={participant.nom}
                prenoms={participant.prenoms}
                matricule={participant.matricule}
                dateNaissance={participant.dateNaissance}
                societe={societe || undefined}
                photo={participant.photo}
              />
            )}
          </div>
        )}
      </div>
    </IonModal>
  )
}
