/**
 * Écran « Assistance » (/assistance) — SPEC_DESIGN §5 : le mode d'emploi du
 * bon de pharmacie, et les questions que l'employé se pose au comptoir.
 *
 * De haut en bas :
 *   1. bandeau de marque compact (§3.2) avec retour ;
 *   2. « Comment ça marche » en trois étapes illustrées, chacune en carte
 *      autonome (§3.5), suivies du bouton principal (§3.7) qui ouvre
 *      l'assistant — l'aide mène à l'action, elle ne s'arrête pas au texte ;
 *   3. le rappel de la validité de 30 jours, en carte teintée du statut
 *      « valide » ;
 *   4. les questions fréquentes en accordéon SANS FILET (cartes autonomes,
 *      cf. assistance/Accordeon.tsx) ;
 *   5. le renvoi à l'IPM.
 *
 * Aucune coordonnée n'est inventée : ni numéro, ni adresse, ni courriel
 * (cf. assistance/contenu.ts).
 */

import { IonContent, IonPage, useIonRouter } from '@ionic/react'
import { add, businessOutline, timeOutline } from 'ionicons/icons'

import BandeauMarque from '../components/BandeauMarque'
import { BoutonPrincipal } from '../components/Boutons'
import CarteListe from '../components/CarteListe'
import { useNouveauBon } from '../components/NouveauBonModal'
import { useOnline } from '../hooks/useOnline'
import Accordeon from './assistance/Accordeon'
import { ETAPES, QUESTIONS, RENVOI_IPM, VALIDITE_JOURS } from './assistance/contenu'
import './assistance/assistance.css'

export default function Assistance() {
  const routeur = useIonRouter()
  const { ouvrirNouveauBon } = useNouveauBon()
  const enLigne = useOnline()

  return (
    <IonPage className="assistance">
      <IonContent fullscreen>
        <BandeauMarque
          titre="Assistance"
          sousTitre="Le bon de pharmacie, pas à pas"
          onRetour={() => routeur.goBack()}
        />

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Comment ça marche</h2>
          </div>
          <div className="ipm-pile">
            {ETAPES.map((etape, rang) => (
              <CarteListe
                key={etape.cle}
                rang={rang}
                icone={etape.icone}
                teinte="rouge"
                titre={etape.titre}
                details={<span>{etape.texte}</span>}
                meta={`Étape ${rang + 1}`}
              />
            ))}
          </div>

          <div className="assistance__action">
            {/* Créer un bon exige le serveur (c'est l'IPM qui le numérote) :
                hors ligne, le bouton le dit au lieu d'échouer. */}
            <BoutonPrincipal icone={add} disabled={!enLigne} onClick={ouvrirNouveauBon}>
              Demander un bon
            </BoutonPrincipal>
            {!enLigne && (
              <p className="assistance__note">
                Demander un bon exige une connexion : le numéro du bon est attribué par l’IPM.
              </p>
            )}
          </div>
        </section>

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Validité</h2>
          </div>
          <div className="ipm-pile">
            <CarteListe
              icone={timeOutline}
              teinte="valide"
              titre={`Valable ${VALIDITE_JOURS} jours`}
              details={
                <span>
                  Un bon reste valable {VALIDITE_JOURS} jours après sa date d’émission. Passé ce
                  délai, il passe en « Expiré » : demandez-en simplement un nouveau.
                </span>
              }
            />
          </div>
        </section>

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Questions fréquentes</h2>
          </div>
          <Accordeon questions={QUESTIONS} />
        </section>

        <section className="ipm-section">
          <div className="ipm-pile">
            <CarteListe
              icone={businessOutline}
              teinte="neutre"
              titre={RENVOI_IPM.titre}
              details={<span>{RENVOI_IPM.texte}</span>}
            />
          </div>
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}
