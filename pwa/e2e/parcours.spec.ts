import { expect, test, type Page } from '@playwright/test'

import { capturer, codesBonsIpm, E2E, fermerFeuilleInstallation, identifier } from './outils'

/**
 * Parcours complet d'un participant, contre un vrai Django lancé sur une
 * COPIE de la base (SPEC §5.3) : identification → nouveau bon → détail avec
 * le PDF rendu → le bon dans l'API IPM → « Mes bons » → hors ligne →
 * déconnexion. Un seul test, en série : chaque étape dépend de la précédente.
 */

/** Un canvas pdf.js réellement dessiné (au moins un pixel non blanc). */
async function canvasDessine(page: Page): Promise<boolean> {
  return page
    .locator('canvas.pdf-visionneuse__canvas')
    .first()
    .evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0) return false
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < data.length; i += 4 * 97) {
        if (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200) return true
      }
      return false
    })
}

test('identification, nouveau bon, PDF, Mes bons, hors ligne, déconnexion', async ({
  page,
  context,
}, info) => {
  test.skip(!E2E.jetonStaff, 'IPM_E2E_JETON_STAFF manquant (cf. e2e/README.md)')
  const projet = info.project.name

  // 1. Identification avec un vrai participant de la copie.
  await identifier(page, projet)
  await fermerFeuilleInstallation(page)
  await capturer(page, projet, '02-accueil')

  // 2. Nouveau bon, de bout en bout.
  // La grande carte de service de l'accueil (§3.4) ouvre l'assistant.
  await page.locator('[data-service="bon-pharmacie"]').first().click()
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible()
  await capturer(page, projet, '03-nb-beneficiaire')
  // Depuis la refonte, chaque proposition est une carte de la charte (§3.5) ;
  // data-liste est la prise stable de l'assistant, comme data-service sur
  // l'accueil (le libellé lu, lui, change avec la spécialité choisie).
  await page.locator('[data-liste="beneficiaires"] .ipm-carte-liste').first().click()

  await expect(page.getByText('Étape 2 sur 5')).toBeVisible()
  await capturer(page, projet, '04-nb-specialite')
  await page.locator('[data-liste="specialites"] .ipm-carte-liste').first().click()
  await page.locator('[data-liste="prescripteurs"] .ipm-carte-liste').first().click()

  await expect(page.getByText('Étape 3 sur 5')).toBeVisible()
  await capturer(page, projet, '05-nb-pharmacie')
  await page.locator('[data-liste="pharmacies"] .ipm-carte-liste').first().click()

  await expect(page.getByText('Étape 4 sur 5')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter un article' }).click()
  await capturer(page, projet, '06-nb-ordonnance')
  await page.getByRole('button', { name: 'Continuer' }).click()

  await expect(page.getByText('Étape 5 sur 5')).toBeVisible()
  await capturer(page, projet, '07-nb-recapitulatif')

  // Hors ligne au récapitulatif : la génération est désactivée, expliquée.
  await context.setOffline(true)
  await expect(page.getByText(/Vous êtes hors ligne/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Générer le bon' })).toBeDisabled()
  await capturer(page, projet, '08-nb-hors-ligne')
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: 'Générer le bon' })).toBeEnabled()

  const creation = page.waitForResponse(
    (r) => r.url().includes('/api/mobile/bons-pharmacie/') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Générer le bon' }).click()
  const reponse = await creation
  expect(reponse.status()).toBe(201)
  const bon = (await reponse.json()) as { id: number; code: string }
  await expect(page.getByText(bon.code).first()).toBeVisible()
  await capturer(page, projet, '09-nb-succes')

  // 3. Détail avec le PDF officiel rendu par pdf.js.
  await expect(page.locator('.detail-bon__numero')).toHaveText(bon.code, { timeout: 15_000 })
  await expect(page.locator('canvas.pdf-visionneuse__canvas').first()).toBeVisible({
    timeout: 30_000,
  })
  await expect.poll(() => canvasDessine(page), { timeout: 20_000 }).toBe(true)
  await capturer(page, projet, '10-detail')

  // 4. Le bon est dans le tableau IPM (API IPM, jeton d'un agent staff).
  expect(await codesBonsIpm()).toContain(bon.code)

  // 5. Mes bons, par l'onglet (navigation dans l'application, sans
  // rechargement), puis le détail en touchant la ligne : c'est ce parcours
  // qui affichait « Bon introuvable » quand Ionic passait à la page un match
  // sans paramètres (route « attrape-tout », cf. App.tsx).
  await page.locator('ion-tab-button[tab="bons"]').click()
  const ligne = page.locator('.ipm-carte-liste:visible', { hasText: bon.code }).first()
  await expect(ligne).toBeVisible({ timeout: 15_000 })
  await capturer(page, projet, '11-mes-bons')
  await ligne.click()
  await expect(page).toHaveURL(new RegExp(`/bons/${bon.id}$`))
  await expect(page.locator('.detail-bon__numero:visible')).toHaveText(bon.code, {
    timeout: 15_000,
  })
  await expect(page.getByText('Bon introuvable')).toHaveCount(0)
  await page.goto('/bons')
  await expect(page.getByText(bon.code).first()).toBeVisible({ timeout: 15_000 })

  // 6. Hors ligne : la liste et le PDF déjà vu restent disponibles.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(bon.code).first()).toBeVisible({ timeout: 15_000 })
  // « Hors ligne » si le navigateur le sait, « Serveur injoignable » sinon
  // (après un rechargement hors ligne, Chromium annonce parfois navigator.onLine).
  await expect(page.getByText(/Hors ligne|Serveur injoignable/).first()).toBeVisible()
  await capturer(page, projet, '12-mes-bons-hors-ligne')
  await page.getByText(bon.code).first().click()
  await expect(page.locator('.detail-bon__numero')).toHaveText(bon.code)
  await expect.poll(() => canvasDessine(page), { timeout: 20_000 }).toBe(true)
  await capturer(page, projet, '13-detail-hors-ligne')
  await context.setOffline(false)

  // 7. Profil puis déconnexion (avec confirmation).
  await page.goto('/profil')
  await expect(page.getByText('Se déconnecter').first()).toBeVisible()
  await capturer(page, projet, '14-profil')
  // Depuis la refonte, « Se déconnecter » est une carte d'action (§3.5) et
  // non plus un ion-item : .profil__deconnexion est sa prise stable.
  await page.locator('.profil__deconnexion').click()
  await capturer(page, projet, '15-deconnexion-confirmation')
  await page.locator('ion-action-sheet button', { hasText: 'Se déconnecter' }).click()
  await expect(page.getByText('Bienvenue')).toBeVisible({ timeout: 15_000 })
  // Le jeton et les caches sont effacés : un rechargement reste sur l'identification.
  await page.reload()
  await expect(page.getByText('Bienvenue')).toBeVisible({ timeout: 15_000 })
})

test('identification refusée : message clair, aucun jeton', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Bienvenue')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('textbox', { name: 'Matricule' }).click()
  // Jamais de feuille d'installation par-dessus la saisie de l'identification.
  await page.waitForTimeout(2_500)
  await expect(page.getByRole('heading', { name: 'Installer IPM Mobile' })).toBeHidden()
  await page.getByRole('textbox', { name: 'Matricule' }).fill('99999999')
  await page.getByText('Date de naissance', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByText('Matricule ou date de naissance incorrect.')).toBeVisible()
})
