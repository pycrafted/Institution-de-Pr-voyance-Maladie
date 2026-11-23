/**
 * Identification (/identification).
 *
 * Deux façons d'entrer :
 *   - matricule + mot de passe (celui que l'employé a choisi), ou, si cet
 *     appareil en porte une, l'EMPREINTE / FACE ID d'un seul geste ;
 *   - « J'ai un code de l'IPM » (première connexion, mot de passe oublié) :
 *     matricule + code d'activation + mot de passe choisi, dans le même écran.
 * En cas de succès, App.tsx bascule seul sur l'accueil : on ne navigue pas
 * d'ici. Après une connexion par mot de passe, l'application propose
 * d'activer l'empreinte (cf. PropositionEmpreinte).
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import {
  alertCircle,
  eyeOffOutline,
  eyeOutline,
  fingerPrint,
  idCardOutline,
  keypadOutline,
  lockClosedOutline,
  timeOutline,
} from 'ionicons/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { messageErreur } from '../api'
import { BoutonPrincipal, BoutonSecondaire } from '../components/Boutons'
import { Saisie } from '../components/ChampsFormulaire'
import OfflineBanner from '../components/OfflineBanner'
import { haptique } from '../hooks/haptique'
import { useSession } from '../session'
import { cleDeLAppareil, empreinteDisponible, estAbandon, retenirCle } from '../utils/clesAcces'
import { useFormulaireActivation } from './identification/activation'
import { useFormulaireIdentification } from './identification/formulaire'
import './identification/identification.css'

type Mode = 'connexion' | 'activation'

/** Œil pour voir ou masquer un mot de passe. */
function BoutonVoir({ voir, basculer }: { voir: boolean; basculer: () => void }) {
  return (
    <button
      type="button"
      className="ipm-formulaire__action"
      aria-label={voir ? 'Masquer le mot de passe' : 'Voir le mot de passe'}
      onClick={basculer}
    >
      <IonIcon icon={voir ? eyeOffOutline : eyeOutline} aria-hidden="true" />
    </button>
  )
}

