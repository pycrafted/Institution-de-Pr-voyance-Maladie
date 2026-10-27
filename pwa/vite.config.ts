/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// IPM Mobile : site à part entière, sans code commun avec le front IPM (src/
// à la racine du dépôt). Il ne parle à IPM que par l'API HTTP, dont l'adresse
// est lue à l'exécution dans /config.json (cf. src/api/config.ts).

// Version affichée dans « Profil → À propos » (src/version.ts).
const version = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
    version: string
  }
).version

// Django vers lequel Vite relaie /api (dev et preview). Les tests e2e lancent
// un backend sur une COPIE de la base, sur un autre port
// (IPM_API_CIBLE=http://127.0.0.1:8010), sans toucher au service local.
const cibleApi = process.env.IPM_API_CIBLE ?? 'http://127.0.0.1:8000'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      // Le nouveau service worker se télécharge seul, puis attend : c'est
      // l'application qui l'active (au lancement, ou par le toast
      // « Recharger ») en lui envoyant SKIP_WAITING — cf.
      // src/components/MiseAJour.tsx. « prompt » et non « autoUpdate » : avec
      // injectRegister: false, autoUpdate ne posait de toute façon pas
      // skipWaiting, et le poser activerait la version sous une page ouverte
      // dont les morceaux chargés à la demande viennent d'être effacés.
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      // Le logo SAR sert à l'écran : il doit être là hors ligne, comme les icônes.
      includeAssets: ['favicon.ico', 'icons/*.png', 'logo-sar.png'],
      manifest: {
        id: '/',
        name: 'IPM Mobile',
        short_name: 'IPM',
        description: 'Vos bons et lettres de garantie IPM SAR, sur votre téléphone.',
        lang: 'fr-FR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Barre d'état et écran de lancement généré par Android : le noir
        // SAR, haut du dégradé de marque (--deg-marque). Mêmes valeurs que
        // les <meta name="theme-color"> d'index.html et que les PNG de
        // public/splash/ — sans quoi le lancement ferait un saut de couleur.
        theme_color: '#1D1D1B',
        background_color: '#ECE4E3',
        categories: ['medical', 'health'],
        // `?v=` : Chrome ne refait l'icône de l'écran d'accueil que si le
        // MANIFESTE a changé - il ne retélécharge pas les fichiers pour
        // comparer. Changer le dessin sans changer l'URL laisse donc
        // l'ancienne icône en place, même après réinstallation. À incrémenter
        // à chaque refonte des icônes.
        icons: [
          { src: '/icons/icone-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icone-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icone-maskable-512.png?v=2',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Le shell (JS, CSS, icônes) est précaché. Les écrans de lancement
        // iOS ne servent qu'au lancement de l'application installée : inutile
        // d'en charger 250 Ko à chaque mise à jour.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        globIgnores: ['splash/**', 'config.json'],
        // Le worker de pdf.js dépasse la limite par défaut de 2 Mo.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Ionic route côté navigateur (BrowserRouter) : toute navigation
        // retombe sur index.html, sauf l'API et l'administration d'IPM si
        // elles sont un jour servies sur la même origine.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
        runtimeCaching: [
          {
            // config.json : la version du serveur quand il répond (l'adresse
            // de l'API peut changer sans nouveau build), la dernière connue
            // hors ligne.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/config.json',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ipm-config',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 1 },
            },
          },
          // Les appels à l'API ne sont volontairement PAS mis en cache par
          // Workbox : ils portent le jeton et des données personnelles. Le
          // hors-ligne des bons et des PDF est tenu par l'application
          // (src/offline/), qui sait tout effacer à la déconnexion.
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5174,
    // En développement, config.json vaut « /api » : Vite relaie vers le
    // Django local, sans CORS.
    proxy: { '/api': { target: cibleApi, changeOrigin: true } },
  },
  preview: {
    port: 4174,
    proxy: { '/api': { target: cibleApi, changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Ionic et ionicons sont publiés en ESM pur : Vitest doit les transformer.
    server: { deps: { inline: [/@ionic/, /ionicons/] } },
  },
})
