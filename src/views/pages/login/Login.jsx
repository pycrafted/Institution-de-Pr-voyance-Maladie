/**
 * Page de connexion.
 *
 * Même composition que la page de connexion d'OpsDigital : une carte blanche
 * centrée sur la photo de la raffinerie - en tête le logo, le titre
 * « Connexion » et l'institution ; dessous les deux champs à icône et le bouton
 * plein ; en pied de page, la mention de la société. Aux couleurs SAR.
 *
 * Deux sortes de refus, deux réponses : ce que le serveur reproche à un champ
 * - une adresse incomplète, un mot de passe vide - se dit sous ce champ ; des
 * identifiants refusés se disent en tête du formulaire.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'

import { getMe, login } from '../../../services/api'
import { erreursDeChamps } from '../../../services/erreurs'
import { prechargerReferentiels } from '../../../services/referentiels'
import { oeil, oeilBarre } from '../../../assets/icones'
import sarLogo from '../../../assets/sitesar.png'
import './login.scss'

// Après connexion : la page d'accueil, le tableau de bord.
const ACCUEIL = '/tableau-de-bord'

const SANS_ERREUR = { general: '', email: '', password: '' }

/** Enveloppe - l'icône du champ e-mail d'OpsDigital. */
const IconeEnveloppe = () => (
  <svg width="18" height="18" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
    <path d="M19.2516 3.30005H2.75156C1.58281 3.30005 0.585938 4.26255 0.585938 5.46567V16.6032C0.585938 17.7719 1.54844 18.7688 2.75156 18.7688H19.2516C20.4203 18.7688 21.4172 17.8063 21.4172 16.6032V5.4313C21.4172 4.26255 20.4203 3.30005 19.2516 3.30005ZM19.2516 4.84692C19.2859 4.84692 19.3203 4.84692 19.3547 4.84692L11.0016 10.2094L2.64844 4.84692C2.68281 4.84692 2.71719 4.84692 2.75156 4.84692H19.2516ZM19.2516 17.1532H2.75156C2.40781 17.1532 2.13281 16.8782 2.13281 16.5344V6.35942L10.1766 11.5157C10.4172 11.6875 10.6922 11.7563 10.9672 11.7563C11.2422 11.7563 11.5172 11.6875 11.7578 11.5157L19.8016 6.35942V16.5688C19.8703 16.9125 19.5953 17.1532 19.2516 17.1532Z" />
  </svg>
)

/** Cercle d'alerte du message d'erreur. */
const IconeAlerte = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <line
      x1="12"
      y1="8"
      x2="12"
      y2="12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </svg>
)

const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [motDePasseVisible, setMotDePasseVisible] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreurs, setErreurs] = useState(SANS_ERREUR)

  // Déjà connecté : on entre directement dans l'application.
  useEffect(() => {
    getMe().then((u) => {
      if (u) navigate(ACCUEIL, { replace: true })
    })
  }, [navigate])

  const soumettre = async (e) => {
    e.preventDefault()

    setErreurs(SANS_ERREUR)
    setEnvoi(true)
    try {
      await login(email.trim(), motDePasse)
      // Le préchargement du démarrage n'a rien pu lire sans jeton : on le
      // refait maintenant que la session existe, sinon les listes déroulantes
      // en cascade de la fiche participant - qui se lisent de façon synchrone -
      // trouveraient un store vide. Sans bloquer l'entrée si l'API tousse.
      await prechargerReferentiels().catch(() => {})
      navigate(ACCUEIL, { replace: true })
    } catch (err) {
      // 400 : le serveur n'a même pas pu lire la saisie - adresse incomplète,
      // mot de passe vide. Il dit quel champ, on le pose sous ce champ.
      const champs = erreursDeChamps(err)
      if (champs) {
        setErreurs({
          ...SANS_ERREUR,
          email: champs.email || '',
          password: champs.password || '',
        })
        return
      }
      // 401 : identifiants refusés. Le reste : réseau ou serveur.
      const statut = Number(err.message?.match(/HTTP (\d{3})/)?.[1])
      setErreurs({
        ...SANS_ERREUR,
        general:
          statut === 400 || statut === 401
            ? 'Email ou mot de passe incorrect.'
            : 'Connexion impossible. Vérifiez votre réseau et réessayez.',
      })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="cx-page">
      <main className="cx-centre">
        <div className="cx-carte">
          <header className="cx-carte-entete">
            <img src={sarLogo} alt="SAR" className="cx-logo" />
            <h1 className="cx-titre">Connexion</h1>
            <p className="cx-sous-titre">Institution de Prévoyance Maladie (IPM)</p>
          </header>

          <form className="cx-formulaire" onSubmit={soumettre} noValidate>
            {erreurs.general && (
              <div className="cx-erreur" role="alert">
                <IconeAlerte />
                <p>{erreurs.general}</p>
              </div>
            )}

            <div className="cx-groupe">
              <label htmlFor="cx-email">Adresse e-mail</label>
              <div className="cx-champ-enveloppe">
                <input
                  id="cx-email"
                  type="email"
                  className={`cx-champ${erreurs.email || erreurs.general ? ' cx-champ-erreur' : ''}`}
                  autoComplete="username"
                  placeholder="prenom.nom@sar.sn"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setErreurs(SANS_ERREUR)
                  }}
                  required
                  autoFocus
                />
                <span className="cx-icone">
                  <IconeEnveloppe />
                </span>
              </div>
              {erreurs.email && <span className="cx-erreur-champ">{erreurs.email}</span>}
            </div>

            <div className="cx-groupe">
              <label htmlFor="cx-mot-de-passe">Mot de passe</label>
              <div className="cx-champ-enveloppe">
                <input
                  id="cx-mot-de-passe"
                  type={motDePasseVisible ? 'text' : 'password'}
                  className={`cx-champ${
                    erreurs.password || erreurs.general ? ' cx-champ-erreur' : ''
                  }`}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => {
                    setMotDePasse(e.target.value)
                    setErreurs(SANS_ERREUR)
                  }}
                  required
                />
                <button
                  type="button"
                  className="cx-icone cx-oeil"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  aria-label={
                    motDePasseVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                >
                  <CIcon icon={motDePasseVisible ? oeilBarre : oeil} />
                </button>
              </div>
              {erreurs.password && <span className="cx-erreur-champ">{erreurs.password}</span>}
            </div>

            <button type="submit" className="cx-bouton" disabled={envoi}>
              {envoi && <CSpinner size="sm" />}
              {envoi ? 'Connexion en cours…' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="cx-pied">© {new Date().getFullYear()} Société Africaine de Raffinage</p>
      </main>
    </div>
  )
}

export default Login
