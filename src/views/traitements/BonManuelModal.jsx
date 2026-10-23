/**
 * Modal « Création bon manuel » (capture 69) - crée un bon directement au
 * traitement d'une facture, sans document préexistant à rattacher (surtout pour
 * les factures « divers » / remboursements).
 *
 * Volontairement SIMPLE, comme LAMPS : pas de saisie acte-par-acte. On choisit
 * un TYPE de document (les 4 types de bon + bon d'avoir + ticket remboursement),
 * un n°, une date, un MONTANT, le participant et le bénéficiaire, et l'option
 * « Remboursement intégral ». La liquidation se fait sur le seul montant :
 * QP.IPM = taux × montant (ou = montant si intégral), QP.PART = reste.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react'

import { request } from '../../services/api'
import { listerEntreesSync } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const entier = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
const aujourdHui = () => new Date().toISOString().slice(0, 10)
/** 87 % pour les retraités (sociétés 03/04), 85 % sinon - cf. backend. */
const tauxDe = (codeSoc) => (['03', '04'].includes(codeSoc) ? 87 : 85)

/** Type de document du bon manuel : 4 bons + bon d'avoir + ticket remboursement. */
const TYPES_DOC = [
  { code: 'bon-pharmacie', libelle: 'Bon de pharmacie' },
  { code: 'bon-optique', libelle: 'Bon optique' },
  { code: 'lettre-garantie', libelle: 'Lettre de garantie' },
  { code: 'lg-hospitalisation', libelle: 'LG hospitalisation' },
  { code: 'bon-avoir', libelle: "Bon d'avoir" },
  { code: 'ticket-remboursement', libelle: 'Ticket remboursement' },
]
const libelleType = (code) => TYPES_DOC.find((t) => t.code === code)?.libelle || 'document'

