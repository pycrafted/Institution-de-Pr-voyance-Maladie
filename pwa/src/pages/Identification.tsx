/**
 * Identification (/identification) : le matricule seul.
 *
 * Connexion simplifiée (2026-11-12) : un participant se connecte juste en
 * tapant son matricule, qui sert aussi de mot de passe (cf. le formulaire et
 * mobile.views.IdentificationView). En cas de succès, App.tsx bascule seul
 * sur l'accueil : on ne navigue pas d'ici.
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import { alertCircle, idCardOutline, timeOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'

import { BoutonPrincipal } from '../components/Boutons'
import { Saisie } from '../components/ChampsFormulaire'
import LogoSar from '../components/LogoSar'
import OfflineBanner from '../components/OfflineBanner'
import { haptique } from '../hooks/haptique'
import { useSession } from '../session'
import { useFormulaireIdentification } from './identification/formulaire'
import './identification/identification.css'

export default function Identification() {
  const { identifier, motifDeconnexion } = useSession()
  const formulaire = useFormulaireIdentification(identifier)
  const { erreurs } = formulaire
  // Change à chaque refus : rejoue la secousse du message d'erreur.
  const [refus, setRefus] = useState(0)
  const champMatricule = useRef<HTMLInputElement>(null)

  async function continuer() {
    const issue = await formulaire.envoyer()
    if (issue === 'ok') {
      haptique.succes()
    } else if (issue === 'invalide') {
      haptique.erreur()
      champMatricule.current?.focus()
    } else if (issue === 'refuse') {
      haptique.erreur()
      setRefus((n) => n + 1)
    }
  }

  return (
    <IonPage className="identification">
      <IonContent fullscreen>
        <div className="identification__page">
          {/* Ce que l'employé vient chercher : sa carte. Deux cartes posées
              l'une sur l'autre, vierges - aucune donnée avant d'être
              identifié - celle du dessus porte la marque. */}
          <div className="identification__cartes" aria-hidden="true">
            <span className="identification__carte identification__carte--dessous" />
            <span className="identification__carte identification__carte--dessus">
              <span className="identification__filigrane" />
              <LogoSar largeur={66} ton="blanc" />
              <span className="identification__lignes">
                <i />
                <i />
              </span>
            </span>
          </div>

          <main className="identification__corps">
            <h1 className="identification__titre">Connexion</h1>
            <p className="identification__accroche">
              Saisissez votre matricule pour accéder à vos documents IPM.
            </p>

            <OfflineBanner />

            {motifDeconnexion === 'expiree' && (
              <div className="identification__avis identification__avis--attention" role="status">
                <IonIcon icon={timeOutline} aria-hidden="true" />
                <span>Votre session a expiré. Identifiez-vous à nouveau pour continuer.</span>
              </div>
            )}
            {/* Pas d'avis après une déconnexion volontaire : l'employé vient de la
                demander, l'écran de connexion suffit à la confirmer. */}

            {/* Pas de bouton « submit » : l'envoi passe par « Continuer » ou
                par la touche OK du clavier, jamais par un envoi implicite. */}
            <form className="ipm-formulaire" noValidate onSubmit={(e) => e.preventDefault()}>
              <Saisie
                libelle="Matricule"
                placeholder="Ex. 949"
                icone={idCardOutline}
                inputMode="numeric"
                enterKeyHint="go"
                reference={champMatricule}
                valeur={formulaire.matricule}
                erreur={erreurs.matricule}
                onChanger={formulaire.changerMatricule}
                onEntree={() => void continuer()}
              />

              {formulaire.erreurServeur && (
                <div key={refus} className="identification__erreur" role="alert">
                  <IonIcon icon={alertCircle} aria-hidden="true" />
                  <span>{formulaire.erreurServeur}</span>
                </div>
              )}

              <div className="identification__actions">
                <BoutonPrincipal occupe={formulaire.envoi} onClick={() => void continuer()}>
                  {formulaire.envoi ? 'Vérification…' : 'Continuer'}
                </BoutonPrincipal>
              </div>
            </form>

            <p className="identification__institution">Institution de Prévoyance Maladie</p>
          </main>
        </div>
      </IonContent>
    </IonPage>
  )
}
