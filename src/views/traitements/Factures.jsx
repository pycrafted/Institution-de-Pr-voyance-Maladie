/**
 * Page « Traitements → Factures ».
 *
 * Les factures des prestataires, réceptionnées puis traitées. Deux sous-onglets,
 * comme l'application d'origine (capture 36) :
 *   - Fournisseurs de Soins   factures des fournisseurs de soins (par spécialité)
 *   - Fournisseurs Divers     factures des fournisseurs divers (administratifs)
 *
 * Chaque sous-onglet monte le composant <Referentiel /> de « Données de base »,
 * qui sait déjà lister, filtrer, paginer et servir la réception à partir du
 * descripteur (config.js). L'action « Traiter la facture » d'une ligne ouvre la
 * page de traitement (<FactureDetails />) - même composant, route avec id.
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CCard, CCardBody } from '@coreui/react'
import { cilCalculator, cilList } from '@coreui/icons'

import { request } from '../../services/api'
import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import FactureDetails from './FactureDetails'
import { FACTURES_SOINS, FACTURES_DIVERS } from './config'

const ONGLETS = [
  { cle: 'soins', libelle: 'Fournisseurs de Soins', referentiel: FACTURES_SOINS },
  { cle: 'divers', libelle: 'Fournisseurs Divers', referentiel: FACTURES_DIVERS },
]

const Factures = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [onglet, setOnglet] = useState('soins')
  // Stats de l'onglet actif, posées en pastille à côté du titre (comme Données
  // de base) ; <Referentiel> les remonte.
  const [stats, setStats] = useState(null)
  const courant = ONGLETS.find((o) => o.cle === onglet) || ONGLETS[0]
  const changerOnglet = (cle) => {
    setStats(null)
    setOnglet(cle)
  }

  // Action « Traiter la facture » : ouvre la page de traitement. Ajoutée ici
  // (et non dans config.js) car elle a besoin de la navigation.
  const referentiel = useMemo(
    () => ({
      ...courant.referentiel,
      actionsLigne: [
        {
          cle: 'traiter',
          libelle: 'Traiter la facture',
          icone: cilList,
          executer: (facture) => navigate(`/traitements/factures/${facture.id}`),
        },
        {
          cle: 'comptabiliser',
          libelle: 'Comptabiliser',
          icone: cilCalculator,
          // Seule une facture validée (« Traitée ») se comptabilise.
          visible: (facture) => facture.etat === 'Traitée',
          confirmer: (facture) =>
            `Comptabiliser la facture n° ${facture.numero} ? Les écritures du journal IF seront générées.`,
          executer: async (facture) => {
            await request(`/factures/${facture.id}/comptabiliser/`, { method: 'POST' })
            return `Facture n° ${facture.numero} comptabilisée`
          },
        },
      ],
    }),
    [courant.referentiel, navigate],
  )

  // Route avec id : la page de traitement d'une facture.
  if (id) return <FactureDetails id={id} />

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Traitements Factures</h1>
              <PastillesStats segments={stats?.segments} />
            </div>
          </div>
          <nav className="prt-onglets" aria-label="Sous-onglets des factures">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-onglet${onglet === o.cle ? ' prt-onglet-actif' : ''}`}
                onClick={() => changerOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </nav>
        </div>

        <section className="ddb-contenu">
          {/* `key` : changer d'onglet remonte le composant, qui relit la base. */}
          <Referentiel key={courant.cle} referentiel={referentiel} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default Factures
