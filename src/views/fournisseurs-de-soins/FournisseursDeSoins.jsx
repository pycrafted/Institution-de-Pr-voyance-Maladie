/**
 * Page « Fournisseurs de Soins ».
 *
 * Les prestataires conventionnés — cliniques, pharmacies, laboratoires,
 * cabinets — que la caisse rembourse. Deux onglets, comme l'application
 * d'origine :
 *   - Tous les Fournisseurs   les prestataires agréés
 *   - Demandes d'agrément     les demandes en attente d'instruction ; une
 *                             demande validée rejoint l'onglet précédent
 *
 * Chaque onglet monte le composant <Referentiel /> de « Données de base »
 * plutôt que de réécrire un écran équivalent : même tableau à en-tête noir,
 * même panneau latéral, mêmes gestes. Les feuilles de styles sont importées
 * ici parce que les vues sont chargées à la demande — arriver directement sur
 * /fournisseurs-de-soins ne monte pas les autres pages, donc ne charge pas
 * leurs styles. La barre d'onglets est celle de la page Participants.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import { FOURNISSEURS_DE_SOINS } from './config'
import { DEMANDES_AGREMENT } from './demandesAgrement'

const ONGLETS = [
  { cle: 'fournisseurs', libelle: 'Tous les Fournisseurs', referentiel: FOURNISSEURS_DE_SOINS },
  { cle: 'demandes', libelle: 'Demandes d’agrément', referentiel: DEMANDES_AGREMENT },
]

const FournisseursDeSoins = () => {
  const [onglet, setOnglet] = useState(ONGLETS[0].cle)
  const courant = ONGLETS.find((o) => o.cle === onglet)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <h1 className="prt-titre">Fournisseurs de Soins</h1>
          <nav className="prt-onglets" aria-label="Sections des fournisseurs de soins">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-onglet${onglet === o.cle ? ' prt-onglet-actif' : ''}`}
                onClick={() => setOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </nav>
        </div>

        <section className="ddb-contenu">
          {/* `key` : changer d'onglet remonte le composant, qui relit la base.
              Un fournisseur tout juste agréé apparaît donc dès qu'on revient
              sur la liste, sans avoir à actualiser la page. */}
          <Referentiel key={courant.cle} referentiel={courant.referentiel} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default FournisseursDeSoins
