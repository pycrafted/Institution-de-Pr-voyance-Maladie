import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout d'IPM Mobile, en émulation téléphone.
//
// Le pare-feu bloque le téléchargement des navigateurs de Playwright : on
// pilote celui déjà installé sur le serveur. Edge et Chrome y sont tous deux ;
// « msedge » par défaut, IPM_E2E_CANAL=chrome pour changer.
//
// Le backend doit tourner sur une COPIE de la base (jamais backend/db.sqlite3).
// Sans IPM_E2E_URL, on construit et sert le PWA localement (vite preview
// relaie /api vers Django sur 127.0.0.1:8000).
const canal = process.env.IPM_E2E_CANAL ?? 'msedge'
const url = process.env.IPM_E2E_URL ?? 'http://127.0.0.1:4174'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Un seul à la fois : les scénarios créent des bons dans la même base.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: url,
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // iPhone 13 : WebKit n'est pas téléchargeable ici. On émule l'appareil
    // (taille, densité, tactile, agent utilisateur iOS, donc mode Ionic
    // « ios ») dans le Chromium installé.
    {
      name: 'iphone-13',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: canal },
    },
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'], channel: canal },
    },
  ],
  webServer: process.env.IPM_E2E_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --strictPort',
        url,
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
