/**
 * Identification (/identification) : le matricule seul.
 *
 * Connexion simplifiée (2026-11-12) : un participant se connecte juste en
 * tapant son matricule, qui sert aussi de mot de passe (cf. le formulaire et
 * mobile.views.IdentificationView). En cas de succès, App.tsx bascule seul
 * sur l'accueil : on ne navigue pas d'ici.
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import {
  alertCircle,
  eyeOffOutline,
  eyeOutline,
  idCardOutline,
  lockClosedOutline,
  timeOutline,
} from 'ionicons/icons'
import { useRef, useState } from 'react'

import { BoutonPrincipal } from '../components/Boutons'
import { Saisie } from '../components/ChampsFormulaire'
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
  // Côté écran seulement : le mot de passe n'est ni vérifié ni envoyé.
  const [motDePasse, setMotDePasse] = useState('')
  const [voirMotDePasse, setVoirMotDePasse] = useState(false)

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
          {/* Le hero : le rouge SAR, habillé de courbes de niveau qui
              bougent doucement, et une vague qui descend vers le fond de
              l'application. */}
          <header className="identification__hero">
            <span className="identification__motif" aria-hidden="true" />
            <svg
              className="identification__vague"
              viewBox="0 0 400 90"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M0 52 C 70 8, 150 6, 205 44 S 330 98, 400 40 L 400 90 L 0 90 Z" />
            </svg>
          </header>

          <main className="identification__corps">
            <div className="identification__entete">
              {/* Le logo de l'IPM, sans fond, à côté du nom de l'institution. */}
              <img
                className="identification__logo-ipm"
                src="/logo-ipm.png"
                alt="IPM"
                width={44}
                height={44}
              />
              <h1 className="identification__titre">IPM-SAR</h1>
            </div>

            <OfflineBanner />

            {motifDeconnexion === 'expiree' && (
              <div className="identification__avis identification__avis--attention" role="status">
                <IonIcon icon={timeOutline} aria-hidden="true" />
                <span>Votre session a expiré. Identifiez-vous à nouveau pour continuer.</span>
              </div>
            )}
            {/* Pas d'avis après une déconnexion volontaire : l'employé vient de la
                demander, l'écran de connexion suffit à la confirmer. */}

            {/* Pas de bouton « submit » : l'envoi passe par « Connexion » ou
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

              {/* Mot de passe : affiché seulement, pas encore vérifié. La
                  connexion se fait toujours par le seul matricule (cf. le
                  formulaire) ; ce champ n'est envoyé nulle part. */}
              <Saisie
                libelle="Mot de passe"
                type={voirMotDePasse ? 'text' : 'password'}
                placeholder="Votre mot de passe"
                icone={lockClosedOutline}
                autoComplete="current-password"
                enterKeyHint="go"
                valeur={motDePasse}
                onChanger={setMotDePasse}
                onEntree={() => void continuer()}
                action={
                  <button
                    type="button"
                    className="ipm-formulaire__action"
                    aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Voir le mot de passe'}
                    onClick={() => setVoirMotDePasse((v) => !v)}
                  >
                    <IonIcon
                      icon={voirMotDePasse ? eyeOffOutline : eyeOutline}
                      aria-hidden="true"
                    />
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
                  {formulaire.envoi ? 'Vérification…' : 'Connexion'}
                </BoutonPrincipal>
              </div>
            </form>
          </main>
        </div>
      </IonContent>
    </IonPage>
  )
}
