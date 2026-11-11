/**
 * Rechargement automatique apres un deploiement.
 *
 * A chaque mise en prod, les fichiers JS changent d'empreinte (leur nom hache)
 * et les anciens sont supprimes du serveur. Un onglet reste ouvert sur
 * l'ancienne version qui navigue vers une page chargee a la demande
 * (React.lazy) reclame alors un fichier disparu : l'IIS repond l'index.html
 * (text/html) a sa place, et l'import echoue - "Failed to fetch dynamically
 * imported module", suivi d'une erreur de type MIME. Plutot que l'ecran casse,
 * on recharge la page une fois : le navigateur reprend l'index.html a jour
 * (servi en no-cache) et ses nouveaux fichiers.
 *
 * Verrou anti-boucle : au plus un rechargement par fenetre de 10 s. Si le
 * defaut persiste (vrai probleme serveur, pas un simple deploiement), on laisse
 * l'erreur remonter plutot que de recharger sans fin.
 */

const CLE = 'ipm-rechargement-chunk'
const FENETRE = 10000

/** Recharge la page, sauf si on vient deja de le faire. Renvoie true si recharge. */
const rechargerUneFois = () => {
  let dernier = 0
  try {
    dernier = Number(sessionStorage.getItem(CLE)) || 0
  } catch {
    // sessionStorage indisponible (navigation privee, stockage bloque) : on
    // rechargera quand meme, simplement sans memoire du dernier essai.
  }
  if (Date.now() - dernier < FENETRE) return false
  try {
    sessionStorage.setItem(CLE, String(Date.now()))
  } catch {
    // Pas de memoire possible : tant pis, on recharge tout de meme une fois.
  }
  window.location.reload()
  return true
}

/** Reconnait le message d'un import dynamique qui a echoue, tous navigateurs. */
const estErreurDeChunk = (message) =>
  typeof message === 'string' &&
  /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module)/i.test(
    message,
  )

// 1. L'evenement dedie de Vite : emis quand le prechargement d'un chunk echoue.
//    Si on recharge, on previent la propagation ; sinon on laisse l'erreur
//    suivre son cours (bornee par le verrou anti-boucle).
window.addEventListener('vite:preloadError', (e) => {
  if (rechargerUneFois()) e.preventDefault()
})

// 2. Filet de securite : un import dynamique rejete qui remonte jusqu'en haut.
window.addEventListener('unhandledrejection', (e) => {
  if (estErreurDeChunk(e && e.reason && e.reason.message)) rechargerUneFois()
})
