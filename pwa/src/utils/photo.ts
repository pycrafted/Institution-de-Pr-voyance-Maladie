/**
 * Photo d'identité choisie sur le téléphone : lecture, réduction, encodage.
 *
 * La photo part dans la fiche du participant, en base (champ texte), et se
 * verra aussi dans l'application IPM. Une photo d'appareil moderne pèse
 * plusieurs mégaoctets : on la réduit donc ICI, avant l'envoi — le réseau de
 * l'entreprise n'est pas toujours large, et le serveur refuse au-delà de
 * 400 Ko (cf. backend/apps/mobile/views.py, PhotoView).
 *
 * 320 px de côté et JPEG à 0,8 : ce sont les valeurs de l'application IPM
 * (src/views/donnees-de-base/FormulaireEntree.jsx), pour que les deux écrans
 * produisent la même chose. Une photo d'identité y pèse une vingtaine de
 * kilo-octets.
 */

/** Côté maximal d'une photo enregistrée, en pixels. */
export const COTE_PHOTO = 320

/** Au-delà, inutile d'ouvrir le fichier : ce n'est pas une photo d'identité. */
const TAILLE_FICHIER_MAX = 20 * 1024 * 1024

export class ErreurPhoto extends Error {}

/**
 * Lit le fichier choisi, le réduit à {@link COTE_PHOTO} et le rend en URL de
 * données JPEG, prête à envoyer.
 */
export async function reduirePhoto(fichier: File): Promise<string> {
  if (!fichier.type.startsWith('image/')) {
    throw new ErreurPhoto('Choisissez une image.')
  }
  if (fichier.size > TAILLE_FICHIER_MAX) {
    throw new ErreurPhoto('Image trop lourde : 20 Mo au plus.')
  }

  const source = await lire(fichier)
  try {
    const image = await charger(source)
    const echelle = Math.min(1, COTE_PHOTO / Math.max(image.width, image.height))
    const canevas = document.createElement('canvas')
    canevas.width = Math.max(1, Math.round(image.width * echelle))
    canevas.height = Math.max(1, Math.round(image.height * echelle))
    const contexte = canevas.getContext('2d')
    if (!contexte) throw new ErreurPhoto('Ce navigateur ne sait pas préparer l’image.')
    contexte.drawImage(image, 0, 0, canevas.width, canevas.height)
    // JPEG et non PNG : à qualité égale, une photo y pèse dix fois moins.
    return canevas.toDataURL('image/jpeg', 0.8)
  } finally {
    // L'URL d'objet ne se libère pas seule ; la data: n'a rien à libérer.
    if (source.startsWith('blob:')) URL.revokeObjectURL(source)
  }
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
