/**
 * Requêtes de test adaptées aux composants Ionic sous jsdom.
 *
 * Une fois hydraté, un ion-button (ou un ion-item cliquable) déplace son
 * aria-label de l'hôte vers le bouton natif de son shadow DOM : c'est ce que
 * lit le lecteur d'écran, mais getByLabelText ne le voit plus. On cherche
 * donc l'étiquette sur l'hôte ET dans son shadow DOM, et l'on rend l'hôte
 * (celui qui reçoit le clic et porte disabled).
 */

function etiquetteDe(element: Element): string | null {
  return (
    element.getAttribute('aria-label') ??
    element.shadowRoot?.querySelector('[aria-label]')?.getAttribute('aria-label') ??
    null
  )
}

/** L'unique élément étiqueté ainsi ; lève une erreur s'il manque ou s'il y en a plusieurs. */
export function parEtiquette<T extends HTMLElement = HTMLElement>(
  etiquette: string | RegExp,
  racine: ParentNode = document.body,
): T {
  const correspond = (valeur: string) =>
    typeof etiquette === 'string' ? valeur === etiquette : etiquette.test(valeur)
  const trouves = Array.from(racine.querySelectorAll<HTMLElement>('*')).filter((element) => {
    const valeur = etiquetteDe(element)
    return valeur !== null && correspond(valeur)
  })
  if (trouves.length !== 1) {
    throw new Error(`${trouves.length} élément(s) étiqueté(s) « ${String(etiquette)} »`)
  }
  return trouves[0] as T
}
