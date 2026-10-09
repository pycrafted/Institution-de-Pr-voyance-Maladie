/**
 * Modal « Traitement bon N° … » - liquidation d'un bon acte par acte (capture 39).
 *
 * Pour chaque acte (une prestation : 00 VISITE, 01 ANALYSES…), on saisit le
 * frais réel ; la part IPM (QP.IPM) se **pré-remplit** à 85 % (87 % pour les
 * retraités) de la base (freel − frais exclus), le ticket (QP.PART) au reste.
 * Tout reste ajustable, comme l'application d'origine. « Valider » ajoute la
 * ligne ; « Enregistrer » liquide le bon (alimente lignesprest) et le rattache
 * à la facture.
 */

import React, { useMemo, useState } from 'react'
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
import CIcon from '@coreui/icons-react'
import { cilPlus, cilX } from '@coreui/icons'

import { request } from '../../services/api'
import { listerEntreesSync } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { dateFr } from '../documents/commun'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const entier = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
/** 87 % pour les retraités (sociétés 03/04), 85 % sinon - cf. backend. */
const tauxDe = (codeSoc) => (['03', '04'].includes(codeSoc) ? 87 : 85)

const LIGNE_VIDE = {
  prestation: '',
  freel: '',
  qpipm: '',
  qppart: '',
  qpassur: '',
  fexclus: '',
  ajustement: '',
  quantite: '1',
}

