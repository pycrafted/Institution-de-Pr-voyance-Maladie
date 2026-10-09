/**
 * Page « Traitements → Règlements » (§17, captures 51-59).
 *
 * Le PAIEMENT des factures, l'étape après la comptabilisation. Deux sous-onglets,
 * comme les factures : Fournisseurs de Soins / Fournisseurs Divers.
 *
 * La liste (factures comptabilisées, filtrées par état de règlement) se coche
 * pour agir en lot, comme l'application d'origine :
 *   - Régler Facture(s)   ouvre le règlement des factures cochées (ReglementModal).
 *   - A Payer / Annuler A Payer   pose / retire le drapeau « à payer ».
 *   - Annuler Règlement   ramène une facture réglée à « Comptabilisée ».
 * Un clic sur une ligne comptabilisée ouvre son règlement directement.
 * Le bouton « Edition » génère les états imprimés (Factures à Payer / non Payées).
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPrint } from '@coreui/icons'

import { request } from '../../services/api'
import { toast } from '../../services/toast'
import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import './traitements.scss'
import ReglementModal from './ReglementModal'
import EditionModal from './EditionModal'
import { REGLEMENTS_SOINS, REGLEMENTS_DIVERS } from './config'

const ONGLETS = [
  { cle: 'soins', libelle: 'Fournisseurs de Soins', referentiel: REGLEMENTS_SOINS },
  { cle: 'divers', libelle: 'Fournisseurs Divers', referentiel: REGLEMENTS_DIVERS },
]

/** Une facture est réglable tant qu'elle est comptabilisée (acompte compris). */
const estReglable = (f) => f.etat === 'Comptabilisée'
/** Un règlement existe dès qu'un montant a été réglé (acompte ou paiement complet). */
const aUnReglement = (f) => f.etat === 'Payée' || Number(f.montantReglement) > 0

const Reglements = () => {
  const [onglet, setOnglet] = useState('soins')
  const [stats, setStats] = useState(null)
  // Factures en cours de règlement (ouvre ReglementModal), édition, et clé de
  // rafraîchissement (remonte la liste après une action, relâche la sélection).
  const [facturesAregler, setFacturesAregler] = useState(null)
  const [editionOuverte, setEditionOuverte] = useState(false)
  const [rafraichir, setRafraichir] = useState(0)

  const courant = ONGLETS.find((o) => o.cle === onglet) || ONGLETS[0]
  const changerOnglet = (cle) => {
    setStats(null)
    setOnglet(cle)
  }

  const rafraichirListe = () => setRafraichir((n) => n + 1)

  // Appelle un point d'API de lot avec les ids cochés, puis renvoie le message
  // (Referentiel relâche alors la sélection et recharge).
  const actionLot = async (chemin, ids, resume) => {
    await request(chemin, { method: 'POST', body: JSON.stringify({ ids }) })
    return resume
  }

  const referentiel = useMemo(
    () => ({
      ...courant.referentiel,
      // Clic sur une ligne comptabilisée : ouvre son règlement directement.
      onLigne: (facture) => {
        if (estReglable(facture)) setFacturesAregler([facture])
      },
      actionsLot: [
        {
          libelle: 'Régler Facture(s)',
          primaire: true,
          // Ouvre le modal sur les factures comptabilisées cochées (pas de message
          // => Referentiel garde la sélection ; le modal la relâchera au succès).
          executer: (entrees) => {
            const cibles = entrees.filter(estReglable)
            if (!cibles.length) {
              toast.info('Aucune facture comptabilisée à régler.')
              return undefined
            }
            setFacturesAregler(cibles)
            return undefined
          },
        },
        {
          libelle: 'A Payer',
          executer: (entrees) => {
            const ids = entrees.filter(estReglable).map((f) => f.id)
            if (!ids.length) {
              toast.info('Aucune facture comptabilisée à marquer.')
              return undefined
            }
            return actionLot(
              '/factures/a-payer/',
              ids,
              `${ids.length} facture(s) marquée(s) à payer`,
            )
          },
        },
        {
          libelle: 'Annuler A Payer',
          executer: (entrees) =>
            actionLot(
              '/factures/annuler-a-payer/',
              entrees.map((f) => f.id),
              `Drapeau « à payer » retiré`,
            ),
        },
        {
          libelle: 'Annuler Règlement',
          danger: true,
          confirmer: (n) =>
            `Annuler le règlement de ${n} facture(s) ? Elles redeviendront « Comptabilisée ».`,
          executer: (entrees) => {
            const ids = entrees.filter(aUnReglement).map((f) => f.id)
            if (!ids.length) {
              toast.info('Aucune facture réglée à annuler.')
              return undefined
            }
            return actionLot(
              '/factures/annuler-reglement/',
              ids,
              `${ids.length} règlement(s) annulé(s)`,
            )
          },
        },
      ],
    }),
    [courant.referentiel],
  )

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Règlements Factures</h1>
              <PastillesStats segments={stats?.segments} />
            </div>
            <button
              type="button"
              className="ddb-outil trt-bouton-edition"
              onClick={() => setEditionOuverte(true)}
            >
              <CIcon icon={cilPrint} className="ddb-outil-icone" />
              Edition
            </button>
          </div>
          <nav className="prt-onglets" aria-label="Sous-onglets des règlements">
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
          {/* `key` : changer d'onglet ou agir en lot remonte le composant, qui
              relit la base et relâche la sélection. */}
          <Referentiel
            key={`${courant.cle}-${rafraichir}`}
            referentiel={referentiel}
            onStats={setStats}
          />
        </section>
      </CCardBody>

      <ReglementModal
        key={(facturesAregler || []).map((f) => f.id).join('-')}
        factures={facturesAregler}
        visible={Boolean(facturesAregler)}
        onFermer={() => setFacturesAregler(null)}
        onEnregistre={() => {
          setFacturesAregler(null)
          rafraichirListe()
        }}
      />

      <EditionModal
        visible={editionOuverte}
        onFermer={() => setEditionOuverte(false)}
        type={courant.cle}
      />
    </CCard>
  )
}

export default Reglements
