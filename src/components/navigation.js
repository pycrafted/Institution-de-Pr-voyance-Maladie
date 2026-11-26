/**
 * Lecture du menu pour la colonne de navigation (<AppMenu />).
 *
 * `_nav.jsx` reste la **seule** source : ajouter une page là-dedans la fait
 * apparaître sous sa section, et créer une section l'ajoute à la colonne,
 * sans toucher à autre chose. Ce module ne fait que traduire cette liste en
 * quelque chose qu'une liste plate sait afficher - il ne décide de rien.
 */

/**
 * Les sections du menu, dans l'ordre.
 *
 * Une entrée simple (« Tableau de bord ») devient une section **sans pages** :
 * elle mène directement à son écran, et ne se déplie pas. Une section
 * dépliante devient une section **avec pages**, et sa première page est sa
 * destination par défaut.
 */
export const sectionsDe = (menu) =>
  menu.map((entree) => {
    const pages = (entree.items || [])
      .filter((page) => page.to)
      .map((page) => ({ nom: page.name, to: page.to, desactive: Boolean(page.desactive) }))
    return {
      nom: entree.name,
      icone: entree.icon,
      desactive: Boolean(entree.desactive),
      // La destination d'une section : son écran si elle en a un, sinon sa
      // première page active.
      to: entree.to || pages.find((page) => !page.desactive)?.to || '',
      pages,
    }
  })

/**
 * La section qui porte le chemin courant.
 *
 * On retient la route la plus **longue** qui amorce le chemin : sans cela,
 * « /documents/bons-optique » tomberait aussi bien sur « /documents » que sur
 * la bonne page, et le premier trouvé gagnerait. C'est la même règle que le
 * fil d'Ariane, qui la tient déjà de son côté.
 */
export const sectionCourante = (sections, chemin) => {
  let meilleure = null
  let longueur = -1
  sections.forEach((section) => {
    const candidates = [section.to, ...section.pages.map((page) => page.to)].filter(Boolean)
    candidates.forEach((route) => {
      if ((chemin === route || chemin.startsWith(`${route}/`)) && route.length > longueur) {
        meilleure = section
        longueur = route.length
      }
    })
  })
  return meilleure
}

// (`amenerEnVue` vivait ici : elle centrait la piste des anciennes barres
// horizontales sur l'élément actif, qui sortait du champ sur un portable.
// Retirée le 2026-11-26 avec ces barres - une colonne ne défile pas
// latéralement.)
