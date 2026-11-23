/**
 * Code d'activation de l'application mobile, généré pour un participant
 * depuis sa ligne (action « Code d'activation mobile », cf. config.js).
 *
 * Le code n'est montré qu'UNE fois - le serveur ne le garde que chiffré - :
 * une fenêtre l'affiche en grand, avec un bouton pour le copier, le temps de
 * le remettre à l'employé (papier, téléphone, WhatsApp). Avec son matricule
 * et ce code, l'employé choisit son mot de passe dans l'application mobile.
 *
 * La config des listes est un simple objet : l'action y appelle
 * `afficherCodeActivation`, et la fenêtre, posée une fois dans la page
 * (Participants.jsx), s'ouvre d'elle-même.
 */

import React, { useEffect, useState } from 'react'
import { CButton, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCopy } from '@coreui/icons'

import { executerAction } from '../../services/referentiels'
import { toast } from '../../services/toast'

let ecouteur = null

/** Demande un nouveau code au serveur et l'affiche dans la fenêtre. */
export async function genererCodeActivation(participant) {
  const reponse = await executerAction('participants', participant.id, 'code-activation')
  ecouteur?.({
    code: reponse.code,
    expireLe: reponse.expireLe,
    nom: `${participant.prenoms || ''} ${participant.nom || ''}`.trim(),
    matricule: participant.matricule,
  })
}

const dateHeure = (iso) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function FenetreCodeActivation() {
  const [affiche, setAffiche] = useState(null)

  useEffect(() => {
    ecouteur = setAffiche
    return () => {
      ecouteur = null
    }
  }, [])

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(affiche.code)
      toast.success('Code copié')
    } catch {
      toast.error('Copie impossible : recopiez le code à la main')
    }
  }

  return (
    <CModal visible={Boolean(affiche)} onClose={() => setAffiche(null)} alignment="center">
      <CModalHeader>
        <CModalTitle>Code d’activation mobile</CModalTitle>
      </CModalHeader>
      {affiche && (
        <CModalBody>
          <p className="mb-2">
            Pour <strong>{affiche.nom || 'ce participant'}</strong> (matricule{' '}
            <strong>{affiche.matricule}</strong>) :
          </p>
          <p
            className="prt-code-activation"
            aria-label={`Code ${affiche.code.split('').join(' ')}`}
          >
            {affiche.code.slice(0, 3)} {affiche.code.slice(3)}
          </p>
          <p className="mb-2">
            Valable jusqu’au <strong>{dateHeure(affiche.expireLe)}</strong>, une seule fois.
          </p>
          <p className="text-body-secondary small mb-0">
            Remettez-le à l’employé : dans l’application mobile, il touche « J’ai un code de l’IPM
            », saisit son matricule et ce code, puis choisit son mot de passe. Ce code ne sera plus
            affiché ; en cas de perte, générez-en un nouveau (il remplace celui-ci).
          </p>
        </CModalBody>
      )}
      <CModalFooter>
        <CButton color="light" onClick={copier}>
          <CIcon icon={cilCopy} className="me-1" />
          Copier
        </CButton>
        <CButton color="danger" onClick={() => setAffiche(null)}>
          Fermer
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
