/**
 * Page de connexion.
 *
 * Deux volets : la raffinerie de Mbao en pleine hauteur à gauche, la saisie à
 * droite sur fond blanc. La photo dit d'emblée de quelle maison relève
 * l'application ; le panneau, lui, reste bâti avec les jetons des panneaux de
 * saisie de « Données de base » — marque en tête, champs soulignés, bouton
 * rouge SAR — pour que l'écran suivant ne soit pas une rupture.
 *
 * Rien n'est écrit par-dessus la photo sinon la signature de la société, en
 * bas à gauche : un formulaire posé sur une image devient illisible dès que
 * l'image change.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'

import { getMe, login } from '../../../services/api'
import { prechargerReferentiels } from '../../../services/referentiels'
import { oeil, oeilBarre } from '../../../assets/icones'
import sarLogo from '../../../assets/sitesar.png'
import './login.scss'

const ACCUEIL = '/donnees-de-base'

const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [motDePasseVisible, setMotDePasseVisible] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  // Déjà connecté : on entre directement dans l'application.
  useEffect(() => {
    getMe().then((u) => {
      if (u) navigate(ACCUEIL, { replace: true })
    })
  }, [navigate])

  const soumettre = async (e) => {
    e.preventDefault()

    setErreur('')
    setEnvoi(true)
    try {
      await login(email.trim(), motDePasse)
      // Le préchargement du démarrage n'a rien pu lire sans jeton : on le
      // refait maintenant que la session existe, sinon les listes déroulantes
      // en cascade de la fiche participant — qui se lisent de façon synchrone —
      // trouveraient un store vide. Sans bloquer l'entrée si l'API tousse.
      await prechargerReferentiels().catch(() => {})
      navigate(ACCUEIL, { replace: true })
    } catch (err) {
      // 401 : identifiants refusés. 400 : saisie que le serveur n'a même pas pu
      // lire — une adresse mal formée, un champ vide. Les deux viennent du
      // formulaire, et méritent donc la même réponse : renvoyer l'utilisateur
      // vers son réseau alors que c'est sa saisie lui ferait chercher très loin
      // un problème qui est sous ses yeux.
      const statut = Number(err.message?.match(/HTTP (\d{3})/)?.[1])
      setErreur(
        statut === 400 || statut === 401
          ? 'Email ou mot de passe incorrect.'
          : 'Connexion impossible. Vérifiez votre réseau et réessayez.',
      )
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="cx-page">
      {/* Volet gauche : la raffinerie en pleine hauteur. C'est elle qui dit
          d'emblée de quelle maison relève l'application — avant même qu'on
          ait lu le nom de l'institution. */}
      <div className="cx-visuel">
        <div className="cx-visuel-legende">
          <p className="cx-visuel-societe">Société Africaine de Raffinage</p>
          <p className="cx-visuel-lieu">Raffinerie de Mbao, Dakar, Sénégal</p>
        </div>
      </div>

      <div className="cx-panneau">
        {/* Même composition que la barre supérieure de l'application.
            Le nom de l'institution porte le titre de la page : « Connexion »
            a été retiré, et sans lui l'écran n'aurait plus eu de titre du
            tout — ni pour un lecteur d'écran, ni dans le plan du document. */}
        <div className="cx-entete">
          <img src={sarLogo} alt="SAR" className="cx-logo" />
          <h1 className="cx-institution">Institution de Prévoyance Maladie (IPM)</h1>
        </div>

        <form className="cx-formulaire" onSubmit={soumettre} noValidate>
          <div className="cx-corps">
            {erreur && (
              <div className="cx-erreur" role="alert">
                {erreur}
              </div>
            )}

            <div className="cx-groupe">
              <label htmlFor="cx-email">Email</label>
              <div className="cx-champ-enveloppe">
                <input
                  id="cx-email"
                  type="email"
                  className="cx-champ"
                  autoComplete="username"
                  placeholder="prenom.nom@sar.sn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="cx-groupe">
              <label htmlFor="cx-mot-de-passe">Mot de passe</label>
              <div className="cx-champ-enveloppe">
                <input
                  id="cx-mot-de-passe"
                  type={motDePasseVisible ? 'text' : 'password'}
                  className="cx-champ"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="cx-oeil"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  aria-label={
                    motDePasseVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                >
                  <CIcon icon={motDePasseVisible ? oeilBarre : oeil} />
                </button>
              </div>
            </div>
          </div>

          <div className="cx-actions">
            <button type="submit" className="cx-bouton" disabled={envoi}>
              {envoi && <CSpinner size="sm" />}
              {envoi ? 'Connexion…' : 'Se connecter'}
            </button>
          </div>
        </form>

        <p className="cx-pied">© {new Date().getFullYear()} Société Africaine de Raffinage</p>
      </div>
    </div>
  )
}

export default Login
