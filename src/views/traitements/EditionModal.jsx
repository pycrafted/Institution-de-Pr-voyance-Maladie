/**
 * Modal « Edition » des règlements (§17, captures 55-56).
 *
 * Choisit un état imprimé à générer, puis l'ouvre en PDF par-dessus la page :
 *   - Factures à Payer    : les factures marquées « A Payer ».
 *   - Factures non Payées : les factures comptabilisées restant à régler.
 *
 * Les « Lettres Chèque » et « Ordre de Virement » (captures 57-58) dépendent
 * d'un modèle de banque et d'un chéquier non encore décrits côté IPM ; ils ne
 * sont pas proposés ici.
 */

import React, { useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle } from '@coreui/react'

import { ouvrirPdf } from '../documents/commun'

const EDITIONS = [
  { valeur: 'a-payer', libelle: 'Factures à Payer' },
  { valeur: 'non-payees', libelle: 'Factures non Payées' },
]

const EditionModal = ({ visible, onFermer, type, exercice }) => {
  const [edition, setEdition] = useState('a-payer')

  const editer = () => {
    const choix = EDITIONS.find((e) => e.valeur === edition) || EDITIONS[0]
    const params = new URLSearchParams({ etat: edition, type })
    if (exercice) params.set('exercice', exercice)
    ouvrirPdf(`/factures/edition/?${params.toString()}`, choix.libelle, choix.libelle)
    onFermer()
  }

  return (
    <CModal visible={visible} onClose={onFermer} alignment="center" className="trt-edition">
      <CModalHeader>
        <CModalTitle>Edition</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="ddb-groupe">
          <label>Edition</label>
          <select
            className="ddb-champ ddb-champ-liste"
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
          >
            {EDITIONS.map((e) => (
              <option key={e.valeur} value={e.valeur}>
                {e.libelle}
              </option>
            ))}
          </select>
        </div>

        <div className="trt-reg-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="ddb-bouton-enregistrer ms-2" onClick={editer}>
            Editer
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default EditionModal
