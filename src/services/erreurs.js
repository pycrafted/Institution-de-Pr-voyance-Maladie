/**
 * Messages d'erreur montrés aux utilisateurs.
 *
 * Règle de l'application : jamais de message technique à l'écran — ni code
 * HTTP, ni JSON, ni nom de champ de l'API. Une erreur se dit en français,
 * dit ce qui s'est passé et, autant que possible, quoi faire. Le détail
 * technique part dans la console du navigateur, pour qui doit diagnostiquer.
 *
 * Tout message d'erreur affiché passe par `messageErreur` ; une erreur de
 * saisie renvoyée par le serveur se pose sous son champ (`erreursDeChamps`).
 */

/**
 * Erreurs de saisie renvoyées par le serveur — HTTP 400 portant un objet
 * `{ champ: [messages] }` — ramenées à un message par champ, prêtes à être
 * posées sous les champs du formulaire. `null` s'il ne s'agit pas de cela.
 */
export function erreursDeChamps(erreur) {
  const donnees = erreur?.donnees
  if (erreur?.statut !== 400 || !donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
    return null
  }
  const champs = Object.entries(donnees).filter(
    ([cle, valeur]) =>
      cle !== 'detail' &&
      cle !== 'non_field_errors' &&
      (Array.isArray(valeur) || typeof valeur === 'string'),
  )
  if (!champs.length) return null
  return Object.fromEntries(champs.map(([cle, valeur]) => [cle, [].concat(valeur).join(' ')]))
}

const PAR_STATUT = {
  401: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  403: 'Vous n’avez pas les droits nécessaires pour cette opération.',
  404: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps. Actualisez la page.',
  413: 'Le fichier envoyé est trop volumineux.',
}

/**
 * Une phrase en français, sans jargon, pour n'importe quelle erreur : réponse
 * du serveur, réseau coupé ou incident imprévu.
 */
export function messageErreur(erreur) {
  // Le détail que l'écran tait reste consultable dans la console.
  console.error(erreur)

  const statut = erreur?.statut
  if (!statut) {
    // `fetch` échoue sans réponse quand le serveur est injoignable.
    if (erreur instanceof TypeError && /fetch|network/i.test(erreur.message)) {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
    }
    return 'Une erreur inattendue est survenue. Réessayez ; si elle persiste, prévenez l’administrateur.'
  }
  if (PAR_STATUT[statut]) return PAR_STATUT[statut]
  if (statut >= 500) {
    return 'Le serveur a rencontré un problème. Réessayez dans un instant ; si cela persiste, prévenez l’administrateur.'
  }

  const donnees = erreur.donnees
  // Message métier rédigé par le serveur (« Cette demande vient d’être validée
  // par ailleurs. ») : c'est déjà une phrase destinée à l'utilisateur.
  if (typeof donnees?.detail === 'string') return donnees.detail
  const champs = erreursDeChamps(erreur)
  if (champs) return `Vérifiez les informations saisies : ${Object.values(champs)[0]}`
  if (Array.isArray(donnees?.non_field_errors)) return donnees.non_field_errors.join(' ')
  return 'L’opération n’a pas abouti. Vérifiez les informations saisies, puis réessayez.'
}
