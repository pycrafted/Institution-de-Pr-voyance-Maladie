/**
 * Page « Bons Optique ».
 *
 * La caisse commande à un opticien, au vu d'une ordonnance, les articles d'un
 * bénéficiaire. Comme les bons de pharmacie, la page ne réécrit rien : elle
 * monte le composant <Referentiel /> avec son descripteur (config.js).
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import './bons-optique.scss'
import { BONS_OPTIQUE } from './config'

const BonsOptique = () => (
  <CCard className="ddb-carte">
    <CCardBody className="p-0">
      <section className="ddb-contenu bop-page">
        {/* Même chapeau que les écrans de Comptabilité et de Traitements. Le
            titre était rendu par <Referentiel /> lui-même, en petit, au-dessus
            de la liste ; il devient celui de la page. */}
        <header className="bop-chapeau">
          <h2 className="bop-titre">Bons Optique</h2>
        </header>

        <Referentiel referentiel={BONS_OPTIQUE} />
      </section>
    </CCardBody>
  </CCard>
)

export default BonsOptique
