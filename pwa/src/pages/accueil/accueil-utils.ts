/**
 * Petits calculs de l'accueil : libellés du référentiel rendus lisibles.
 */

import { nomPropre } from '../../utils/libelles'

/**
 * Libellé en majuscules du référentiel → lisible :
 * « PHARMACIE DU PLATEAU » → « Pharmacie du Plateau »,
 * « IPM SAR PERSONNEL MOO » → « IPM SAR Personnel Moo » (sigles préservés,
 * comme partout : utils/libelles.nomPropre). Un mot unique et court est
 * presque toujours un sigle (« IPRES ») : il est laissé tel quel.
 */
export function libelleLisible(libelle: string | null | undefined): string {
  const texte = (libelle ?? '').trim()
  if (!texte.includes(' ') && texte.length <= 5) return texte
  return nomPropre(texte)
}
