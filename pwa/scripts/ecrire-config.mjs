// Après « vite build » (hook npm postbuild) : écrit l'adresse de l'API dans
// dist/config.json quand IPM_API_BASE est définie.
//
// public/config.json garde « /api » (relais Vite en développement). Sur IIS,
// deploy/publier.ps1 -ApiBase réécrit le fichier à la publication ; sur Vercel,
// personne ne repasse après le build : c'est la variable d'environnement du
// projet (IPM_API_BASE = https://ipm-api.onrender.com/api) qui le fait, ici.
// Sans la variable, rien ne change.
import { readFileSync, writeFileSync } from 'node:fs'

const apiBase = (process.env.IPM_API_BASE ?? '').trim().replace(/\/+$/, '')
// Clé Google Maps (carte des structures conventionnées). Clé de FRONT : elle
// finit dans config.json, donc à restreindre par référent HTTP côté Google.
const mapsKey = (process.env.IPM_GOOGLE_MAPS_KEY ?? '').trim()

// Rien à injecter (ni API ni Maps) : on laisse config.json tel quel.
if (!apiBase && !mapsKey) process.exit(0)

if (apiBase && !/^https?:\/\//.test(apiBase) && !apiBase.startsWith('/')) {
  console.error(`IPM_API_BASE doit être une URL absolue ou un chemin commençant par « / » : ${apiBase}`)
  process.exit(1)
}

const chemin = new URL('../dist/config.json', import.meta.url)
const config = JSON.parse(readFileSync(chemin, 'utf-8'))
if (apiBase) config.apiBase = apiBase
if (mapsKey) config.cleGoogleMaps = mapsKey
writeFileSync(chemin, `${JSON.stringify(config, null, 2)}\n`)
console.warn(
  `dist/config.json : apiBase = ${config.apiBase}, cleGoogleMaps = ${mapsKey ? 'posée' : '(vide)'}`,
)
