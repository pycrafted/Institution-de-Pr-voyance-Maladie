/**
 * Modal « Règlement Facture Fournisseur de Soins » (§17, captures 52-54).
 *
 * Règle une ou plusieurs factures comptabilisées en un seul geste. En-tête
 * commun : mode de paiement, N° de l'instrument, date (défaut aujourd'hui) et
 * mois de traitement (lecture seule). Puis une ligne par facture : case
 * « Acompte » décochée = montant plein (lecture seule) ; cochée = montant
 * saisissable (paiement partiel, 0 par défaut). Le « Montant Réglé » suit la
 * somme saisie. « Valider » envoie le tout à /factures/regler/.
 */

import React, { useMemo, useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { LIBELLES_REGLEMENT } from './config'

const entier = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const aujourdhui = () => new Date().toISOString().slice(0, 10)
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
const moisTraitement = () => {
  const d = new Date()
  return `${MOIS[d.getMonth()]}-${d.getFullYear()}`
}

/** Reste à payer d'une facture (montant net - déjà réglé). */
const resteDe = (f) => Math.max(0, entier(f.montantNet) - entier(f.montantReglement))

const ReglementModal = ({ factures, visible, onFermer, onEnregistre }) => {
  const liste = useMemo(() => factures || [], [factures])

  const [typeReglement, setTypeReglement] = useState('')
  const [numeroReglement, setNumeroReglement] = useState('')
  const [dateReglement, setDateReglement] = useState(aujourdhui)
  const [envoi, setEnvoi] = useState(false)
  // Une entrée par facture : { acompte, montant }. Initialisée au reste à payer.
  const [lignes, setLignes] = useState(() =>
    Object.fromEntries(liste.map((f) => [f.id, { acompte: false, montant: String(resteDe(f)) }])),
  )

  const ligneDe = (f) => lignes[f.id] || { acompte: false, montant: String(resteDe(f)) }
  const basculerAcompte = (f) =>
    setLignes((etat) => {
      const l = ligneDe(f)
      // Cocher Acompte ouvre la saisie (0 par défaut) ; décocher remet le plein.
      return {
        ...etat,
        [f.id]: l.acompte
          ? { acompte: false, montant: String(resteDe(f)) }
          : { acompte: true, montant: '0' },
      }
    })
  const changerMontant = (f, valeur) =>
    setLignes((etat) => ({ ...etat, [f.id]: { ...ligneDe(f), montant: valeur } }))

  // Montant dû (somme des restes) et montant réglé (somme des montants saisis,
  // plafonnés au reste de chaque facture).
  const montantDu = liste.reduce((s, f) => s + resteDe(f), 0)
  const montantRegle = liste.reduce(
    (s, f) => s + Math.min(resteDe(f), entier(ligneDe(f).montant)),
    0,
  )

  const libelle = useMemo(() => {
    if (liste.length === 1) {
      const f = liste[0]
      return `RGLMT Facture N° ${f.numero} / ${f.fournisseur || f.codeFournisseur || ''}`.trim()
    }
    return `RGLMT ${liste.length} factures`
  }, [liste])

  const regler = async () => {
    if (!typeReglement) {
      toast.info('Choisissez un type de règlement.')
      return
    }
    const lignesEnvoi = liste
      .map((f) => ({ id: f.id, montant: Math.min(resteDe(f), entier(ligneDe(f).montant)) }))
      .filter((l) => l.montant > 0)
    if (lignesEnvoi.length === 0) {
      toast.info('Saisissez un montant à régler.')
      return
    }
    try {
      setEnvoi(true)
      await request('/factures/regler/', {
        method: 'POST',
        body: JSON.stringify({
          typeReglement,
          numeroReglement,
          dateReglement,
          lignes: lignesEnvoi,
        }),
      })
      const n = lignesEnvoi.length
      toast.success(n > 1 ? `${n} factures réglées` : `Facture réglée`)
      onEnregistre()
    } catch (e) {
      toast.error(`Règlement impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!liste.length) return null

  const titre =
    liste.length > 1
      ? `Règlement de ${liste.length} factures`
      : `Règlement Facture N° ${liste[0].numero}`

  return (
    <CModal
      visible={visible}
      onClose={onFermer}
      size="lg"
      alignment="center"
      className="trt-reglement"
      scrollable
    >
      <CModalHeader>
        <CModalTitle>{titre}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {/* En-tête commun du règlement. */}
        <div className="trt-reg-entete">
          <Champ libelle="Type Règlement" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={typeReglement}
              onChange={(e) => setTypeReglement(e.target.value)}
            >
              <option value="">- Sélectionner -</option>
              {Object.entries(LIBELLES_REGLEMENT).map(([code, libelleMode]) => (
                <option key={code} value={code}>
                  {libelleMode}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="N°" requis>
            <input
              className="ddb-champ"
              value={numeroReglement}
              onChange={(e) => setNumeroReglement(e.target.value)}
              placeholder="N° chèque / virement"
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="Date Règlement" requis>
            <input
              type="date"
              className="ddb-champ"
              value={dateReglement}
              onChange={(e) => setDateReglement(e.target.value)}
            />
          </Champ>
          <Champ libelle="Date traitement">
            <input className="ddb-champ" value={moisTraitement()} readOnly disabled />
          </Champ>
        </div>

        {/* Une ligne par facture : Acompte + montant. */}
        <div className="trt-reg-factures">
          {liste.map((f) => {
            const l = ligneDe(f)
            return (
              <div key={f.id} className="trt-reg-facture">
                <div className="trt-reg-facture-tete">
                  <span className="trt-reg-facture-titre">
                    Facture N° {f.numero}
                    {f.numeroFournisseur ? `/${f.numeroFournisseur}` : ''}
                  </span>
                  <label className="trt-reg-acompte-case">
                    <input
                      type="checkbox"
                      checked={l.acompte}
                      onChange={() => basculerAcompte(f)}
                    />
                    Acompte
                  </label>
                </div>
                <input
                  className="ddb-champ text-end"
                  value={l.acompte ? l.montant : String(resteDe(f))}
                  onChange={(e) => changerMontant(f, e.target.value)}
                  readOnly={!l.acompte}
                  disabled={!l.acompte}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            )
          })}
        </div>

        {/* Récapitulatif des montants. */}
        <div className="trt-reg-recap">
          <span>
            Montant(s) {liste.length} facture(s) : <strong>{montantFr(montantDu)}</strong>
          </span>
          <span className="trt-reg-regle">
            Montant Réglé : <strong>{montantFr(montantRegle)}</strong>
          </span>
        </div>

        <div className="trt-reg-libelle-bloc">
          <label>Libellé</label>
          <input className="ddb-champ" value={libelle} readOnly />
        </div>

        <div className="trt-reg-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={regler}
            disabled={envoi}
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

export default ReglementModal
