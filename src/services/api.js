/**
 * Service API - accès à l'API IPM.
 *
 * Porte l'authentification et le transport : `request` est le point de passage
 * unique de tous les appels, y compris ceux des référentiels
 * (services/referentiels.js). C'est lui qui joint le jeton à chaque requête et
 * qui ferme la session dès que le serveur le refuse.
 *
 * L'API est fermée : hors `/auth/login/`, tout appel sans jeton valable
 * répond 401.
 */

// 127.0.0.1 plutôt que « localhost » : sous Windows, « localhost » se résout
// d'abord en IPv6 (::1), où le serveur de dev Django n'écoute pas - le
// navigateur attend l'échec puis bascule en IPv4, ~200 ms perdus par requête.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api'

// =====================================================================
// Jeton d'authentification - persistant en localStorage
// =====================================================================
const CLE_JETON = 'ipm_token'

export const getToken = () => localStorage.getItem(CLE_JETON)

export const setToken = (jeton) => {
  if (jeton) localStorage.setItem(CLE_JETON, jeton)
  else localStorage.removeItem(CLE_JETON)
}

/**
 * Signale un changement de session ou de profil, pour que la barre supérieure
 * se resynchronise même si le changement vient d'un autre composant.
 */
export const AUTH_EVENT = 'ipm-auth-changed'
export const notifyAuthChanged = () => window.dispatchEvent(new Event(AUTH_EVENT))

const enteteAuth = () => {
  const jeton = getToken()
  return jeton ? { Authorization: `Token ${jeton}` } : {}
}

// =====================================================================
// Écritures en cours
//
// L'écoute de fond des listes (cf. views/donnees-de-base/ecouteChangements.js)
// ne doit jamais recharger un tableau pendant qu'une écriture est en vol : elle
// afficherait l'état d'avant, puis celui d'après, sous les yeux de qui vient de
// valider. Le compteur est tenu ici, seul point de passage de tous les appels,
// plutôt que dans chaque écran - un éditeur propre à un référentiel écrit lui
// aussi par ce chemin.
// =====================================================================
let ecrituresEnCours = 0

export const ecritureEnVol = () => ecrituresEnCours > 0

// =====================================================================
// Appel HTTP
// =====================================================================
export async function request(chemin, options = {}) {
  // Tout ce qui n'est pas un GET modifie la base : on le compte, le temps de
  // l'aller-retour, pour que l'écoute de fond se taise pendant ce temps-là.
  const ecriture = Boolean(options.method) && options.method !== 'GET'
  if (ecriture) ecrituresEnCours += 1
  try {
    return await appeler(chemin, options)
  } finally {
    if (ecriture) ecrituresEnCours -= 1
  }
}

async function appeler(chemin, options) {
  const entetes = { ...enteteAuth(), ...options.headers }
  // On ne pose « Content-Type: application/json » que s'il y a un corps
  // (POST, PATCH). Sur un GET, cet en-tête rendrait la requête « non simple »
  // et forcerait une requête préliminaire CORS (OPTIONS) - un aller-retour de
  // plus pour rien à chaque lecture.
  if (options.body) entetes['Content-Type'] = 'application/json'

  const reponse = await fetch(`${API_BASE}${chemin}`, { ...options, headers: entetes })

  // Jeton refusé alors qu'on en portait un : il a été révoqué ou effacé côté
  // serveur. La session locale ne vaut plus rien - on la ferme et on ramène à
  // la connexion, plutôt que de laisser l'écran se couvrir d'erreurs. Le test
  // sur `getToken()` épargne l'échec de connexion lui-même, qui répond 401
  // sans qu'aucune session n'existe.
  if (reponse.status === 401 && getToken()) {
    setToken(null)
    notifyAuthChanged()
    // Adresse pleine, sans dièse (cf. App.jsx) : la session est morte, un
    // rechargement complet repart d'une application propre.
    window.location.assign('/login')
  }

  if (!reponse.ok) {
    let donnees = null
    let detail = reponse.statusText
    try {
      donnees = await reponse.json()
      detail = donnees.detail || JSON.stringify(donnees)
    } catch {
      // Corps absent ou non JSON : le libellé HTTP tient lieu de détail. Le
      // relire en texte échouerait, le flux ayant déjà été consommé.
    }
    const erreur = new Error(`HTTP ${reponse.status} - ${detail}`)
    // Le corps reste joint à l'erreur : un appelant qui attend une réponse
    // structurée - le rapport d'un import refusé, ligne par ligne - la lit ici
    // plutôt que de la reconstituer à partir du message.
    erreur.statut = reponse.status
    erreur.donnees = donnees
    throw erreur
  }

  if (reponse.status === 204) return null
  return reponse.json()
}

/**
 * Télécharge un fichier servi par l'API (un PDF, par exemple), avec le jeton
 * de la session. Renvoie un Blob. Mêmes règles que `request` : un jeton refusé
 * ramène à la connexion, une erreur porte `statut` et `donnees`.
 */
export async function telecharger(chemin) {
  const reponse = await fetch(`${API_BASE}${chemin}`, { headers: enteteAuth() })
  if (reponse.status === 401 && getToken()) {
    setToken(null)
    notifyAuthChanged()
    window.location.assign('/login')
  }
  if (!reponse.ok) {
    let donnees = null
    try {
      donnees = await reponse.json()
    } catch {
      // Corps absent ou non JSON : le statut suffit.
    }
    const erreur = new Error(`HTTP ${reponse.status}`)
    erreur.statut = reponse.status
    erreur.donnees = donnees
    throw erreur
  }
  return reponse.blob()
}

// =====================================================================
// Authentification
// =====================================================================

/** Connexion par email et mot de passe. Stocke le jeton, renvoie le profil. */
export async function login(email, motDePasse) {
  const data = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password: motDePasse }),
  })
  setToken(data.token)
  notifyAuthChanged()
  return data.user
}

/** Déconnexion : invalide le jeton côté serveur et l'efface localement. */
export async function logout() {
  try {
    await request('/auth/logout/', { method: 'POST' })
  } catch {
    // Le jeton est effacé quoi qu'il arrive : mieux vaut une session fermée
    // localement qu'une session qu'on croit fermée sans qu'elle le soit.
  }
  setToken(null)
  notifyAuthChanged()
}

/** Profil de l'utilisateur connecté, ou null si la session n'existe pas. */
export async function getMe() {
  if (!getToken()) return null
  try {
    return await request('/auth/me/')
  } catch {
    setToken(null)
    return null
  }
}
