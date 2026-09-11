/**
 * Résolution des listes de valeurs d'un champ.
 *
 * Une colonne peut déclarer ses `options` de trois façons :
 *   - un tableau de chaînes            → ['CAISSE', 'BANQUE']
 *   - un tableau de { valeur, libelle } → le plan comptable
 *   - une fonction (valeurs, entrees)   → liste calculée à partir de la saisie
 *     en cours et du contenu du référentiel : c'est ce qui permet à un service
 *     de ne proposer que des départements.
 *
 * Ces trois helpers sont partagés par le formulaire, la fiche de consultation
 * et le tableau, pour qu'un code enregistré s'affiche partout avec le même
 * intitulé.
 */

/** Liste effective des options, la fonction étant résolue au passage. */
export const optionsDe = (col, valeurs = {}, entrees = []) => {
  const brutes = typeof col.options === 'function' ? col.options(valeurs, entrees) : col.options
  return (brutes || []).map((option) =>
    typeof option === 'string' ? { valeur: option, libelle: option } : option,
  )
}

/** Texte d'une option dans une liste déroulante : « 571000 - CAISSE LOCALE ». */
export const texteOption = (option) =>
  option.libelle === option.valeur ? option.valeur : `${option.valeur} - ${option.libelle}`

/**
 * Intitulé à afficher pour une valeur enregistrée, hors saisie : dans un
 * tableau ou une fiche, `DEP010` doit se lire « Informatique ».
 * Retourne la valeur brute si elle ne correspond à aucune option — une entrée
 * ancienne ne doit pas disparaître de l'écran parce que sa cible a été retirée.
 */
export const libelleValeur = (col, valeur, entree = {}, entrees = []) => {
  if (!valeur || !col.options) return valeur
  const option = optionsDe(col, entree, entrees).find((o) => o.valeur === valeur)
  return option ? option.libelle : valeur
}

/** Un champ conditionnel n'est affiché que si son prédicat est satisfait. */
export const champVisible = (col, valeurs) =>
  typeof col.visible === 'function' ? col.visible(valeurs) : col.visible !== false

/** `requis` peut dépendre de la saisie en cours (un service exige un parent). */
export const champRequis = (col, valeurs) =>
  typeof col.requis === 'function' ? col.requis(valeurs) : Boolean(col.requis)
