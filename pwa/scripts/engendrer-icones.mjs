/**
 * Engendre les icônes de l'application à partir du logo officiel.
 *
 *   node scripts/engendrer-icones.mjs
 *
 * Le logo SAR est ROUGE : c'est la marque, elle ne s'inverse pas. Il est donc
 * posé tel quel sur le fond de l'application (#f8f1f0), et non en blanc sur
 * une tuile rouge comme avant - l'icône d'un téléphone doit se reconnaître
 * d'un coup d'oeil, et c'est l'ovale rouge qu'on reconnaît.
 *
 * Le rendu passe par Chromium (déjà présent pour les tests) plutôt que par
 * une bibliothèque d'images : ni Pillow ni sharp ne sont installés, et une
 * page HTML donne un contrôle exact sur le cadrage et les coins.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..')
const FOND = '#f8f1f0'

/**
 * `part` : largeur du logo, en fraction de celle de l'icône.
 * `rayon` : coins arrondis, en fraction du côté ; 0 = carré plein.
 *
 * L'icône « maskable » est pleine et son logo plus petit : le système y
 * découpe lui-même un cercle, et tout ce qui déborde de la zone sûre (80 %
 * du côté) peut être rogné.
 */
const ICONES = [
  { fichier: 'icons/icone-192.png', cote: 192, part: 0.64, rayon: 0.22 },
  { fichier: 'icons/icone-512.png', cote: 512, part: 0.64, rayon: 0.22 },
  { fichier: 'icons/icone-maskable-512.png', cote: 512, part: 0.46, rayon: 0 },
  { fichier: 'icons/apple-touch-icon.png', cote: 180, part: 0.64, rayon: 0 },
  { fichier: 'icons/favicon-32.png', cote: 32, part: 0.86, rayon: 0 },
  // Source du favicon.ico, assemblé juste après.
  { fichier: 'icons/favicon-48.png', cote: 48, part: 0.86, rayon: 0 },
]

/**
 * Un .ico qui ENCAPSULE un PNG : le format l'autorise depuis Vista, et tous
 * les navigateurs d'aujourd'hui le lisent. Six octets d'en-tête, seize de
 * description, puis le PNG tel quel - plus simple que de produire un vrai
 * bitmap, et plus léger.
 */
function icoAutourDunPng(png, cote) {
  const entete = Buffer.alloc(6)
  entete.writeUInt16LE(0, 0) // réservé
  entete.writeUInt16LE(1, 2) // type : icône
  entete.writeUInt16LE(1, 4) // une seule image
  const description = Buffer.alloc(16)
  description.writeUInt8(cote < 256 ? cote : 0, 0) // largeur
  description.writeUInt8(cote < 256 ? cote : 0, 1) // hauteur
  description.writeUInt8(0, 2) // couleurs de la palette : aucune
  description.writeUInt8(0, 3) // réservé
  description.writeUInt16LE(1, 4) // plans
  description.writeUInt16LE(32, 6) // bits par pixel
  description.writeUInt32LE(png.length, 8)
  description.writeUInt32LE(entete.length + description.length, 12)
  return Buffer.concat([entete, description, png])
}

const logo = await readFile(resolve(RACINE, 'public/logo-sar.png'))
const logoEnLigne = `data:image/png;base64,${logo.toString('base64')}`

// `channel: 'msedge'` : le Chromium de Playwright n'est pas telechargeable
// depuis ce reseau (le pare-feu re-signe le TLS). Edge est deja la.
const navigateur = await chromium.launch({ channel: 'msedge' })
try {
  for (const { fichier, cote, part, rayon } of ICONES) {
    const page = await navigateur.newPage({
      viewport: { width: cote, height: cote },
      deviceScaleFactor: 1,
    })
    await page.setContent(`
      <style>
        html, body { margin: 0; width: ${cote}px; height: ${cote}px; background: transparent; }
        .fond {
          width: 100%; height: 100%;
          display: grid; place-items: center;
          background: ${FOND};
          border-radius: ${Math.round(cote * rayon)}px;
        }
        img { width: ${Math.round(cote * part)}px; display: block; }
      </style>
      <div class="fond"><img src="${logoEnLigne}" alt=""></div>
    `)
    // Les polices ne comptent pas ici, mais l'image doit être décodée.
    await page.evaluate(() => document.fonts.ready.then(() => document.querySelector('img').decode()))
    const png = await page.screenshot({ omitBackground: rayon > 0 })
    await writeFile(resolve(RACINE, 'public', fichier), png)
    await page.close()
    console.log(`${fichier.padEnd(32)} ${cote}x${cote}  ${png.length} octets`)

    if (fichier.endsWith('favicon-48.png')) {
      const ico = icoAutourDunPng(png, cote)
      await writeFile(resolve(RACINE, 'public/favicon.ico'), ico)
      console.log(`${'favicon.ico'.padEnd(32)} ${cote}x${cote}  ${ico.length} octets`)
    }
  }
} finally {
  await navigateur.close()
}
