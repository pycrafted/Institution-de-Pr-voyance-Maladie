/**
 * Icônes maison, au format attendu par CIcon : [viewBox, contenu SVG].
 *
 * CoreUI ne fournit pas d'œil ouvert — `cilLowVision` est un œil barré, qui
 * signifie « masqué » et dirait donc l'inverse de ce qu'on veut ici.
 */

export const oeil = [
  '24 24',
  `<path fill="currentColor" d="M12 5C6.9 5 2.6 8.2 1 12c1.6 3.8 5.9 7 11 7s9.4-3.2 11-7c-1.6-3.8-5.9-7-11-7zm0 12c-3.9 0-7.4-2.2-9-5 1.6-2.8 5.1-5 9-5s7.4 2.2 9 5c-1.6 2.8-5.1 5-9 5z"/>
   <circle cx="12" cy="12" r="2.6" fill="currentColor"/>`,
]

/** Le même œil, barré : le mot de passe est visible, ce clic le masquera. */
export const oeilBarre = [
  '24 24',
  `<path fill="currentColor" d="M12 5C6.9 5 2.6 8.2 1 12c1.6 3.8 5.9 7 11 7s9.4-3.2 11-7c-1.6-3.8-5.9-7-11-7zm0 12c-3.9 0-7.4-2.2-9-5 1.6-2.8 5.1-5 9-5s7.4 2.2 9 5c-1.6 2.8-5.1 5-9 5z"/>
   <circle cx="12" cy="12" r="2.6" fill="currentColor"/>
   <path fill="currentColor" d="M4.3 3.3 2.9 4.7l16.4 16.4 1.4-1.4z"/>`,
]
