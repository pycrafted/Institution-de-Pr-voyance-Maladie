/**
 * Étape 6 : tout relire avant de générer la lettre. Chaque carte se touche
 * pour corriger son étape, puis l'assistant revient ici directement — comme
 * le récapitulatif du bon (pages/NouveauBon/EtapeRecapitulatif).
 */

import { IonIcon } from '@ionic/react'
import {
  businessOutline,
  calendarOutline,
  clipboardOutline,
  informationCircleOutline,
  medkitOutline,
  personOutline,
} from 'ionicons/icons'

import CarteListe from '../../components/CarteListe'
import type { DateISO } from '../../types/api'
import { ajouterJours, age, capitaliser, dateLongue, dateMoyenne } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import Alerte from '../NouveauBon/Alerte'
import { lienBeneficiaire } from '../NouveauBon/assistant'
import { VALIDITE_LETTRE_JOURS, type Etape, type Saisie } from './assistant'

interface Props {
  saisie: Saisie
  aujourdhui: DateISO
  /** Erreur générale du serveur (non rattachée à un champ). */
  erreur?: string
  onModifier: (etape: Etape) => void
}

export default function EtapeRecapitulatif({ saisie, aujourdhui, erreur, onModifier }: Props) {
  const { beneficiaire, specialitePrestataire, prestataire, nature, specialite, prescripteur } =
    saisie
  const valableJusquAu = ajouterJours(aujourdhui, VALIDITE_LETTRE_JOURS)

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

      <div
        className="ipm-pile nouveau-bon__recap"
        role="group"
        aria-label="Récapitulatif de la lettre"
      >
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
          businessOutline,
          'Prestataire',
          prestataire ? nomPropre(prestataire.libelle) : 'À choisir',
          [
            specialitePrestataire ? capitaliser(specialitePrestataire.libelle) : null,
            prestataire?.adresse ? nomPropre(prestataire.adresse) : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        )}
        {carte(
          2,
          3,
          clipboardOutline,
          'Prestation',
          nature ? capitaliser(nature.libelle) : 'À choisir',
          null,
        )}
        {carte(
          3,
          4,
          medkitOutline,
          'Prescripteur',
          prescripteur ? nomPropre(prescripteur.libelle) : 'À choisir',
          specialite ? capitaliser(specialite.libelle) : null,
        )}
        {carte(4, 5, calendarOutline, 'Prescription du', dateLongue(saisie.datePrescription), null)}
      </div>

      <div className="ipm-gouttiere nouveau-bon__bloc">
        <div className="ipm-carte nouveau-bon__info">
          <IonIcon icon={informationCircleOutline} aria-hidden="true" />
          <p>
            La lettre sera valable {VALIDITE_LETTRE_JOURS} jours, jusqu’au{' '}
            <strong className="ipm-chiffres">{dateMoyenne(valableJusquAu)}</strong>. Présentez-la au
            prestataire, sur votre téléphone ou imprimée.
          </p>
        </div>
      </div>
    </>
  )
}
