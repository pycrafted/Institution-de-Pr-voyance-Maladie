/**
 * Photo d'identité choisie sur le téléphone : lecture, réduction, encodage.
 *
 * La photo part dans la fiche du participant, en base (champ texte), et se
 * verra aussi dans l'application IPM. Une photo d'appareil moderne pèse
 * plusieurs mégaoctets : on la réduit donc ICI, avant l'envoi — le réseau de
 * l'entreprise n'est pas toujours large, et le serveur refuse au-delà de
 * 400 Ko (cf. backend/apps/mobile/views.py, PhotoView).
 *
 * 720 px de côté et JPEG à 0,85 : ce sont les valeurs de l'application IPM
 * (src/views/donnees-de-base/FormulaireEntree.jsx), pour que les deux écrans
 * produisent la même chose. Une photo d'identité y pèse une soixantaine de
 * kilo-octets, loin des 400 Ko que le serveur refuse.
 */

/**
 * Côté maximal d'une photo d'identité enregistrée, en pixels.
 *
 * **720 depuis le 2026-11-25** (c'était 320). La photo s'imprime sur les bons
 * dans un cadre de 1,83 x 2,44 pouce : à 300 points par pouce il y faut 550 x
 * 733 pixels, et le recadrage au format 3/4 ne garde que les trois quarts de
 * la largeur - d'où une source carrée de 733 px. À 320 px le bon n'en recevait
 * que 240, soit 131 ppp : la photo sortait en escalier. À 720, il en reçoit
 * 540, soit 295 ppp.
 */
export const COTE_PHOTO = 720

/** Qualité JPEG : 0,85 plutôt que 0,8, pour ne pas reperdre au réencodage. */
export const QUALITE_PHOTO = 0.85

/** Au-delà, inutile d'ouvrir le fichier. */
const TAILLE_FICHIER_MAX = 20 * 1024 * 1024

export class ErreurPhoto extends Error {}

/**
 * Lit le fichier choisi, le réduit au côté voulu et le rend en URL de données
 * JPEG, prête à envoyer.
 */
async function reduire(fichier: File, cote: number, qualite: number): Promise<string> {
  if (!fichier.type.startsWith('image/')) {
    throw new ErreurPhoto('Choisissez une image.')
  }
  if (fichier.size > TAILLE_FICHIER_MAX) {
    throw new ErreurPhoto('Image trop lourde : 20 Mo au plus.')
  }

  const source = await lire(fichier)
  try {
    const image = await charger(source)
    const echelle = Math.min(1, cote / Math.max(image.width, image.height))
    const canevas = document.createElement('canvas')
    canevas.width = Math.max(1, Math.round(image.width * echelle))
    canevas.height = Math.max(1, Math.round(image.height * echelle))
    const contexte = canevas.getContext('2d')
    if (!contexte) throw new ErreurPhoto('Ce navigateur ne sait pas préparer l’image.')
    contexte.drawImage(image, 0, 0, canevas.width, canevas.height)
    // JPEG et non PNG : à qualité égale, une photo y pèse dix fois moins.
    return canevas.toDataURL('image/jpeg', qualite)
  } finally {
    // L'URL d'objet ne se libère pas seule ; la data: n'a rien à libérer.
    if (source.startsWith('blob:')) URL.revokeObjectURL(source)
  }
}

/** Photo d'identité : petit format (cf. COTE_PHOTO). */
export function reduirePhoto(fichier: File): Promise<string> {
  return reduire(fichier, COTE_PHOTO, QUALITE_PHOTO)
}

function lire(fichier: File): Promise<string> {
  // createObjectURL évite de charger deux fois l'image en mémoire (une fois en
  // base64, une fois décodée), ce qui compte sur un téléphone d'entrée de gamme.
  if (typeof URL.createObjectURL === 'function') {
    return Promise.resolve(URL.createObjectURL(fichier))
  }
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => rejeter(new ErreurPhoto('Fichier illisible.'))
    lecteur.onload = () => resoudre(String(lecteur.result))
    lecteur.readAsDataURL(fichier)
  })
}

function charger(source: string): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image()
    image.onerror = () => rejeter(new ErreurPhoto('Ce fichier n’est pas une image.'))
    image.onload = () => resoudre(image)
    image.src = source
  })
}
