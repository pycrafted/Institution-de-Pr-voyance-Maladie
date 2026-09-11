/**
 * Page « Adhérents ».
 *
 * Un adhérent est la collectivité qui cotise — une catégorie de personnel de
 * la SAR, ou une mutuelle — et non une personne : les personnes couvertes sont
 * les participants, qui ont leur propre section.
 *
 * La page ne réécrit rien : elle monte le composant <Referentiel /> de
 * « Données de base », qui sait déjà lister, chercher, paginer, créer,
 * modifier et désactiver à partir d'un simple descripteur. C'est ce qui fait
 * qu'un adhérent se consulte et se saisit exactement comme un fournisseur ou
 * une spécialité — même tableau à en-tête noir, même panneau latéral, mêmes
 * gestes. Réécrire un écran équivalent aurait garanti l'inverse : deux pages
 * qui se ressemblent de loin et diffèrent de près.
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * deux vues sont chargées à la demande : arriver directement sur /adherents ne
 * monte pas l'autre page, donc ne charge pas ses styles.
 */

import React from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import { ADHERENTS } from './config'

const Adherents = () => (
  <CCard className="ddb-carte">
    <CCardBody className="p-0">
      <section className="ddb-contenu">
        <Referentiel referentiel={ADHERENTS} />
      </section>
    </CCardBody>
  </CCard>
)

export default Adherents
