/**
 * Préparation des tests unitaires (Vitest + jsdom).
 */

import '@testing-library/jest-dom/vitest'
// IndexedDB en mémoire pour idb-keyval (offline/stockage.ts).
import 'fake-indexeddb/auto'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// jsdom n'a pas matchMedia, dont Ionic et plateforme.ts se servent.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (requete: string) => ({
      matches: false,
      media: requete,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom ne fait pas défiler : Ionic (ion-segment, ion-content) appelle
// pourtant scrollTo/scrollIntoView sur ses éléments. Sans ces bouchons, les
// erreurs non interceptées font échouer toute la suite.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// Les Blob de jsdom n'ont ni text() ni arrayBuffer(), dont se servent le
// client API et le cache des PDF (IndexedDB). Même contrat que le
// navigateur, par FileReader.
function lireBlob<T extends string | ArrayBuffer>(
  blob: Blob,
  lecture: 'readAsText' | 'readAsArrayBuffer',
): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resoudre(lecteur.result as T)
    lecteur.onerror = () => rejeter(lecteur.error)
    lecteur[lecture](blob)
  })
}
if (!Blob.prototype.text) {
  Blob.prototype.text = function text() {
    return lireBlob<string>(this, 'readAsText')
  }
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return lireBlob<ArrayBuffer>(this, 'readAsArrayBuffer')
  }
}
