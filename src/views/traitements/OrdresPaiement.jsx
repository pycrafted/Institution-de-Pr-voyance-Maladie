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

import React from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import './ordres-paiement.scss'
import { ORDRES_PAIEMENT } from './config'

const OrdresPaiement = () => (
  <CCard className="ddb-carte">
    <CCardBody className="p-0">
      <section className="ddb-contenu ord-page">
        {/* Même chapeau que les écrans de Comptabilité, titre seul : l'écran
            n'a ni sous-onglets ni action de page. « Etablir » est dans le pied
            du panneau, en accent - c'est l'action de la page. */}
        <header className="ord-chapeau">
          <h2 className="ord-titre">Edition Lettres Chèques/Ordre de Virement</h2>
        </header>

        <Referentiel referentiel={ORDRES_PAIEMENT} />
      </section>
    </CCardBody>
  </CCard>
)

export default OrdresPaiement
