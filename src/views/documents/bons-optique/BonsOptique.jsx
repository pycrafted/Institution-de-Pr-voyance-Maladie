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

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel, { PastillesStats } from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import './bons-optique.scss'
import { BONS_OPTIQUE } from './config'

const BonsOptique = () => {
  // Total de la vue, remonté par <Referentiel /> (`onStats`) : la page le pose
  // contre son titre, comme Participants et Fournisseurs de soins. Il compte
  // la vue côté serveur - segment retenu (dont « À valider ») et recherche
  // compris.
  const [stats, setStats] = useState(null)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu bop-page">
          {/* Même chapeau que les écrans de Comptabilité et de Traitements. Le
              titre était rendu par <Referentiel /> lui-même, en petit, au-dessus
              de la liste ; il devient celui de la page. */}
          <header className="bop-chapeau">
            <div className="bop-titre-groupe">
              <h2 className="bop-titre">Bons Optique</h2>
              <PastillesStats segments={stats?.segments} />
            </div>
          </header>

          <Referentiel referentiel={BONS_OPTIQUE} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default BonsOptique
