/**
 * Lecture du menu pour les deux barres de navigation.
 *
 * `_nav.jsx` reste la **seule** source : ajouter une page là-dedans la fait
 * apparaître dans la barre du bas, et créer une section la fait apparaître
 * dans la barre du haut, sans toucher à autre chose. Ce module ne fait que
 * traduire cette liste en quelque chose que deux barres plates savent
 * afficher - il ne décide de rien.
 */

/**
 * Les sections de la barre secondaire, dans l'ordre du menu.
 *
 * Une entrée simple (« Tableau de bord ») devient une section **sans pages** :
 * elle mène directement à son écran, et la barre du bas reste vide. Une
 * section dépliante devient une section **avec pages**, et sa première page
 * est celle qu'on ouvre quand on clique sur son nom.
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

/**
 * Ramène l'élément actif d'une piste sous les yeux.
 *
 * Les deux barres défilent horizontalement quand l'écran est étroit, et
 * « Traitements » porte neuf pages : sur un portable, la page ouverte se
 * retrouve hors champ, et il faut la chercher pour savoir où l'on est. On
 * centre donc la piste sur elle à chaque changement de route.
 *
 * On calcule `scrollLeft` plutôt que d'appeler `scrollIntoView` : ce dernier
 * fait aussi défiler la **page**, et la barre étant fixe, cela secouerait le
 * contenu sans raison.
 */
export const amenerEnVue = (piste, selecteur) => {
  if (!piste) return
  const actif = piste.querySelector(selecteur)
  if (!actif) return
  const cible = actif.offsetLeft - (piste.clientWidth - actif.offsetWidth) / 2
  piste.scrollTo({ left: Math.max(0, cible), behavior: 'smooth' })
}
