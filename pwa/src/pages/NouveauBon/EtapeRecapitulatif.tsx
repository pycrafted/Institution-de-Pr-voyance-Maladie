/**
 * Étape 5 : tout relire avant de générer le bon. Chaque CARTE se touche pour
 * corriger son étape, puis l'assistant revient ici directement.
 *
 * Refonte : cinq cartes autonomes (§3.5) au lieu d'un `IonList` dont les
 * lignes étaient séparées par un filet gris (§1). Sur chaque carte, la
 * rubrique en 11/700 majuscules au-dessus de la valeur — c'est une fiche de
 * relecture, pas une rangée « libellé à gauche / valeur à droite ».
 */

import { IonIcon } from '@ionic/react'
import {
  calendarOutline,
  informationCircleOutline,
  listOutline,
  medkitOutline,
  personOutline,
  storefrontOutline,
} from 'ionicons/icons'

import CarteListe from '../../components/CarteListe'
import type { DateISO } from '../../types/api'
import {
  ajouterJours,
  age,
  capitaliser,
  dateLongue,
  dateMoyenne,
  pluriel,
} from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import Alerte from './Alerte'
import { lienBeneficiaire, VALIDITE_BON_JOURS, type Etape, type Saisie } from './assistant'

interface Props {
  saisie: Saisie
  aujourdhui: DateISO
  /** Erreur générale du serveur (non rattachée à un champ). */
  erreur?: string
  onModifier: (etape: Etape) => void
}

export default function EtapeRecapitulatif({ saisie, aujourdhui, erreur, onModifier }: Props) {
  const { beneficiaire, specialite, prescripteur, pharmacie } = saisie
  const valableJusquAu = ajouterJours(aujourdhui, VALIDITE_BON_JOURS)

  const carte = (
    rang: number,
    etape: Etape,
    icone: string,
    rubrique: string,
    valeur: string,
    detail: string | null,
  ) => (
    <CarteListe
      key={rubrique}
      rang={rang}
      icone={icone}
      teinte="neutre"
      titre={
        <>
          <span className="nouveau-bon__rubrique">{rubrique}</span>
          <span className="nouveau-bon__valeur">{valeur}</span>
        </>
      }
      details={detail}
      etiquette={`${rubrique} : ${valeur}${detail ? `, ${detail}` : ''}. Modifier`}
      onClick={() => onModifier(etape)}
    />
  )

  return (
    <>
      {erreur && (
        <div className="ipm-gouttiere">
          <Alerte message={erreur} />
        </div>
      )}

      <div className="ipm-pile nouveau-bon__recap" role="group" aria-label="Récapitulatif du bon">
        {carte(
          0,
          1,
          personOutline,
          'Bénéficiaire',
          beneficiaire ? nomPropre(beneficiaire.nomComplet) : 'À choisir',
          beneficiaire
            ? [lienBeneficiaire(beneficiaire), age(beneficiaire.age)].filter(Boolean).join(' · ')
            : null,
        )}
        {carte(
          1,
          2,
          medkitOutline,
          'Prescripteur',
          prescripteur ? nomPropre(prescripteur.libelle) : 'À choisir',
          specialite ? capitaliser(specialite.libelle) : null,
        )}
        {carte(
          2,
          3,
          storefrontOutline,
          'Pharmacie',
          pharmacie ? nomPropre(pharmacie.libelle) : 'À choisir',
          pharmacie?.adresse ? nomPropre(pharmacie.adresse) : null,
        )}
        {carte(3, 4, calendarOutline, 'Ordonnance du', dateLongue(saisie.dateOrdonnance), null)}
        {carte(
          4,
          4,
          listOutline,
          'Articles prescrits',
          pluriel(saisie.nbArticles, 'article'),
          null,
        )}
      </div>

      {/* Ce que l'employé obtiendra : une note, dans une carte comme le reste. */}
      <div className="ipm-gouttiere nouveau-bon__bloc">
        <div className="ipm-carte nouveau-bon__info">
          <IonIcon icon={informationCircleOutline} aria-hidden="true" />
          <p>
            Le bon sera valable {VALIDITE_BON_JOURS} jours, jusqu’au{' '}
            <strong className="ipm-chiffres">{dateMoyenne(valableJusquAu)}</strong>. Présentez-le à
            la pharmacie, sur votre téléphone ou imprimé.
          </p>
        </div>
      </div>
    </>
  )
}
