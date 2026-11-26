/**
 * Page « LG Hospitalisation ».
 *
 * La caisse s'engage envers une structure de santé à prendre en charge
 * l'hospitalisation d'un bénéficiaire. Comme les autres documents, la page ne
 * réécrit rien : elle monte le composant <Referentiel /> avec son descripteur
 * (config.js).
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel, { PastillesStats } from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import './lg-hospitalisation.scss'
import { LG_HOSPITALISATION } from './config'

const LgHospitalisation = () => {
  // Total de la vue, remonté par <Referentiel /> (`onStats`) : la page le pose
  // contre son titre, comme Participants et Fournisseurs de soins. Il compte
  // la vue côté serveur - segment retenu et recherche compris.
  const [stats, setStats] = useState(null)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu lgh-page">
          {/* Même chapeau que les écrans de Comptabilité et de Traitements. Le
              titre était rendu par <Referentiel /> lui-même, en petit, au-dessus
              de la liste ; il devient celui de la page. */}
          <header className="lgh-chapeau">
            <div className="lgh-titre-groupe">
              <h2 className="lgh-titre">LG Hospitalisation</h2>
              <PastillesStats segments={stats?.segments} />
            </div>
          </header>

          <Referentiel referentiel={LG_HOSPITALISATION} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default LgHospitalisation
