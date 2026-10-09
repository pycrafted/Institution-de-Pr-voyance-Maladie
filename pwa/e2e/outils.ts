import { expect, type Page } from '@playwright/test'

/**
 * Outils partagés des scénarios e2e.
 *
 * Tout ce qui dépend de la base de test vient de variables d'environnement
 * (cf. e2e/README.md) : le participant utilisé, l'adresse directe de Django et
 * le jeton d'un agent IPM (staff) créé DANS LA COPIE de la base.
 */
export const E2E = {
  matricule: process.env.IPM_E2E_MATRICULE ?? '01-1204',
  naissance: process.env.IPM_E2E_NAISSANCE ?? '1962-01-01',
  /** Django joint directement (sans le relais de vite preview). */
  api: process.env.IPM_API_CIBLE ?? 'http://127.0.0.1:8010',
  jetonStaff: process.env.IPM_E2E_JETON_STAFF ?? '',
  /** Dossier des captures d'écran (hors du dépôt). */
  captures: process.env.IPM_E2E_CAPTURES ?? 'test-results/captures',
}

/** Capture pleine page, nommée par projet (iphone-13 / pixel-7). */
export async function capturer(page: Page, projet: string, nom: string) {
  // Laisser finir les transitions d'Ionic avant la photo.
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${E2E.captures}/${projet}-${nom}.png` })
}

/**
 * Choisit une date dans un IonDatetime en roues. Faire tourner les roues à la
 * souris n'est pas fiable : on pose la valeur puis on confirme, ce qui émet
 * ionChange comme un vrai choix.
 */
export async function choisirDate(page: Page, selecteur: string, date: string) {
  await page.locator(selecteur).evaluate(async (el, valeur) => {
    const datetime = el as HTMLElement & {
      componentOnReady?: () => Promise<unknown>
      value?: string
      confirm: (fermer?: boolean) => Promise<void>
    }
    await datetime.componentOnReady?.()
    datetime.value = valeur
    await new Promise((ok) => setTimeout(ok, 50))
    await datetime.confirm(false)
  }, date)
}

/** Écran d'identification → onglet Accueil. */
export async function identifier(page: Page, projet?: string) {
  await page.goto('/')
  await expect(page.getByText('Bienvenue')).toBeVisible({ timeout: 20_000 })
  if (projet) await capturer(page, projet, '01-identification')
  await page.getByRole('textbox', { name: 'Matricule' }).fill(E2E.matricule)
  await page.getByText('Date de naissance', { exact: true }).first().click()
  await choisirDate(page, 'ion-datetime[aria-label="Date de naissance"]', E2E.naissance)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByText(/Bonjour|Bonsoir/).first()).toBeVisible({ timeout: 20_000 })
}

/** Les bons connus de l'API IPM (écran /#/documents/bons-pharmacie), jeton staff. */
export async function codesBonsIpm(): Promise<string[]> {
  const reponse = await fetch(`${E2E.api}/api/bons-pharmacie/`, {
    headers: { Authorization: `Token ${E2E.jetonStaff}` },
  })
  expect(reponse.status).toBe(200)
  const donnees = (await reponse.json()) as { code: string }[] | { results: { code: string }[] }
  const bons = Array.isArray(donnees) ? donnees : donnees.results
  return bons.map((bon) => bon.code)
}

/**
 * La feuille d'installation vient d'elle-même peu après l'arrivée sur
 * l'accueil (iOS toujours ; Android seulement si le navigateur propose
 * l'installation). On la referme par « Compris » si elle se présente.
 */
export async function fermerFeuilleInstallation(page: Page) {
  const titre = page.getByRole('heading', { name: 'Installer IPM Mobile' })
  try {
    await titre.waitFor({ state: 'visible', timeout: 4_000 })
  } catch {
    return
  }
  // On referme par le bouton du bas (« Compris » / « Plus tard »), celui que
  // l'utilisateur touche réellement : la croix est en haut de la feuille, hors
  // du champ visible dès que le contenu dépasse l'écran.
  await page
    .locator('ion-modal.installation-feuille')
    .getByRole('button', { name: /^(Compris|Plus tard)$/ })
    .first()
    .click()
  await expect(titre).toBeHidden()
}
