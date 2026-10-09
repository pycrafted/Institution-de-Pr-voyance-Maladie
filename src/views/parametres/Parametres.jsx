/**
 * Page « Paramètres ».
 *
 * Trois onglets, comme l'écran d'origine : les taux de prise en charge, la
 * gestion des utilisateurs et les informations générales de l'IPM. La page ne
 * fait que porter le titre et les onglets ; chacun tient son propre écran.
 *
 * Même habillage que les pages de liste (donnees-de-base.scss) : carte pleine
 * largeur, titre en tête, barre d'outils, tableau et fiches de saisie.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import '../donnees-de-base/donnees-de-base.scss'
import InformationsIpm from './InformationsIpm'
import TauxPriseEnCharge from './TauxPriseEnCharge'
import Utilisateurs from './Utilisateurs'
import './parametres.scss'

const ONGLETS = [
  { cle: 'taux', libelle: 'Taux de Prise en Charge', Vue: TauxPriseEnCharge },
  { cle: 'utilisateurs', libelle: 'Gestion des utilisateurs', Vue: Utilisateurs },
  { cle: 'informations', libelle: 'Informations Générales IPM', Vue: InformationsIpm },
]

const Parametres = () => {
  const [onglet, setOnglet] = useState(ONGLETS[0].cle)
  const { Vue } = ONGLETS.find((o) => o.cle === onglet) || ONGLETS[0]

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="ddb-contenu">
          <div className="ddb-referentiel-entete">
            <h2 className="ddb-referentiel-titre">Paramètres</h2>
          </div>

          <div className="prm-onglets" role="tablist">
            {ONGLETS.map((o) => (
              <button
                type="button"
                role="tab"
                key={o.cle}
                aria-selected={o.cle === onglet}
                className={`prm-onglet${o.cle === onglet ? ' prm-onglet-actif' : ''}`}
                onClick={() => setOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </div>

          <Vue />
        </div>
      </CCardBody>
    </CCard>
  )
}

export default Parametres