/** Message d'erreur ; `cle` change à chaque refus pour rejouer la secousse. */
function Erreur({ cle, children }: { cle: number; children: ReactNode }) {
  return (
    <div key={cle} className="identification__erreur" role="alert">
      <IonIcon icon={alertCircle} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export default function Identification() {
  const { identifier, activer, connecterParEmpreinte, motifDeconnexion } = useSession()
  const [mode, setMode] = useState<Mode>('connexion')
  const formulaire = useFormulaireIdentification(identifier)
  const activation = useFormulaireActivation(activer)
  const { erreurs } = formulaire
  const [refus, setRefus] = useState(0)
  const champMatricule = useRef<HTMLInputElement>(null)
  const champMotDePasse = useRef<HTMLInputElement>(null)
  const [voirMotDePasse, setVoirMotDePasse] = useState(false)
  // Le code de l'IPM a été tapé comme mot de passe : on l'a reconnu.
  const [codeReconnu, setCodeReconnu] = useState(false)

  // Empreinte / Face ID : seulement si cet appareil porte déjà une clé.
  const [cle] = useState(cleDeLAppareil)
  const [empreintePossible, setEmpreintePossible] = useState(false)
  const [empreinteEnCours, setEmpreinteEnCours] = useState(false)
  const [erreurEmpreinte, setErreurEmpreinte] = useState<string | null>(null)
  useEffect(() => {
    if (!cle) return undefined
    let vivant = true
    void empreinteDisponible().then((oui) => {
      if (vivant) setEmpreintePossible(oui)
    })
    return () => {
      vivant = false
    }
  }, [cle])

  async function continuer() {
    const issue = await formulaire.envoyer()
    if (issue === 'ok') {
      haptique.succes()
    } else if (issue === 'activation') {
      // Le « mot de passe » était le code de l'IPM : on passe au choix du
      // mot de passe, matricule et code déjà remplis.
      haptique.leger()
      activation.changerMatricule(formulaire.matricule)
      activation.changerCode(formulaire.motDePasse)
      setCodeReconnu(true)
      setMode('activation')
    } else if (issue === 'invalide') {
      haptique.erreur()
      if (formulaire.controle.matricule) champMatricule.current?.focus()
      else champMotDePasse.current?.focus()
    } else if (issue === 'refuse') {
      haptique.erreur()
      setRefus((n) => n + 1)
    }
  }

  async function activerCompte() {
    const issue = await activation.envoyer()
    if (issue === 'ok') {
      haptique.succes()
    } else if (issue === 'invalide' || issue === 'refuse') {
      haptique.erreur()
      setRefus((n) => n + 1)
    }
  }

  async function parEmpreinte() {
    if (empreinteEnCours) return
    setEmpreinteEnCours(true)
    setErreurEmpreinte(null)
    try {
      await connecterParEmpreinte()
      haptique.succes()
    } catch (e) {
      // Fenêtre de l'empreinte refermée : rien à dire.
      if (estAbandon(e)) return
      haptique.erreur()
      const message = messageErreur(e)
      setErreurEmpreinte(message)
      setRefus((n) => n + 1)
      // Clé retirée côté serveur : l'appareil l'oublie, le bouton disparaît.
      if (/plus reconnue/.test(message)) {
        retenirCle(null)
        setEmpreintePossible(false)
      }
    } finally {
      setEmpreinteEnCours(false)
    }
  }

  const basculerVoir = () => setVoirMotDePasse((v) => !v)

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

            {mode === 'connexion' ? (
              <form className="ipm-formulaire" noValidate onSubmit={(e) => e.preventDefault()}>
                <Saisie
                  libelle="Matricule"
                  placeholder="Ex. 949"
                  icone={idCardOutline}
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="username"
                  reference={champMatricule}
                  valeur={formulaire.matricule}
                  erreur={erreurs.matricule}
                  onChanger={formulaire.changerMatricule}
                  onEntree={() => champMotDePasse.current?.focus()}
                />
                <Saisie
                  libelle="Mot de passe"
                  type={voirMotDePasse ? 'text' : 'password'}
                  placeholder="Votre mot de passe"
                  icone={lockClosedOutline}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  reference={champMotDePasse}
                  valeur={formulaire.motDePasse}
                  erreur={erreurs.motDePasse}
                  onChanger={formulaire.changerMotDePasse}
                  onEntree={() => void continuer()}
                  action={<BoutonVoir voir={voirMotDePasse} basculer={basculerVoir} />}
                />

                {formulaire.erreurServeur && (
                  <Erreur cle={refus}>{formulaire.erreurServeur}</Erreur>
                )}
                {erreurEmpreinte && <Erreur cle={refus}>{erreurEmpreinte}</Erreur>}

                <div className="identification__actions">
                  <BoutonPrincipal occupe={formulaire.envoi} onClick={() => void continuer()}>
                    {formulaire.envoi ? 'Vérification…' : 'Connexion'}
                  </BoutonPrincipal>
                  {empreintePossible && cle && (
                    <BoutonSecondaire
                      icone={fingerPrint}
                      occupe={empreinteEnCours}
                      onClick={() => void parEmpreinte()}
                    >
                      Empreinte / Face ID
                    </BoutonSecondaire>
                  )}
                </div>

                <button
                  type="button"
                  className="identification__lien"
                  onClick={() => {
                    setMode('activation')
                    setErreurEmpreinte(null)
                  }}
                >
                  Première connexion ou mot de passe oublié ? <strong>J’ai un code de l’IPM</strong>
                </button>
              </form>
            ) : (
              <form className="ipm-formulaire" noValidate onSubmit={(e) => e.preventDefault()}>
                {codeReconnu ? (
                  <div className="identification__avis" role="status">
                    <IonIcon icon={keypadOutline} aria-hidden="true" />
                    <span>
                      C’est votre code de l’IPM : choisissez maintenant votre mot de passe.
                    </span>
                  </div>
                ) : (
                  <p className="identification__explication">
                    L’IPM vous remet un <strong>code à 6 chiffres</strong>, valable 7 jours. Avec
                    lui, choisissez votre mot de passe : il vous servira à chaque connexion.
                  </p>
                )}
                <Saisie
                  libelle="Matricule"
                  placeholder="Ex. 949"
                  icone={idCardOutline}
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="username"
                  valeur={activation.matricule}
                  erreur={activation.erreurs.matricule}
                  onChanger={activation.changerMatricule}
                />
                <Saisie
                  libelle="Code de l’IPM"
                  placeholder="6 chiffres"
                  icone={keypadOutline}
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="one-time-code"
                  valeur={activation.code}
                  erreur={activation.erreurs.code}
                  onChanger={activation.changerCode}
                />
                <Saisie
                  libelle="Nouveau mot de passe"
                  type={voirMotDePasse ? 'text' : 'password'}
                  placeholder="8 caractères, lettres et chiffres"
                  icone={lockClosedOutline}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  valeur={activation.motDePasse}
                  erreur={activation.erreurs.motDePasse}
                  onChanger={activation.changerMotDePasse}
                  action={<BoutonVoir voir={voirMotDePasse} basculer={basculerVoir} />}
                />
                <Saisie
                  libelle="Confirmer le mot de passe"
                  type={voirMotDePasse ? 'text' : 'password'}
                  placeholder="Le même, une seconde fois"
                  icone={lockClosedOutline}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  valeur={activation.confirmation}
                  erreur={activation.erreurs.confirmation}
                  onChanger={activation.changerConfirmation}
                  onEntree={() => void activerCompte()}
                />

                {activation.erreurServeur && (
                  <Erreur cle={refus}>{activation.erreurServeur}</Erreur>
                )}

                <div className="identification__actions">
                  <BoutonPrincipal occupe={activation.envoi} onClick={() => void activerCompte()}>
                    {activation.envoi ? 'Vérification…' : 'Choisir mon mot de passe'}
                  </BoutonPrincipal>
                </div>

                <button
                  type="button"
                  className="identification__lien"
                  onClick={() => {
                    setMode('connexion')
                    setCodeReconnu(false)
                  }}
                >
                  J’ai déjà mon mot de passe : <strong>me connecter</strong>
                </button>
              </form>
            )}
          </main>
        </div>
      </IonContent>
    </IonPage>
  )
}
