/**
 * Fenêtre de confirmation, en remplacement de `window.confirm`.
 *
 * Ajouter, modifier, supprimer, agir sur un lot, importer : tout ce qui écrit
 * se confirme dans une fenêtre aux couleurs de l'application, et non dans la
 * boîte grise du navigateur - qui ne se met pas en forme, et que l'on peut
 * faire taire d'une case à cocher.
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