const BonManuelModal = ({ factureId, facture, visible, onFermer, onEnregistre }) => {
  const codeSoc = facture?.codeSoc || ''
  const taux = tauxDe(codeSoc)

  const societe = useMemo(() => {
    const a = listerEntreesSync('adherents').find((x) => x.code === codeSoc)
    return a ? a.libelle || a.raisonSociale || a.nom || '' : ''
  }, [codeSoc])

  const typesBenef = useMemo(
    () => listerEntreesSync('types-beneficiaires').filter((t) => t.actif !== false),
    [],
  )
  const codeTypeBenef = (libelle) => typesBenef.find((t) => t.libelle === libelle)?.code || ''

  // Participants de la société de la facture (le bon manuel reste dans sa société).
  const participants = useMemo(
    () =>
      listerEntreesSync('participants')
        .filter((p) => p.adherent === codeSoc)
        .sort((a, b) => String(a.matricule).localeCompare(String(b.matricule))),
    [codeSoc],
  )

  // --- Entête du bon ---
  const [typeDoc, setTypeDoc] = useState('')
  const [numero, setNumero] = useState('')
  const [dateBon, setDateBon] = useState(aujourdHui())
  const [montant, setMontant] = useState('')
  const [integral, setIntegral] = useState(false)

  // --- Participant & bénéficiaire ---
  const [matricule, setMatricule] = useState('')
  const [beneficiaireMat, setBeneficiaireMat] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const participantChoisi = participants.find((p) => p.matricule === matricule)
  const nomParticipant = participantChoisi
    ? `${participantChoisi.prenoms || ''} ${participantChoisi.nom || ''}`.trim()
    : ''

  // Bénéficiaires possibles : le participant lui-même, puis ses ayants droit.
  const beneficiaires = useMemo(() => {
    if (!participantChoisi) return []
    const liste = [
      {
        matricule: participantChoisi.matricule,
        libelle: nomParticipant,
        typeBenef: '1',
      },
    ]
    listerEntreesSync('beneficiaires')
      .filter((b) => b.matriculePart === matricule && b.actif !== false)
      .forEach((b) =>
        liste.push({
          matricule: b.matriculeBenef,
          libelle: `${b.prenoms || ''} ${b.nom || ''}`.trim(),
          typeBenef: codeTypeBenef(b.typeBenef),
        }),
      )
    return liste
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matricule, participantChoisi])

  const benefChoisi = beneficiaires.find((b) => b.matricule === beneficiaireMat)

  // Participant choisi : par défaut, le bénéficiaire est lui-même.
  const changerParticipant = (mat) => {
    setMatricule(mat)
    const p = participants.find((x) => x.matricule === mat)
    setBeneficiaireMat(p ? p.matricule : '')
  }

  // Aperçu de la liquidation, sur le seul montant.
  const montantNb = entier(montant)
  const qpipm = montantNb <= 0 ? 0 : integral ? montantNb : Math.round((taux * montantNb) / 100)
  const qppart = Math.max(0, montantNb - qpipm)

  // À la réouverture, on repart d'un formulaire vierge.
  useEffect(() => {
    if (!visible) return
    setTypeDoc('')
    setNumero('')
    setDateBon(aujourdHui())
    setMontant('')
    setIntegral(false)
    setMatricule('')
    setBeneficiaireMat('')
  }, [visible])

  const enregistrer = async () => {
    if (!typeDoc) return toast.info('Choisissez un type de document.')
    if (montantNb <= 0) return toast.info('Saisissez un montant.')
    if (!matricule) return toast.info('Choisissez un participant.')
    if (!benefChoisi) return toast.info('Choisissez un bénéficiaire.')
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/creer-bon-manuel/`, {
        method: 'POST',
        body: JSON.stringify({
          typeManuel: typeDoc,
          numero: numero.trim(),
          date: dateBon,
          montant: montantNb,
          matriculePart: `${codeSoc}-${matricule}`,
          participant: nomParticipant,
          typeBenef: benefChoisi.typeBenef,
          beneficiaire: benefChoisi.libelle,
          remboursementIntegral: integral,
        }),
      })
      toast.success('Bon manuel créé')
      onEnregistre()
    } catch (e) {
      toast.error(`Création impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onFermer} size="lg" alignment="center" className="trt-liq">
      <CModalHeader>
        <CModalTitle>Création bon manuel</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {/* Entête du bon : type, n°, date, montant */}
        <div className="trt-liq-saisie">
          <div className="trt-liq-entete-titre">Document</div>
          <div className="trt-liq-grille">
            <Champ libelle="Type de document">
              <select
                className="ddb-champ ddb-champ-liste"
                value={typeDoc}
                onChange={(e) => setTypeDoc(e.target.value)}
              >
                <option value="">- Type de document -</option>
                {TYPES_DOC.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle={`N° ${libelleType(typeDoc)}`}>
              <input
                className="ddb-champ"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="N° du document"
                autoComplete="off"
              />
            </Champ>
            <Champ libelle="Date">
              <input
                type="date"
                className="ddb-champ"
                value={dateBon}
                onChange={(e) => setDateBon(e.target.value)}
              />
            </Champ>
            <Champ libelle={`Montant${montantNb ? ` (${montantFr(montantNb)})` : ''}`}>
              <input
                className="ddb-champ text-end"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                autoComplete="off"
              />
            </Champ>
          </div>
        </div>

        {/* Participant & bénéficiaire */}
        <div className="trt-liq-saisie">
          <div className="trt-liq-entete-titre">
            Participant &amp; bénéficiaire
            {societe && <span className="trt-liq-societe"> · Société : {societe}</span>}
          </div>
          <div className="trt-liq-grille">
            <Champ libelle="Participant">
              <select
                className="ddb-champ ddb-champ-liste"
                value={matricule}
                onChange={(e) => changerParticipant(e.target.value)}
              >
                <option value="">- Participant -</option>
                {participants.map((p) => (
                  <option key={p.matricule} value={p.matricule}>
                    {p.matricule} - {`${p.prenoms || ''} ${p.nom || ''}`.trim()}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Bénéficiaire">
              <select
                className="ddb-champ ddb-champ-liste"
                value={beneficiaireMat}
                onChange={(e) => setBeneficiaireMat(e.target.value)}
                disabled={!matricule}
              >
                <option value="">- Bénéficiaire -</option>
                {beneficiaires.map((b) => (
                  <option key={b.matricule} value={b.matricule}>
                    {b.matricule} - {b.libelle}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
        </div>

        <div className="trt-liq-pied">
          <label className="trt-bm-integral">
            <input
              type="checkbox"
              checked={integral}
              onChange={(e) => setIntegral(e.target.checked)}
            />
            Remboursement intégral
          </label>
          <div className="trt-liq-totaux">
            Montant : <strong>{montantFr(montantNb)}</strong> - Quote part IPM :{' '}
            <strong>{montantFr(qpipm)}</strong> / Quote part AGENT : <strong>{montantFr(qppart)}</strong>
          </div>
          <div className="trt-liq-actions">
            <button type="button" className="ddb-outil" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="ddb-bouton-enregistrer ms-2"
              onClick={enregistrer}
              disabled={envoi}
            >
              {envoi && <CSpinner size="sm" className="me-2" />}
              Enregistrer
            </button>
          </div>
        </div>
      </CModalBody>
    </CModal>
  )
}

const Champ = ({ libelle, children }) => (
  <div className="ddb-groupe">
    <label>{libelle}</label>
    {children}
  </div>
)

export default BonManuelModal
