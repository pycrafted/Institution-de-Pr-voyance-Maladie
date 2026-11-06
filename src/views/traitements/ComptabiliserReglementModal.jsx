/**
 * Modal « Aperçu écritures au journal » (§17, capture 60).
 *
 * Le second temps du règlement. Régler pose le chèque sur la facture ; ici la
 * comptabilité l'enregistre - deux gestes distincts dans l'application
 * d'origine, qui a son propre bouton « Comptabiliser » (capture 59) et son
 * segment « Comptabilisée » à côté de « Réglée ». Les deux peuvent être
 * séparés de semaines : la facture 106685 a été réglée le 13 juillet et son
 * écriture passée le 21 septembre.
 *
 * On choisit la banque qui a payé, on lit les écritures qu'elle produirait, on
 * vérifie que le solde tombe à zéro, puis on valide. Rien n'est écrit tant que
 * « Valider » n'est pas cliqué : l'aperçu est calculé par le serveur sans rien
 * enregistrer.
 *
 * La banque n'est demandée nulle part dans les captures du règlement (52-54),
 * alors que la facture finit bien avec un journal. Elle suit la société - 01
 * paie par B1 ou B7, 02 par B2 ou B8 - mais chacune en a deux : quelqu'un
 * choisit. On le demande ici, au moment où ce choix sert.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { optionsBanques } from './config'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')
const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
/** « juin-2024 » : le mois comptable, celui de la facture, pas du paiement. */
const moisDe = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MOIS[d.getMonth()]}-${d.getFullYear()}`
}

const ComptabiliserReglementModal = ({ factures, visible, onFermer, onEnregistre }) => {
  const liste = useMemo(() => factures || [], [factures])
  const banques = useMemo(() => optionsBanques(), [])
  const [banque, setBanque] = useState('')
  // L'aperçu porte la banque qui l'a produit : on n'affiche jamais les
  // écritures d'une banque pour une autre, et on évite de vider l'état dans
  // l'effet (ce qui déclencherait un rendu en cascade).
  const [apercu, setApercu] = useState({ banque: '', lignes: [] })
  // La banque dont le calcul a échoué, pour ne pas tourner indéfiniment.
  const [echec, setEchec] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const ids = useMemo(() => liste.map((f) => f.id), [liste])
  const ecritures = useMemo(() => (apercu.banque === banque ? apercu.lignes : []), [apercu, banque])
  // « En calcul » se déduit : une banque est choisie, son aperçu n'est pas
  // encore arrivé, et il n'a pas échoué. Rien à mettre à jour dans l'effet.
  const chargement = Boolean(banque) && apercu.banque !== banque && echec !== banque

  // L'aperçu se recalcule dès que la banque change : c'est elle qui donne le
  // journal (B8) et le compte de trésorerie (521800).
  useEffect(() => {
    if (!visible || !banque || !ids.length) return undefined
    let abandonne = false
    request('/factures/apercu-reglement/', {
      method: 'POST',
      body: JSON.stringify({ ids, banque }),
    })
      .then((r) => {
        if (!abandonne) setApercu({ banque, lignes: r.ecritures || [] })
      })
      .catch((e) => {
        if (abandonne) return
        setEchec(banque)
        toast.error(`Aperçu impossible : ${messageErreur(e)}`)
      })
    return () => {
      abandonne = true
    }
  }, [visible, banque, ids])

  const totaux = useMemo(
    () =>
      ecritures.reduce(
        (acc, e) => ({
          debit: acc.debit + Number(e.debit || 0),
          credit: acc.credit + Number(e.credit || 0),
        }),
        { debit: 0, credit: 0 },
      ),
    [ecritures],
  )

  const valider = async () => {
    setEnvoi(true)
    try {
      const r = await request('/factures/comptabiliser-reglement/', {
        method: 'POST',
        body: JSON.stringify({ ids, banque }),
      })
      const n = (r.comptabilisees || []).length
      toast.success(n > 1 ? `${n} règlements comptabilisés` : 'Règlement comptabilisé')
      onEnregistre()
    } catch (e) {
      toast.error(`Comptabilisation impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!liste.length) return null

  return (
    <CModal
      visible={visible}
      onClose={onFermer}
      size="xl"
      alignment="center"
      className="trt-reglement"
    >
      <CModalHeader>
        <CModalTitle>Aperçu écritures au journal</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="trt-reg-entete">
          <Champ libelle="Banque" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={banque}
              onChange={(e) => setBanque(e.target.value)}
            >
              <option value="">- selectionner -</option>
              {banques.map((b) => (
                <option key={b.valeur} value={b.valeur}>
                  {b.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Facture(s)">
            <input className="ddb-champ" value={liste.length} readOnly disabled />
          </Champ>
        </div>

        {!banque && (
          <p className="trt-reg-vide">
            Choisissez la banque qui a payé : c&apos;est elle qui donne le journal et le compte de
            trésorerie.
          </p>
        )}

        {banque && chargement && (
          <p className="trt-reg-vide">
            <CSpinner size="sm" /> Calcul des écritures…
          </p>
        )}

        {banque && !chargement && ecritures.length > 0 && (
          <>
            <div className="tableau-conteneur trt-reg-tableau">
              <CTable hover className="ddb-tableau tableau-dense">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>C.JL</CTableHeaderCell>
                    <CTableHeaderCell>D. Compta</CTableHeaderCell>
                    <CTableHeaderCell>Mois trait.</CTableHeaderCell>
                    <CTableHeaderCell>N° pièce</CTableHeaderCell>
                    <CTableHeaderCell>N° Chèque</CTableHeaderCell>
                    <CTableHeaderCell>N° F. IPM</CTableHeaderCell>
                    <CTableHeaderCell>Cpte. Gen.</CTableHeaderCell>
                    <CTableHeaderCell>Cpte. Tiers</CTableHeaderCell>
                    <CTableHeaderCell>Libellé</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Débit</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Crédit</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {ecritures.map((e, i) => (
                    <CTableRow key={i}>
                      <CTableDataCell className="trt-reg-mono">{e.codej}</CTableDataCell>
                      <CTableDataCell>{dateFr(e.dateCompta)}</CTableDataCell>
                      <CTableDataCell>{moisDe(e.dateTrait)}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.numpiece}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.numcheque}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.numfactipm}</CTableDataCell>
                      <CTableDataCell className="trt-reg-compte">{e.comptegen}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.comptetiers}</CTableDataCell>
                      <CTableDataCell>{e.libelle}</CTableDataCell>
                      <CTableDataCell className="text-end">
                        {e.debit ? montantFr(e.debit) : ''}
                      </CTableDataCell>
                      <CTableDataCell className="text-end">
                        {e.credit ? montantFr(e.credit) : ''}
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
            <p className="trt-reg-solde">
              Débit: {montantFr(totaux.debit)} - Crédit {montantFr(totaux.credit)} -{' '}
              <em>Solde: {montantFr(totaux.debit - totaux.credit)}</em>
            </p>
          </>
        )}

        <div className="trt-reg-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={valider}
            disabled={envoi || !banque || !ecritures.length || totaux.debit !== totaux.credit}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Valider
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

const Champ = ({ libelle, requis, children }) => (
  <div className="ddb-groupe">
    <label>
      {libelle}
      {requis && <span className="trt-reg-requis"> *</span>}
    </label>
    {children}
  </div>
)

export default ComptabiliserReglementModal
