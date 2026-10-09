/**
 * Identification (/identification, SPEC_DESIGN §5) : bandeau de marque plein
 * (logo SAR, « IPM Mobile », accroche), puis une carte blanche flottante qui
 * REMONTE de 28 px sur le bandeau — c'est ce chevauchement qui donne la
 * profondeur d'une application. Dans la carte : les deux champs de la charte
 * (§3.8), le bouton principal (§3.7) et l'aide « Où trouver mon matricule ? ».
 *
 * Ce qui a disparu, et pourquoi : la liste blanche `IonList inset` dont les
 * deux champs étaient séparés par un FILET gris (§1, première interdiction),
 * et l'écran entièrement gris-blanc sans une seule surface de marque.
 *
 * Le serveur vérifie le couple matricule + mot de passe mobile et rend un
 * jeton. En cas de succès, App.tsx bascule seul sur l'accueil :
 * on ne navigue pas d'ici.
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import {
  alertCircle,
  checkmarkCircleOutline,
  helpCircleOutline,
  idCardOutline,
  lockClosedOutline,
  timeOutline,
} from 'ionicons/icons'
import { useRef, useState } from 'react'

import BandeauMarque from '../components/BandeauMarque'
import { BoutonPrincipal } from '../components/Boutons'
import Champ from '../components/Champ'
import Feuille from '../components/Feuille'
import OfflineBanner from '../components/OfflineBanner'
import { haptique } from '../hooks/haptique'
import { useSession } from '../session'
import { VERSION } from '../version'
import { useFormulaireIdentification } from './identification/formulaire'
import './identification/identification.css'

/** Accroche du bandeau : ce que l'application fait, en une ligne. */
const ACCROCHE = 'Vos documents de prise en charge IPM, dans votre poche.'

export default function Identification() {
  const { identifier, motifDeconnexion } = useSession()
  const formulaire = useFormulaireIdentification(identifier)
  const { erreurs } = formulaire
  const [aideOuverte, setAideOuverte] = useState(false)
  // Change à chaque refus : rejoue la petite secousse du message d'erreur.
  const [refus, setRefus] = useState(0)
  const champMatricule = useRef<HTMLIonInputElement>(null)
  const champMotDePasse = useRef<HTMLIonInputElement>(null)

  async function continuer() {
    const issue = await formulaire.envoyer()
    if (issue === 'ok') {
      haptique.succes()
    } else if (issue === 'invalide') {
      haptique.erreur()
      // On amène l'employé là où il manque quelque chose.
      if (formulaire.controle.matricule) {
        // setFocus n'existe qu'une fois le composant Ionic chargé : jamais d'erreur pour un focus.
        champMatricule.current?.setFocus?.().catch(() => undefined)
      } else {
        champMotDePasse.current?.setFocus?.().catch(() => undefined)
      }
    } else if (issue === 'refuse') {
      haptique.erreur()
      setRefus((n) => n + 1)
    }
  }

  return (
    <IonPage className="identification">
      <IonContent fullscreen>
        {/* §5 : le bandeau plein porte la marque ; sa variante « chevauche »
            réserve la hauteur que la carte viendra recouvrir. */}
        <BandeauMarque variante="plein" chevauche titre="IPM Mobile" sousTitre={ACCROCHE} />

        <div className="identification__chevauchement">
          <div className="ipm-carte ipm-carte--flottante identification__carte">
            <h2 className="identification__titre">Bienvenue</h2>
            <p className="identification__intro">
              Identifiez-vous pour demander et consulter vos bons et lettres de garantie IPM.
            </p>

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

            {/* Pas de bouton « submit » : l'envoi passe par le seul appui sur
                « Continuer » (ou « OK » du clavier sur le mot de passe), jamais
                par un envoi implicite du formulaire. */}
            <form noValidate onSubmit={(evenement) => evenement.preventDefault()}>
              <Champ
                libelle="Matricule"
                placeholder="Ex. 949"
                icone={idCardOutline}
                inputmode="numeric"
                enterkeyhint="next"
                reference={champMatricule}
                valeur={formulaire.matricule}
                erreur={erreurs.matricule}
                onChanger={formulaire.changerMatricule}
                onEntree={() => champMotDePasse.current?.setFocus?.().catch(() => undefined)}
              />

              <Champ
                libelle="Mot de passe"
                placeholder="Votre mot de passe"
                icone={lockClosedOutline}
                type="password"
                inputmode="numeric"
                enterkeyhint="go"
                autocomplete="current-password"
                reference={champMotDePasse}
                valeur={formulaire.motDePasse}
                erreur={erreurs.motDePasse}
                onChanger={formulaire.changerMotDePasse}
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
                <button
                  type="button"
                  className="identification__aide"
                  onClick={() => {
                    haptique.leger()
                    setAideOuverte(true)
                  }}
                >
                  <IonIcon icon={helpCircleOutline} aria-hidden="true" />
                  Où trouver mon matricule ?
                </button>
              </div>
            </form>
          </div>
        </div>

        <OfflineBanner />

        <footer className="identification__pied">
          <p>Votre mot de passe vous est remis par l’IPM.</p>
          <p className="identification__version">IPM SAR · IPM Mobile {VERSION}</p>
        </footer>
      </IonContent>

      {/* Une explication se donne dans une feuille (§3.9), jamais dans une
          boîte de dialogue carrée. */}
      <Feuille
        ouverte={aideOuverte}
        onFermer={() => setAideOuverte(false)}
        titre="Où trouver mon matricule ?"
        icone={idCardOutline}
      >
        <p className="identification__aide-texte">
          Il figure sur votre carte IPM et sur votre bulletin de paie, par exemple{' '}
          <span className="ipm-chiffres">949</span>.
        </p>
        <p className="identification__aide-texte">En cas de doute, rapprochez-vous de l’IPM.</p>
        <BoutonPrincipal onClick={() => setAideOuverte(false)}>Compris</BoutonPrincipal>
      </Feuille>
    </IonPage>
  )
}
