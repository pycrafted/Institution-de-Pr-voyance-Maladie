/**
 * Fenêtre d'avertissement, en remplacement de `window.confirm`.
 *
 * **Ce n'est plus une fenêtre de confirmation** (2026-11-25). Elle demandait
 * « êtes-vous sûr ? » après chaque écriture : enregistrer un formulaire,
 * désactiver une fiche, changer un état, refuser une demande. Un bouton
 * nommé qu'on vient de cliquer dit déjà ce qu'il fait ; redemander n'apprend
 * rien et n'empêche rien - la main clique « Oui » aussi vite que le bouton.
 *
 * Elle ne s'ouvre plus que dans trois cas, et il faut pouvoir les nommer :
 *
 *   1. **Une suppression réelle.** Les données partent et rien ne les ramène
 *      (un compte utilisateur, un taux exceptionnel, un appel de cotisation
 *      et ses lignes).
 *   2. **Une écriture définitive au grand livre.** Comptabiliser une facture,
 *      générer le report à nouveau, clôturer le mois.
 *   3. **Une information que l'écran ne donne nulle part ailleurs.** « Ce
 *      bénéficiaire a déjà eu un bon d'optique il y a moins de deux ans » ;
 *      « vous avez coché quatre lignes, mais la pièce entière en compte
 *      deux cents ». Là, la fenêtre ne freine pas : elle corrige ce que
 *      l'utilisateur croit faire.
 *
 * Elle sert aussi, à un seul bouton (`annuler: null`), à poser un rapport
 * qu'un toast tronquerait - le détail d'un import refusé.
 *
 * Dans les listes (cf. Referentiel.jsx), une action ne l'ouvre que si elle
 * déclare `avertir` ; sans quoi elle part au clic.
 *
 * Usage :
 *   const [demanderConfirmation, modale, ouverte] = useConfirmation()
 *   const confirme = await demanderConfirmation({ titre, message, confirmer: 'Supprimer', danger: true })
 *   if (!confirme) return
 *   …
 *   return <>…{modale}</>
 *
 * Options :
 *   titre, message  le message garde ses retours à la ligne
 *   confirmer       libellé du bouton d'action (« Confirmer » par défaut)
 *   annuler         libellé du bouton de renoncement (« Annuler » par défaut) ;
 *                   null pour une simple information, à un seul bouton
 *   danger          bouton d'action en rouge (suppression, suspension)
 *   large           fenêtre élargie, pour un long rapport
 *
 * `ouverte` permet à un panneau déjà ouvert (le formulaire latéral) de se
 * mettre en retrait le temps de la question : deux pièges à focus actifs en
 * même temps se disputeraient le clavier.
 */

import React, { useCallback, useRef, useState } from 'react'
import { CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react'

export function useConfirmation() {
  const [ouverte, setOuverte] = useState(false)
  // Le contenu survit à la fermeture : la fenêtre s'efface en fondu et ne doit
  // pas se vider sous les yeux avant de disparaître.
  const [options, setOptions] = useState({})
  const resoudre = useRef(null)

  const demander = useCallback(
    (nouvelles) =>
      new Promise((resolve) => {
        // Une question encore pendante (cas limite) vaut refus.
        resoudre.current?.(false)
        resoudre.current = resolve
        setOptions(nouvelles)
        setOuverte(true)
      }),
    [],
  )

  // Ne répond qu'une fois : la fenêtre signale aussi sa propre fermeture
  // (Échap, clic hors du cadre, croix, ou fin de fondu après un bouton).
  const conclure = useCallback((reponse) => {
    resoudre.current?.(reponse)
    resoudre.current = null
    setOuverte(false)
  }, [])

  const {
    titre,
    message,
    confirmer = 'Confirmer',
    annuler = 'Annuler',
    danger = false,
    large = false,
  } = options

  const modale = (
    <CModal
      visible={ouverte}
      onClose={() => conclure(false)}
      alignment="center"
      size={large ? 'lg' : undefined}
      className="ddb-confirmation"
      aria-labelledby="ddb-confirmation-titre"
    >
      <CModalHeader>
        <CModalTitle id="ddb-confirmation-titre">{titre}</CModalTitle>
      </CModalHeader>
      <CModalBody>{message}</CModalBody>
      <CModalFooter>
        {annuler && (
          <button
            type="button"
            className="ddb-confirmation-annuler"
            onClick={() => conclure(false)}
          >
            {annuler}
          </button>
        )}
        <button
          type="button"
          className={`ddb-confirmation-valider${danger ? ' ddb-confirmation-danger' : ''}`}
          onClick={() => conclure(true)}
        >
          {confirmer}
        </button>
      </CModalFooter>
    </CModal>
  )

  return [demander, modale, ouverte]
}
