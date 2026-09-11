/**
 * Page « Participants ».
 *
 * Les salariés couverts par l'IPM — à distinguer des adhérents, qui sont les
 * collectivités cotisantes. La page se compose de quatre onglets, comme
 * l'application d'origine :
 *   - Participants IPM         liste des participants en activité
 *   - Participants Retraités   même liste, filtrée sur les retraités
 *   - Nouveau Participant IPM  formulaire de création, en pleine page
 *   - Familles                 les bénéficiaires rattachés aux participants
 *
 * Les listes réutilisent le composant <Referentiel /> ; le formulaire réutilise
 * son corps (<CorpsFormulaire />) affiché en pleine page. La feuille de styles
 * de « Données de base » est importée ici car les vues sont chargées à la demande.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel from '../donnees-de-base/Referentiel'
import { CorpsFormulaire } from '../donnees-de-base/FormulaireEntree'
import '../donnees-de-base/donnees-de-base.scss'
import './participants.scss'
import { creerEntree, listerEntreesSync } from '../../services/referentiels'
import { toast } from '../../services/toast'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { PARTICIPANTS, PARTICIPANTS_IPM, PARTICIPANTS_RETRAITES, FAMILLES } from './config'

const ONGLETS = [
  { cle: 'ipm', libelle: 'Participants IPM' },
  { cle: 'retraites', libelle: 'Participants Retraités' },
  { cle: 'nouveau', libelle: 'Nouveau Participant IPM' },
  { cle: 'familles', libelle: 'Familles' },
]

const Participants = () => {
  const [onglet, setOnglet] = useState('ipm')

  const creerParticipant = async (valeurs) => {
    try {
      await creerEntree('participants', valeurs)
      toast.success(`${`${valeurs.prenoms || ''} ${valeurs.nom || ''}`.trim()} ajouté`)
      setOnglet('ipm')
    } catch (e) {
      // Erreurs de saisie renvoyées par le serveur : le formulaire les pose
      // sous les champs concernés, comme les siennes.
      if (erreursDeChamps(e)) throw e
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
    }
  }

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <h1 className="prt-titre">Participants</h1>
          <nav className="prt-onglets" aria-label="Sections des participants">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-onglet${onglet === o.cle ? ' prt-onglet-actif' : ''}`}
                onClick={() => setOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </nav>
        </div>

        <section className="ddb-contenu">
          {onglet === 'ipm' && <Referentiel referentiel={PARTICIPANTS_IPM} />}
          {onglet === 'retraites' && <Referentiel referentiel={PARTICIPANTS_RETRAITES} />}
          {onglet === 'familles' && <Referentiel referentiel={FAMILLES} />}
          {onglet === 'nouveau' && (
            <div className="prt-formulaire-plein">
              <h2 className="prt-formulaire-titre">Ajouter un nouveau participant</h2>
              <CorpsFormulaire
                referentiel={PARTICIPANTS}
                entree={null}
                entrees={listerEntreesSync('participants')}
                onEnregistrer={creerParticipant}
              />
            </div>
          )}
        </section>
      </CCardBody>
    </CCard>
  )
}

export default Participants
