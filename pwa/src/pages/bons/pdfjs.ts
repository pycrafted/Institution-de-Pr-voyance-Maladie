/**
 * Chargement paresseux de pdf.js pour la visionneuse.
 *
 * pdf.js pèse plusieurs centaines de Ko : il n'est chargé qu'à l'ouverture
 * du premier bon (import dynamique → morceau séparé du build), puis gardé.
 *
 * Build « legacy » : le build moderne de pdf.js 5 exige des navigateurs très
 * récents (Safari 17.4+), or les employés gardent souvent leur téléphone
 * plusieurs années ; le legacy embarque les compléments nécessaires.
 *
 * Worker : `?url` fait émettre par Vite le fichier du worker tel quel dans
 * `assets/` (même origine, donc permis par la CSP `worker-src 'self'`, et
 * précaché par le service worker pour l'affichage hors ligne).
 */

import type * as PdfJs from 'pdfjs-dist'

export type ModulePdfJs = typeof PdfJs
export type DocumentPdf = PdfJs.PDFDocumentProxy
export type PagePdf = PdfJs.PDFPageProxy

let chargement: Promise<ModulePdfJs> | null = null

export function chargerPdfjs(): Promise<ModulePdfJs> {
  if (chargement) return chargement
  const promesse = Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs as unknown as ModulePdfJs
  })
  // Un échec (hors ligne avant la mise en cache du morceau) ne doit pas
  // empêcher de réessayer plus tard.
  promesse.catch(() => {
    if (chargement === promesse) chargement = null
  })
  chargement = promesse
  return promesse
}

/** Octets d'un Blob, y compris là où Blob.arrayBuffer manque (vieux Safari, jsdom). */
export async function octetsDuBlob(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resolve(new Uint8Array(lecteur.result as ArrayBuffer))
    lecteur.onerror = () => reject(lecteur.error ?? new Error('Lecture du PDF impossible'))
    lecteur.readAsArrayBuffer(blob)
  })
}

/** Ouvre le PDF. pdf.js transfère les octets à son worker : on lui passe une copie. */
export async function ouvrirPdf(pdf: Blob): Promise<{ document: DocumentPdf; fermer: () => void }> {
  const pdfjs = await chargerPdfjs()
  const tache = pdfjs.getDocument({
    // Pas d'option isEvalSupported : pdf.js 5 n'évalue plus aucun code venu
    // du PDF (l'option a disparu), et la CSP l'interdirait de toute façon.
    data: await octetsDuBlob(pdf),
    // Le bon utilise les polices standard (Times) non incorporées : pdf.js
    // les remplace par les polices du système.
    useSystemFonts: true,
  })
  const document = await tache.promise
  return { document, fermer: () => void tache.destroy() }
}
