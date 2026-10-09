/**
 * Où tourne l'application : iOS / Android, installée ou dans le navigateur.
 * Sert à la feuille d'installation et aux petits écarts de comportement.
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
