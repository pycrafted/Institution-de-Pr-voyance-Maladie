/**
 * Écran « À propos » (/a-propos), ouvert depuis le profil. Même présentation
 * que l'écran « Assistance » : bandeau compact avec retour, puis des sections
 * de cartes autonomes.
 */

import { IonContent, IonPage, useIonRouter } from '@ionic/react'
import {
  businessOutline,
  cloudOfflineOutline,
  informationCircleOutline,
  logOutOutline,
} from 'ionicons/icons'

import CarteListe from '../components/CarteListe'
import EnteteEcran from '../components/EnteteEcran'
import { VERSION } from '../version'
import './assistance/assistance.css'

export default function APropos() {
  const routeur = useIonRouter()

  return (
    <IonPage className="assistance">
      <IonContent fullscreen>
        <EnteteEcran titre="À propos" sousTitre="IPM Mobile" onRetour={() => routeur.goBack()} />

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">L’application</h2>
          </div>
          <div className="ipm-pile">
            <CarteListe
              rang={0}
              icone={informationCircleOutline}
              teinte="rouge"
              titre="Version"
              details={<span>IPM Mobile, sur téléphone et tablette.</span>}
              meta={<span className="ipm-chiffres">{VERSION}</span>}
            />
            <CarteListe
              rang={1}
              icone={businessOutline}
              teinte="rouge"
              titre="IPM SAR"
              details={<span>L’Institution de Prévoyance Maladie de la SAR.</span>}
            />
          </div>
        </section>

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Vos données</h2>
          </div>
          <div className="ipm-pile">
            <CarteListe
              rang={2}
              icone={cloudOfflineOutline}
              teinte="rouge"
              titre="Consultables sans connexion"
              details={<span>Vos derniers bons restent enregistrés sur ce téléphone.</span>}
            />
            <CarteListe
              rang={3}
              icone={logOutOutline}
              teinte="rouge"
              titre="Effacées à la déconnexion"
              details={<span>Rien ne reste sur le téléphone une fois déconnecté.</span>}
            />
          </div>
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}
