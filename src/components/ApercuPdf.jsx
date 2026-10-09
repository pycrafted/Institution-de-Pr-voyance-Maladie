/**
 * Aperçu d'un document imprimé (PDF), en surimpression plein écran.
 *
 * Comme l'intranet SAR : le document s'ouvre par-dessus la page, dans le
 * lecteur PDF du navigateur - sa barre porte l'impression, l'enregistrement
 * et le zoom -, sans nouvel onglet ni adresse « blob:… ». La croix en haut à
 * droite, ou la touche Échap, referme l'aperçu.
 *
 * Monté une fois dans la mise en page ; on l'ouvre de n'importe où par
 * `ouvrirApercu` (services/apercu.js).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilX } from '@coreui/icons'

import { EVENEMENT_APERCU } from '../services/apercu'
import { messageErreur } from '../services/erreurs'
import { toast } from '../services/toast'
import './apercu-pdf.scss'

const ApercuPdf = () => {
  // Document montré ({ titre, nomFichier, charger }) ; null : aperçu fermé.
  const [demande, setDemande] = useState(null)
  const [adresse, setAdresse] = useState(null)
  // Deux impressions demandées coup sur coup : seule la dernière s'affiche.
  const derniere = useRef(0)
  const croix = useRef(null)

  useEffect(() => {
    const ouvrir = async ({ detail }) => {
      const numero = ++derniere.current
      setDemande(detail)
      setAdresse(null)
      try {
        const blob = await detail.charger()
        if (numero === derniere.current) setAdresse(URL.createObjectURL(blob))
      } catch (e) {
        if (numero !== derniere.current) return
        setDemande(null)
        toast.error(`Impression impossible : ${messageErreur(e)}`)
      }
    }
    window.addEventListener(EVENEMENT_APERCU, ouvrir)
    return () => window.removeEventListener(EVENEMENT_APERCU, ouvrir)
  }, [])

  // L'adresse du document est libérée dès qu'il quitte l'écran.
  useEffect(() => () => adresse && URL.revokeObjectURL(adresse), [adresse])

  const fermer = useCallback(() => {
    derniere.current += 1
    setDemande(null)
    setAdresse(null)
  }, [])

  // Aperçu ouvert : Échap le referme, et la page dessous ne défile plus.
  useEffect(() => {
    if (!demande) return undefined
    const touche = (e) => {
      if (e.key === 'Escape') fermer()
    }
    window.addEventListener('keydown', touche)
    const debordement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    croix.current?.focus()
    return () => {
      window.removeEventListener('keydown', touche)
      document.body.style.overflow = debordement
    }
  }, [demande, fermer])

  if (!demande) return null

  return createPortal(
    <div className="apercu-pdf" role="dialog" aria-modal="true" aria-label={demande.titre}>
      <button
        ref={croix}
        type="button"
        className="apercu-pdf-fermer"
        onClick={fermer}
        aria-label="Fermer l’aperçu"
        title="Fermer"
      >
        <CIcon icon={cilX} customClassName="apercu-pdf-croix" />
      </button>
      {adresse ? (
        <iframe src={adresse} title={demande.titre} className="apercu-pdf-cadre" />
      ) : (
        <div className="apercu-pdf-attente">
          <CSpinner size="sm" />
          <span>Préparation du document…</span>
        </div>
      )}
    </div>,
    document.body,
  )
}

export default ApercuPdf
