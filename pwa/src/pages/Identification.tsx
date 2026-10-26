/**
 * Identification (/identification) : matricule + mot de passe mobile.
 *
 * En cas de succès, App.tsx bascule seul sur l'accueil : on ne navigue pas
 * d'ici.
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import {
  alertCircle,
  checkmarkCircleOutline,
  eyeOffOutline,
  eyeOutline,
  idCardOutline,
  lockClosedOutline,
  timeOutline,
} from 'ionicons/icons'
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
  const [motDePasseVisible, setMotDePasseVisible] = useState(false)
  const champMatricule = useRef<HTMLInputElement>(null)
  const champMotDePasse = useRef<HTMLInputElement>(null)

  async function continuer() {
    const issue = await formulaire.envoyer()
    if (issue === 'ok') {
      haptique.succes()
    } else if (issue === 'invalide') {
      haptique.erreur()
      // On amène l'employé là où il manque quelque chose.
      if (formulaire.controle.matricule) champMatricule.current?.focus()
      else champMotDePasse.current?.focus()
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
              Vos documents IPM, dans votre poche.
            </p>

            <OfflineBanner />

            {motifDeconnexion === 'expiree' && (
              <div className="identification__avis identification__avis--attention" role="status">
                <IonIcon icon={timeOutline} aria-hidden="true" />
                <span>Votre session a expiré. Identifiez-vous à nouveau pour continuer.</span>
              </div>
            )}
            {motifDeconnexion === 'volontaire' && (
              <div className="identification__avis" role="status">
                <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
                <span>Vous êtes déconnecté. Les données de ce téléphone ont été effacées.</span>
              </div>
            )}

            {/* Pas de bouton « submit » : l'envoi passe par « Continuer » ou
                par la touche OK du clavier, jamais par un envoi implicite. */}
            <form className="ipm-formulaire" noValidate onSubmit={(e) => e.preventDefault()}>
              <Saisie
                libelle="Matricule"
                placeholder="Ex. 949"
                icone={idCardOutline}
                inputMode="numeric"
                enterKeyHint="next"
                reference={champMatricule}
                valeur={formulaire.matricule}
                erreur={erreurs.matricule}
                onChanger={formulaire.changerMatricule}
                onEntree={() => champMotDePasse.current?.focus()}
              />

              <Saisie
                libelle="Mot de passe"
                placeholder="Votre mot de passe"
                icone={lockClosedOutline}
                type={motDePasseVisible ? 'text' : 'password'}
                inputMode="numeric"
                enterKeyHint="go"
                autoComplete="current-password"
                reference={champMotDePasse}
                valeur={formulaire.motDePasse}
                erreur={erreurs.motDePasse}
                onChanger={formulaire.changerMotDePasse}
                onEntree={() => void continuer()}
                action={
                  <button
                    type="button"
                    className="ipm-formulaire__action ipm-appui"
                    aria-label={
                      motDePasseVisible ? 'Masquer le mot de passe' : 'Voir le mot de passe'
                    }
                    onClick={() => {
                      haptique.leger()
                      setMotDePasseVisible((v) => !v)
                    }}
                  >
                    <IonIcon icon={motDePasseVisible ? eyeOffOutline : eyeOutline} />
                  </button>
                }
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
