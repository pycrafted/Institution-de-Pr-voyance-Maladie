/**
 * Aperçu d'un document imprimé, sur le modèle des toasts : un événement
 * global, écouté par <ApercuPdf /> (components/ApercuPdf.jsx), monté une fois
 * dans la mise en page.
 *
 * Usage :
 *   ouvrirApercu({ titre: 'Bon de pharmacie BPI000123', nomFichier: 'BPI000123',
 *                  charger: () => telecharger('/bons-pharmacie/12/pdf/') })
 *
 * `charger` rend le document (un Blob) : la fenêtre s'ouvre tout de suite et
 * patiente pendant qu'il arrive.
 */

export const EVENEMENT_APERCU = 'ipm-apercu-pdf'

// Ne renvoie rien : l'aperçu se montre de lui-même, il n'y a pas de message à
// afficher après lui (cf. les actions de ligne de Referentiel.jsx).
export const ouvrirApercu = ({ titre, nomFichier, charger }) => {
  window.dispatchEvent(
    new CustomEvent(EVENEMENT_APERCU, { detail: { titre, nomFichier, charger } }),
  )
}
