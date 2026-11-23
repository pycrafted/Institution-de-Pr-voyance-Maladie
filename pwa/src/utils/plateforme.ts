/**
 * Où tourne l'application : iOS / Android, installée ou dans le navigateur.
 * Sert au guide d'installation (/telecharger) et aux petits écarts de
 * comportement.
 * (Le mode visuel ios/md est choisi par Ionic lui-même : ne pas le forcer.)
 */

export function estIOS(ua = navigator.userAgent): boolean {
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function estAndroid(ua = navigator.userAgent): boolean {
  return /Android/i.test(ua)
}

/** Lancée depuis l'écran d'accueil (application installée). */
export function estInstallee(): boolean {
  const standaloneIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneIOS || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/**
 * Les trois familles d'appareils, du point de vue de l'installation : iOS ne
 * sait l'offrir que par le menu « Partager » de Safari, Android la propose en
 * un geste, et les autres passent par le menu de leur navigateur.
 *
 * Vivait dans components/InstallSheet.tsx, retirée en novembre 2026 : la
 * fonction est restée, la fenêtre non.
 */
export type PlateformeInstallation = 'ios' | 'android' | 'autre'

export function plateformeCourante(): PlateformeInstallation {
  if (estIOS()) return 'ios'
  if (estAndroid()) return 'android'
  return 'autre'
}
