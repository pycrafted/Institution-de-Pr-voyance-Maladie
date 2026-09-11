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
 * fournisseur — même tableau à en-tête noir, même panneau latéral, mêmes
 * gestes. Réécrire un écran équivalent aurait garanti l'inverse : deux pages
 * qui se ressemblent de loin et diffèrent de près.
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande : arriver directement sur cette page ne
 * monte pas l'autre, donc ne charge pas ses styles.
 */

import React from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../../donnees-de-base/Referentiel'
import '../../donnees-de-base/donnees-de-base.scss'
import { BONS_PHARMACIE } from './config'

const BonsPharmacie = () => (
  <CCard className="ddb-carte">
    <CCardBody className="p-0">
      <section className="ddb-contenu">
        <Referentiel referentiel={BONS_PHARMACIE} />
      </section>
    </CCardBody>
  </CCard>
)

export default BonsPharmacie
