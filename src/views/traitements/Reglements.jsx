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
import Referentiel from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import './traitements.scss'
import './reglements.scss'
import ReglementModal from './ReglementModal'
import ComptabiliserReglementModal from './ComptabiliserReglementModal'
import EditionModal from './EditionModal'
import { REGLEMENTS_SOINS, REGLEMENTS_DIVERS } from './config'

const ONGLETS = [
  { cle: 'soins', libelle: 'Fournisseurs de Soins', referentiel: REGLEMENTS_SOINS },
  { cle: 'divers', libelle: 'Fournisseurs Divers', referentiel: REGLEMENTS_DIVERS },
]

/**
 * Une facture est réglable tant qu'elle est comptabilisée (acompte compris),
 * et qu'elle n'est pas un remboursement : celle-là se règle à l'assuré, page
 * « Remboursement Frais Médicaux », parce que le prestataire a déjà été payé
 * par lui au comptoir.
 */
const estReglable = (f) => f.etat === 'Comptabilisée' && !f.remboursementTicket
/** Un règlement existe dès qu'un montant a été réglé (acompte ou paiement complet). */
const aUnReglement = (f) => f.etat === 'Payée' || Number(f.montantReglement) > 0
/**
 * Réglée mais pas encore passée au journal : c'est le second geste de
 * l'application d'origine, son bouton « Comptabiliser » (capture 59).
 */
const estAcomptabiliser = (f) => Number(f.montantReglement) > 0 && !f.reglementComptabilise

const Reglements = () => {
  const [onglet, setOnglet] = useState('soins')
  // Factures en cours de règlement (ouvre ReglementModal), édition, et clé de
  // rafraîchissement (remonte la liste après une action, relâche la sélection).
  const [facturesAregler, setFacturesAregler] = useState(null)
  const [facturesAcomptabiliser, setFacturesAcomptabiliser] = useState(null)
  const [editionOuverte, setEditionOuverte] = useState(false)
  const [rafraichir, setRafraichir] = useState(0)

  const courant = ONGLETS.find((o) => o.cle === onglet) || ONGLETS[0]

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
          libelle: 'Comptabiliser',
          // Ouvre l'aperçu des écritures : la banque s'y choisit, le journal
          // en découle, et rien n'est écrit avant « Valider ».
          executer: (entrees) => {
            const cibles = entrees.filter(estAcomptabiliser)
            if (!cibles.length) {
              toast.info('Aucun règlement à comptabiliser dans la sélection.')
              return undefined
            }
            setFacturesAcomptabiliser(cibles)
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
        <section className="ddb-contenu rgl-page">
          {/* Même chapeau que les écrans de Comptabilité, titre seul : les
              états imprimés (Factures à Payer / non Payées) se demandent
              depuis le pied du panneau, devant le rail - comme « Exporter » sur
              le Journal Central. */}
          <header className="rgl-chapeau">
            <h2 className="rgl-titre">Règlements Factures</h2>
          </header>

          {/* Les deux familles de fournisseurs, en cartes - même forme que sur
              la page Factures, dont cet écran est la suite. L'état du règlement,
              lui, reste un filtre de la liste : il est en rail de pastilles au
              pied du panneau, en bout de ligne, un niveau plus bas. */}
          <nav className="rgl-cartes" aria-label="Sous-onglets des règlements">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`rgl-carte${onglet === o.cle ? ' rgl-carte-active' : ''}`}
                onClick={() => setOnglet(o.cle)}
                aria-current={onglet === o.cle ? 'page' : undefined}
              >
                <span className="rgl-carte-libelle">{o.libelle}</span>
              </button>
            ))}
          </nav>

          {/* `key` : changer d'onglet ou agir en lot remonte le composant, qui
              relit la base et relâche la sélection. */}
          <Referentiel
            key={`${courant.cle}-${rafraichir}`}
            referentiel={referentiel}
            actionsBarre={
              <button type="button" className="rgl-edition" onClick={() => setEditionOuverte(true)}>
                <CIcon icon={cilPrint} />
                Edition
              </button>
            }
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

      <ComptabiliserReglementModal
        key={`cpt-${(facturesAcomptabiliser || []).map((f) => f.id).join('-')}`}
        factures={facturesAcomptabiliser}
        visible={Boolean(facturesAcomptabiliser)}
        onFermer={() => setFacturesAcomptabiliser(null)}
        onEnregistre={() => {
          setFacturesAcomptabiliser(null)
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
