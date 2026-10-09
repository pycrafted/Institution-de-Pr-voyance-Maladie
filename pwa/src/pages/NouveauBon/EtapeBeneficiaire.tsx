/**
 * Étape 1 : pour qui est l'ordonnance ? Une CARTE DE LISTE de la charte
 * (§3.5) par membre de la famille — le participant d'abord — avec sa pastille
 * aux initiales, son lien et son âge. Toucher une carte la choisit et passe à
 * l'étape suivante.
 *
 * Plus d'`IonCard` maison ici : la carte de liste porte déjà le rayon 22,
 * l'ombre douce, l'effet d'appui et l'apparition échelonnée de la charte.
 * Seule la marque du choix (liseré rouge + coche) est propre à l'assistant.
 */

import { IonIcon } from '@ionic/react'
import { checkmarkCircle, peopleOutline } from 'ionicons/icons'

import Avatar from '../../components/Avatar'
import CarteListe from '../../components/CarteListe'
import EtatVide from '../../components/EtatVide'
import { SqueletteCarte } from '../../components/Skeletons'
import type { Beneficiaire } from '../../types/api'
import { age } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import { lienBeneficiaire } from './assistant'

interface Props {
  beneficiaires: Beneficiaire[]
  /** La famille n'est pas encore connue (profil en cours de chargement). */
  chargement: boolean
  onReessayer: () => void
  selection: string | null
  onChoisir: (beneficiaire: Beneficiaire) => void
}

export default function EtapeBeneficiaire({
  beneficiaires,
  chargement,
  onReessayer,
  selection,
  onChoisir,
}: Props) {
  if (beneficiaires.length === 0) {
    if (chargement) {
      return (
        <div className="ipm-pile">
          <SqueletteCarte hauteur={76} />
          <SqueletteCarte hauteur={76} />
        </div>
      )
    }
    return (
      <EtatVide
        icone={peopleOutline}
        teinte="neutre"
        titre="Famille indisponible"
        message="Votre famille n’a pas pu être chargée. Vérifiez votre connexion puis réessayez."
        action={{ libelle: 'Réessayer', onClick: onReessayer }}
      />
    )
  }

  return (
    <div
      className="ipm-pile"
      role="list"
      aria-label="Membres de votre famille"
      data-liste="beneficiaires"
    >
      {beneficiaires.map((beneficiaire, rang) => {
        const choisi = beneficiaire.matricule === selection
        const nom = nomPropre(beneficiaire.nomComplet)
        const details = [lienBeneficiaire(beneficiaire), age(beneficiaire.age)]
          .filter(Boolean)
          .join(' · ')
        return (
          <div role="listitem" key={beneficiaire.matricule}>
            <CarteListe
              rang={rang}
              vignette={<Avatar nom={beneficiaire.nomComplet} taille={44} />}
              titre={nom}
              details={details}
              etiquette={`${nom}, ${details}${choisi ? '. Choix actuel' : ''}`}
              className={choisi ? 'nouveau-bon__carte--choisie' : undefined}
              chevron={!choisi}
              puce={
                choisi ? (
                  <IonIcon
                    className="nouveau-bon__coche"
                    icon={checkmarkCircle}
                    aria-hidden="true"
                  />
                ) : undefined
              }
              onClick={() => onChoisir(beneficiaire)}
            />
          </div>
        )
      })}
    </div>
  )
}
