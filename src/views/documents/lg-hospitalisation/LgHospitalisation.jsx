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

import React from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import './lg-hospitalisation.scss'
import { LG_HOSPITALISATION } from './config'

const LgHospitalisation = () => (
  <CCard className="ddb-carte">
    <CCardBody className="p-0">
      <section className="ddb-contenu">
        <Referentiel referentiel={LG_HOSPITALISATION} />
      </section>
    </CCardBody>
  </CCard>
)

export default LgHospitalisation
