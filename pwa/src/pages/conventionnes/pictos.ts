/**
 * Les pastilles des structures sur la carte, comme les catégories de Google
 * Maps : une couleur et une icône par famille de structures (pharmacie,
 * clinique, dentiste, optique…), pour les reconnaître d'un coup d'œil.
 *
 * Chaque pastille est une petite image SVG (rond de couleur, liseré blanc,
 * icône blanche) fabriquée une fois par famille et réutilisée par tous ses
 * points : Google les dessine ensemble sur la carte, sans un élément par point.
 * Les bulles de regroupement (« 12 structures ici ») sont dessinées de même.
 */

import { aperture, business, car, cube, eye, flask, happy, medkit, person } from 'ionicons/icons'

interface Famille {
  couleur: string
  icone: string
}

/** Les familles, par code de spécialité de l'annuaire. */
const FAMILLES: Record<string, Famille> = {
  pharmacie: { couleur: '#1e8e3e', icone: medkit },
  etablissement: { couleur: '#d93025', icone: business },
  dentiste: { couleur: '#e37400', icone: happy },
  optique: { couleur: '#8e24aa', icone: eye },
  laboratoire: { couleur: '#00897b', icone: flask },
  imagerie: { couleur: '#3949ab', icone: aperture },
  // Pas de bleu : c'est la couleur du point de position de l'employé.
  medecin: { couleur: '#c2185b', icone: person },
  transport: { couleur: '#5f6368', icone: car },
  divers: { couleur: '#5f6368', icone: cube },
}

/** Code de spécialité (annuaire IPM) → famille ; le reste : médecins. */
const PAR_CODE: Record<string, keyof typeof FAMILLES> = {
  '06': 'pharmacie',
  '08': 'etablissement',
  '03': 'etablissement',
  '05': 'dentiste',
  '04': 'optique',
  '01': 'laboratoire',
  '02': 'imagerie',
  '17': 'transport',
  '99': 'divers',
}

export function familleDe(codeSpecialite: string | null | undefined): Famille {
  const nom = (codeSpecialite && PAR_CODE[codeSpecialite]) || 'medecin'
  return FAMILLES[nom] ?? FAMILLES.medecin!
}

/** Le contenu d'une icône ionicons (ses formes), sans son <svg> englobant. */
function formes(icone: string): string {
  const svg = decodeURIComponent(icone.replace(/^data:image\/svg\+xml;utf8,/, ''))
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
}

function enImage(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/** Taille d'affichage d'une pastille, en pixels CSS. */
export const TAILLE_PASTILLE = 28

const pastilles = new Map<string, string>()

/** L'image d'une pastille (rond coloré, liseré blanc, icône blanche), mise en cache. */
export function imagePastille(famille: Famille): string {
  const cle = famille.couleur + famille.icone
  let image = pastilles.get(cle)
  if (!image) {
    // Dessinée en 56 px pour rester nette sur les écrans haute densité.
    image = enImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">` +
        `<circle cx="28" cy="29" r="24" fill="#000" opacity=".18"/>` +
        `<circle cx="28" cy="27" r="24" fill="${famille.couleur}" stroke="#fff" stroke-width="4"/>` +
        `<g transform="translate(15 14) scale(.0508)" fill="#fff" stroke="#fff">${formes(famille.icone)}</g>` +
        `</svg>`,
    )
    pastilles.set(cle, image)
  }
  return image
}

/**
 * Une bulle de regroupement : le nombre de structures, sur un rond rouge de
 * l'application d'autant plus grand qu'il y en a, avec un halo.
 */
export function imageGroupe(nombre: number): { url: string; taille: number } {
  const taille = nombre < 10 ? 34 : nombre < 50 ? 40 : nombre < 100 ? 46 : 52
  const r = taille / 2
  const texte = nombre > 999 ? '999+' : String(nombre)
  const url = enImage(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${taille * 2}" height="${taille * 2}" viewBox="0 0 ${taille} ${taille}">` +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="#e52621" opacity=".2"/>` +
      `<circle cx="${r}" cy="${r}" r="${r - 5}" fill="#e52621" stroke="#fff" stroke-width="2"/>` +
      `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" ` +
      `font-family="Satoshi, Arial, sans-serif" font-weight="700" font-size="${nombre < 100 ? 13 : 12}">${texte}</text>` +
      `</svg>`,
  )
  return { url, taille }
}
