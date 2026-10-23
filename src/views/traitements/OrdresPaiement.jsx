/**
 * Page « Traitements → Ordre de Paiement » (§18, captures 61-62).
 *
 * « Edition Lettres Chèques/Ordre de Virement » : la liste des ordres de paiement
 * (chèques / virements libres) et le bouton « Etablir » pour en créer un. Monte
 * le composant <Referentiel /> de « Données de base » à partir du descripteur
 * (config.js) : liste, filtre par exercice, recherche, cases à cocher et saisie.
 *
 * Première tranche, sur ce qui est confirmé par les captures. À compléter quand
 * on aura : le modal en mode « Virement », l'impression de l'instrument et
 * l'écriture comptable (Dr charge du motif / Cr banque).
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import { ORDRES_PAIEMENT } from './config'

const OrdresPaiement = () => {
  // Stats (« Total : N ») posées en pastille à côté du titre, comme les autres
  // pages à onglets ; <Referentiel> les remonte via onStats.
  const [stats, setStats] = useState(null)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Edition Lettres Chèques/Ordre de Virement</h1>
              <PastillesStats segments={stats?.segments} />
            </div>
          </div>
        </div>

        <section className="ddb-contenu">
          <Referentiel referentiel={ORDRES_PAIEMENT} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default OrdresPaiement