const LiquidationBonModal = ({ factureId, bon, visible, onFermer, onEnregistre }) => {
  const taux = tauxDe(bon?.codeSoc)
  const prestations = useMemo(
    () => listerEntreesSync('types-prestations').filter((p) => p.actif !== false),
    [],
  )
  const libellePrestation = (code) => prestations.find((p) => p.code === code)?.libelle || code

  const montantBon = entier(bon?.montant)

  const [actes, setActes] = useState(() =>
    Array.isArray(bon?.actes) ? bon.actes.map((a) => ({ ...a })) : [],
  )
  // Saisie pré-remplie du montant du bon réparti 85/15, comme l'écran d'origine
  // (le liquidateur ajuste puis « Valide » la ligne).
  const [saisie, setSaisie] = useState(() => {
    if (!montantBon) return LIGNE_VIDE
    const qpipm = Math.round((taux * montantBon) / 100)
    return {
      ...LIGNE_VIDE,
      freel: String(montantBon),
      qpipm: String(qpipm),
      qppart: String(montantBon - qpipm),
    }
  })
  const [envoi, setEnvoi] = useState(false)

  // Recalcule QP.IPM (proposition) et QP.PART quand le frais réel, les exclus,
  // l'assurance ou la part IPM changent - comme l'écran d'origine.
  const avecCalcul = (suivant, champModifie) => {
    const freel = entier(suivant.freel)
    const fexclus = Math.min(entier(suivant.fexclus), freel)
    const qpassur = entier(suivant.qpassur)
    let qpipm = entier(suivant.qpipm)
    // Le frais réel / les exclus reproposent la part IPM ; la part IPM saisie à
    // la main est respectée.
    if (champModifie === 'freel' || champModifie === 'fexclus') {
      qpipm = Math.round((taux * Math.max(0, freel - fexclus)) / 100)
      suivant.qpipm = String(qpipm)
    }
    const qppart = Math.max(0, freel - qpipm - qpassur)
    suivant.qppart = String(qppart)
    return suivant
  }

  const changer = (champ, valeur) => setSaisie((s) => avecCalcul({ ...s, [champ]: valeur }, champ))

  const ajouter = () => {
    const freel = entier(saisie.freel)
    if (!saisie.prestation && freel === 0) {
      toast.info('Choisissez une prestation et un frais réel.')
      return
    }
    setActes((liste) => [
      ...liste,
      {
        prestation: saisie.prestation,
        libelle: libellePrestation(saisie.prestation),
        quantite: Math.max(1, entier(saisie.quantite) || 1),
        freel,
        qpipm: entier(saisie.qpipm),
        qppart: entier(saisie.qppart),
        qpassur: entier(saisie.qpassur),
        fexclus: entier(saisie.fexclus),
        ajustement: entier(saisie.ajustement),
      },
    ])
    setSaisie(LIGNE_VIDE)
  }

  const retirer = (index) => setActes((liste) => liste.filter((_, i) => i !== index))

  const totaux = actes.reduce(
    (t, a) => ({
      freel: t.freel + entier(a.freel),
      qpipm: t.qpipm + entier(a.qpipm),
      qppart: t.qppart + entier(a.qppart),
      qpassur: t.qpassur + entier(a.qpassur),
      fexclus: t.fexclus + entier(a.fexclus),
      ajustement: t.ajustement + entier(a.ajustement),
    }),
    { freel: 0, qpipm: 0, qppart: 0, qpassur: 0, fexclus: 0, ajustement: 0 },
  )
  const ecart = montantBon - totaux.freel

  const enregistrer = async () => {
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/liquider/`, {
        method: 'POST',
        body: JSON.stringify({
          typeDocument: bon.typeDocument,
          documentId: bon.documentId,
          actes,
        }),
      })
      toast.success(`Bon ${bon.numero} liquidé`)
      onEnregistre()
    } catch (e) {
      toast.error(`Liquidation impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!bon) return null

  return (
    <CModal visible={visible} onClose={onFermer} size="xl" alignment="center" className="trt-liq">
      <CModalHeader>
        <CModalTitle>Traitement bon N° {bon.numero}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="trt-liq-haut">
          {/* Entête bon */}
          <div className="trt-liq-entete">
            <div className="trt-liq-entete-titre">Entête bon</div>
            <dl className="trt-infos">
              <Info libelle="Date" valeur={dateFr(bon.date)} />
              <Info libelle="Part." valeur={`${bon.matriculePart} - ${bon.participant}`} />
              <Info libelle={`Bénéficiaire (${bon.typeBenef})`} valeur={bon.beneficiaire} />
              <Info libelle="Montant Bon" valeur={`${montantFr(montantBon)} CFA`} />
              <Info
                libelle="Écart"
                valeur={
                  <span className={ecart !== 0 ? 'trt-ecart-non-nul' : undefined}>
                    {montantFr(ecart)}
                  </span>
                }
              />
            </dl>
          </div>

          {/* Saisie des actes */}
          <div className="trt-liq-saisie">
            <div className="trt-liq-entete-titre">Saisie des Actes</div>
            <div className="trt-liq-grille">
              <Champ libelle="Acte">
                <select
                  className="ddb-champ ddb-champ-liste"
                  value={saisie.prestation}
                  onChange={(e) => changer('prestation', e.target.value)}
                >
                  <option value="">- Prestation -</option>
                  {prestations.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} - {p.libelle}
                    </option>
                  ))}
                </select>
              </Champ>
              <ChampNombre
                libelle="Frais Réel"
                valeur={saisie.freel}
                onChanger={(v) => changer('freel', v)}
              />
              <ChampNombre
                libelle="QP.IPM"
                valeur={saisie.qpipm}
                onChanger={(v) => changer('qpipm', v)}
              />
              <ChampNombre
                libelle="QP.PART"
                valeur={saisie.qppart}
                onChanger={(v) => changer('qppart', v)}
              />
              <ChampNombre
                libelle="Quote Part Assur."
                valeur={saisie.qpassur}
                onChanger={(v) => changer('qpassur', v)}
              />
              <ChampNombre
                libelle="Frais Exclus"
                valeur={saisie.fexclus}
                onChanger={(v) => changer('fexclus', v)}
              />
              <ChampNombre
                libelle="Ajustement"
                valeur={saisie.ajustement}
                onChanger={(v) => changer('ajustement', v)}
              />
              <ChampNombre
                libelle="Quantité"
                valeur={saisie.quantite}
                onChanger={(v) => changer('quantite', v)}
              />
            </div>
            <div className="trt-liq-ajouter">
              <button type="button" className="ddb-bouton-enregistrer" onClick={ajouter}>
                <CIcon icon={cilPlus} className="me-2" />
                Valider
              </button>
            </div>
          </div>
        </div>

        {/* Tableau des actes liquidés */}
        <div className="ddb-tableau-conteneur trt-liq-tableau">
          <CTable responsive className="ddb-tableau align-middle mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Prestation</CTableHeaderCell>
                <CTableHeaderCell>Code prest.</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Qte.</CTableHeaderCell>
                <CTableHeaderCell className="text-end">F. réel</CTableHeaderCell>
                <CTableHeaderCell className="text-end">QP.IPM</CTableHeaderCell>
                <CTableHeaderCell className="text-end">QP.PART</CTableHeaderCell>
                <CTableHeaderCell className="text-end">QP. Assur</CTableHeaderCell>
                <CTableHeaderCell className="text-end">F. exclus</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Ajuste.</CTableHeaderCell>
                <CTableHeaderCell className="text-end" aria-label="Retirer" />
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {actes.length === 0 ? (
                <CTableRow>
                  <CTableDataCell colSpan={10} className="ddb-etat-vide">
                    Aucun acte. Saisissez-en un ci-dessus.
                  </CTableDataCell>
                </CTableRow>
              ) : (
                actes.map((a, index) => (
                  <CTableRow key={`${a.prestation}-${index}`}>
                    <CTableDataCell>{a.libelle || libellePrestation(a.prestation)}</CTableDataCell>
                    <CTableDataCell className="ddb-mono">{a.prestation}</CTableDataCell>
                    <CTableDataCell className="text-end">{a.quantite}</CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.freel)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.qpipm)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.qppart)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.qpassur)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.fexclus)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(a.ajustement)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end">
                      <button
                        type="button"
                        className="ddb-medic-retirer"
                        onClick={() => retirer(index)}
                        aria-label="Retirer l’acte"
                        title="Retirer"
                      >
                        <CIcon icon={cilX} />
                      </button>
                    </CTableDataCell>
                  </CTableRow>
                ))
              )}
            </CTableBody>
          </CTable>
        </div>

        <div className="trt-liq-pied">
          <div className="trt-liq-totaux">
            Montant Total : <strong>{montantFr(totaux.freel)}</strong> - Quote part IPM :{' '}
            <strong>{montantFr(totaux.qpipm)}</strong> / Quote part AGENT :{' '}
            <strong>{montantFr(totaux.qppart)}</strong>
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

const Info = ({ libelle, valeur }) => (
  <div className="trt-info">
    <dt>{libelle}</dt>
    <dd>{valeur}</dd>
  </div>
)

const Champ = ({ libelle, children }) => (
  <div className="ddb-groupe">
    <label>{libelle}</label>
    {children}
  </div>
)

const ChampNombre = ({ libelle, valeur, onChanger }) => (
  <div className="ddb-groupe">
    <label>{libelle}</label>
    <input
      className="ddb-champ text-end"
      value={valeur}
      onChange={(e) => onChanger(e.target.value)}
      inputMode="numeric"
      autoComplete="off"
    />
  </div>
)

export default LiquidationBonModal
