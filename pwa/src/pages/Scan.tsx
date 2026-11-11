/**
 * Écran « Scan » (/scan) : point d'entrée du pré-financement - scan de
 * l'ordonnance et du reçu. Pour l'instant un placeholder : le parcours (caméra,
 * vérification par l'IA, versement) reste à construire.
 */

import { IonContent, IonPage } from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'

import EtatVide from '../components/EtatVide'

export default function Scan() {
  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ipm-zone-sure" />
        <EtatVide
          icone={cameraOutline}
          teinte="neutre"
          titre="Scanner pour un pré-financement"
          message="Ici, l'employé scannera l'ordonnance et le reçu pour déclencher une avance de l'IPM. Le parcours complet (caméra, vérification, versement) est en cours de construction."
        />
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}
