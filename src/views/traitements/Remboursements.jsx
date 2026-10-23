/**
 * Page « Traitements → Remboursement » — Remboursement Frais Médicaux
 * (captures 66-68).
 *
 * Rembourse les participants qui ont avancé des frais (facture reçue sur le
 * fournisseur divers, case « Remboursement Ticket » + bon manuel). La liste
 * (bons de remboursement) se coche pour régler en lot ; « Régler » ouvre la
 * « Méthode de Règlement » (Chèque / Virement / Transfert + banque Bx), qui
 * pose les écritures RIB/RIC (Dr 602 / Cr 411 participant) et, par banque, Bx
 * (Dr 411 / Cr 521), puis marque les bons remboursés.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody, CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import './traitements.scss'
import { REMBOURSEMENTS, METHODES_REMBOURSEMENT, optionsBanques } from './config'

const entier = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const aujourdhui = () => new Date().toISOString().slice(0, 10)
/** Premier jour du mois courant, en ISO (la « Date traitement » de LAMPS). */
const premierDuMois = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Non encore remboursé : réglable. */
const estReglable = (l) => !l.rembourse

const Remboursements = () => {
  const [stats, setStats] = useState(null)
  const [aRegler, setARegler] = useState(null) // lignes sélectionnées à régler
  const [rafraichir, setRafraichir] = useState(0)
  const rafraichirListe = () => setRafraichir((n) => n + 1)

  const referentiel = useMemo(
    () => ({
      ...REMBOURSEMENTS,
      // Clic sur une ligne non réglée : ouvre son règlement directement.
      onLigne: (ligne) => {
        if (estReglable(ligne)) setARegler([ligne])
      },
      actionsLot: [
        {
          libelle: 'Régler',
          primaire: true,
          executer: (entrees) => {
            const cibles = entrees.filter(estReglable)
            if (!cibles.length) {
              toast.info('Aucun remboursement à régler dans la sélection.')
              return undefined
            }
            setARegler(cibles)
            return undefined
          },
        },
      ],
    }),
    [],
  )

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Remboursement Frais Médicaux</h1>
              <PastillesStats segments={stats?.segments} />
            </div>
          </div>
        </div>

        <section className="ddb-contenu">
          <Referentiel key={`remboursements-${rafraichir}`} referentiel={referentiel} onStats={setStats} />
        </section>
      </CCardBody>

      <MethodeReglementModal
        key={(aRegler || []).map((l) => l.id).join('-')}
        lignes={aRegler}
        visible={Boolean(aRegler)}
        onFermer={() => setARegler(null)}
        onEnregistre={() => {
          setARegler(null)
          rafraichirListe()
        }}
      />
    </CCard>
  )
}

/** Modal « Méthode de Règlement » (captures 56-57). */
const MethodeReglementModal = ({ lignes, visible, onFermer, onEnregistre }) => {
  const liste = useMemo(() => lignes || [], [lignes])
  const [methode, setMethode] = useState('C')
  const [numero, setNumero] = useState('')
  const [banque, setBanque] = useState('')
  const [dateCheque, setDateCheque] = useState(aujourdhui)
  const [envoi, setEnvoi] = useState(false)

  const banques = useMemo(() => optionsBanques(), [])
  const montant = liste.reduce((s, l) => s + entier(l.montantDu), 0)

  const regler = async () => {
    if (!methode) return toast.info('Choisissez une méthode de paiement.')
    // Comme LAMPS : la banque est toujours exigée dans ce modal.
    if (!banque) return toast.info('Choisissez une banque.')
    try {
      setEnvoi(true)
      await request('/remboursements/regler/', {
        method: 'POST',
        body: JSON.stringify({
          ids: liste.map((l) => l.id),
          methode,
          numero: numero.trim(),
          banque,
          date: dateCheque,
        }),
      })
      toast.success(liste.length > 1 ? `${liste.length} remboursements réglés` : 'Remboursement réglé')
      onEnregistre()
    } catch (e) {
      toast.error(`Règlement impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!liste.length) return null

  return (
    <CModal visible={visible} onClose={onFermer} size="lg" alignment="center" className="trt-reglement">
      <CModalHeader>
        <CModalTitle>Méthode de Règlement</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="trt-reg-entete">
          <Champ libelle="Méthode de paiement" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={methode}
              onChange={(e) => setMethode(e.target.value)}
            >
              {Object.entries(METHODES_REMBOURSEMENT).map(([code, lib]) => (
                <option key={code} value={code}>
                  {lib}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle={`N° ${METHODES_REMBOURSEMENT[methode] || ''}`.trim()}>
            <input
              className="ddb-champ"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              autoComplete="off"
            />
          </Champ>
          <Champ libelle={`Montant${montant ? ` (${montantFr(montant)})` : ''}`}>
            <input className="ddb-champ text-end" value={montantFr(montant)} readOnly disabled />
          </Champ>
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
          <Champ libelle="Date Chèque" requis>
            <input
              type="date"
              className="ddb-champ"
              value={dateCheque}
              onChange={(e) => setDateCheque(e.target.value)}
            />
          </Champ>
          <Champ libelle="Date traitement">
            <input type="date" className="ddb-champ" value={premierDuMois()} readOnly disabled />
          </Champ>
        </div>

        <div className="trt-reg-recap">
          <span>{liste.length} remboursement(s) sélectionné(s)</span>
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

export default Remboursements
