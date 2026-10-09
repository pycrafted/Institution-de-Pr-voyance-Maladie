/**
 * Modal « Créer bon manuel » - crée un bon directement au traitement d'une
 * facture, sans document préexistant à rattacher (capture 38, surtout pour les
 * factures « divers »). On désigne le participant, le bénéficiaire et la nature
 * du bénéfice, puis on liquide acte par acte (même logique 85/87 que la
 * liquidation d'un bon). « Enregistrer » crée le bon, l'ajoute aux bons traités
 * et le fait compter dans l'écart de la facture.
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

const BonManuelModal = ({ factureId, facture, visible, onFermer, onEnregistre }) => {
  const codeSoc = facture?.codeSoc || ''
  const taux = tauxDe(codeSoc)

  const prestations = useMemo(
    () => listerEntreesSync('types-prestations').filter((p) => p.actif !== false),
    [],
  )
  const libellePrestation = (code) => prestations.find((p) => p.code === code)?.libelle || code

  const typesBenef = useMemo(
    () => listerEntreesSync('types-beneficiaires').filter((t) => t.actif !== false),
    [],
  )
  // Participants de la société de la facture (le bon manuel reste dans sa société).
  const participants = useMemo(
    () =>
      listerEntreesSync('participants')
        .filter((p) => p.adherent === codeSoc)
        .sort((a, b) => String(a.matricule).localeCompare(String(b.matricule))),
    [codeSoc],
  )

  // --- Identité du bon ---
  const [matricule, setMatricule] = useState('')
  const [typeBenef, setTypeBenef] = useState('1')
  const [beneficiaire, setBeneficiaire] = useState('')

  const participantChoisi = participants.find((p) => p.matricule === matricule)
  const nomParticipant = participantChoisi
    ? `${participantChoisi.prenoms || ''} ${participantChoisi.nom || ''}`.trim()
    : ''

  const changerParticipant = (mat) => {
    setMatricule(mat)
    // Par défaut, le bénéficiaire est le participant lui-même.
    const p = participants.find((x) => x.matricule === mat)
    if (p && (typeBenef === '1' || !beneficiaire)) {
      setBeneficiaire(`${p.prenoms || ''} ${p.nom || ''}`.trim())
    }
  }
  const changerType = (code) => {
    setTypeBenef(code)
    // « Participant » (code 1) : le bénéficiaire est le participant lui-même.
    if (code === '1' && nomParticipant) setBeneficiaire(nomParticipant)
  }

  // --- Saisie des actes (même logique 85/87 que la liquidation) ---
  const [actes, setActes] = useState([])
  const [saisie, setSaisie] = useState(LIGNE_VIDE)
  const [envoi, setEnvoi] = useState(false)

  const avecCalcul = (suivant, champModifie) => {
    const freel = entier(suivant.freel)
    const fexclus = Math.min(entier(suivant.fexclus), freel)
    const qpassur = entier(suivant.qpassur)
    let qpipm = entier(suivant.qpipm)
    if (champModifie === 'freel' || champModifie === 'fexclus') {
      qpipm = Math.round((taux * Math.max(0, freel - fexclus)) / 100)
      suivant.qpipm = String(qpipm)
    }
    suivant.qppart = String(Math.max(0, freel - qpipm - qpassur))
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
    }),
    { freel: 0, qpipm: 0, qppart: 0 },
  )

  const enregistrer = async () => {
    if (!matricule) {
      toast.info('Choisissez un participant.')
      return
    }
    if (actes.length === 0) {
      toast.info('Ajoutez au moins un acte.')
      return
    }
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/creer-bon-manuel/`, {
        method: 'POST',
        body: JSON.stringify({
          matriculePart: `${codeSoc}-${matricule}`,
          participant: nomParticipant,
          typeBenef,
          beneficiaire: beneficiaire || nomParticipant,
          actes,
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
    <CModal visible={visible} onClose={onFermer} size="xl" alignment="center" className="trt-liq">
      <CModalHeader>
        <CModalTitle>Créer un bon manuel</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {/* Identité du bon */}
        <div className="trt-liq-saisie">
          <div className="trt-liq-entete-titre">Participant &amp; bénéficiaire</div>
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
            <Champ libelle="Type bénéficiaire">
              <select
                className="ddb-champ ddb-champ-liste"
                value={typeBenef}
                onChange={(e) => changerType(e.target.value)}
              >
                {typesBenef.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} - {t.libelle}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Bénéficiaire">
              <input
                className="ddb-champ"
                value={beneficiaire}
                onChange={(e) => setBeneficiaire(e.target.value)}
                placeholder="Nom du bénéficiaire"
                autoComplete="off"
              />
            </Champ>
          </div>
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

        {/* Tableau des actes */}
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
                <CTableHeaderCell className="text-end" aria-label="Retirer" />
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {actes.length === 0 ? (
                <CTableRow>
                  <CTableDataCell colSpan={7} className="ddb-etat-vide">
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

export default BonManuelModal
