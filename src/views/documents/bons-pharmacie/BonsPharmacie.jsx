/**
 * Page « Bons de Pharmacie ».
 *
 * Un bon de pharmacie autorise un bénéficiaire à retirer des médicaments chez
 * un pharmacien conventionné, à la charge de l'IPM.
 *
 * La page ne réécrit rien : elle monte le composant <Referentiel /> de
 * « Données de base », qui sait déjà lister, chercher, filtrer, paginer,
 * créer, modifier et exporter à partir d'un simple descripteur. C'est ce qui
 * fait qu'un bon se consulte et se saisit exactement comme un adhérent ou un
 * fournisseur - même tableau à en-tête noir, même panneau latéral, mêmes
 * gestes. Réécrire un écran équivalent aurait garanti l'inverse : deux pages
 * qui se ressemblent de loin et diffèrent de près.
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande : arriver directement sur cette page ne
 * monte pas l'autre, donc ne charge pas ses styles.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel, { PastillesStats } from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import './bons-pharmacie.scss'
import { BONS_PHARMACIE } from './config'

const BonsPharmacie = () => {
  // Total de la vue, remonté par <Referentiel /> (`onStats`) : la page le pose
  // contre son titre, comme Participants et Fournisseurs de soins. Il compte
  // la vue côté serveur - segment retenu et recherche compris.
  const [stats, setStats] = useState(null)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu bph-page">
          {/* Même chapeau que les écrans de Comptabilité et de Traitements. Le
              titre était rendu par <Referentiel /> lui-même, en petit, au-dessus
              de la liste ; il devient celui de la page. */}
          <header className="bph-chapeau">
            <div className="bph-titre-groupe">
              <h2 className="bph-titre">Bons de Pharmacie</h2>
              <PastillesStats segments={stats?.segments} />
            </div>
          </header>

          <Referentiel referentiel={BONS_PHARMACIE} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default BonsPharmacie
