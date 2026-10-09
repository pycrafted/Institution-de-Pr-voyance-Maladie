/**
 * Page « Traitement d'une facture » (capture 38).
 *
 * On y rattache à la facture les bons/lettres émis pour son prestataire et
 * restés en instance, chaque rattachement liquidant le bon (proposition 85/15,
 * cf. backend liquidation.py). On suit l'ÉCART (Montant Net − Σ bons traités) et
 * on valide la facture. La liquidation acte par acte (capture 39) viendra à la
 * tranche suivante ; ici, le rattachement applique directement la proposition.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CBadge,
  CButton,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
  CTooltip,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilActionUndo,
  cilArrowLeft,
  cilCalculator,
  cilCheckAlt,
  cilPencil,
  cilPlus,
} from '@coreui/icons'

import { request } from '../../services/api'
import { listerEntreesSync } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'
import { dateFr } from '../documents/commun'
import LiquidationBonModal from './LiquidationBonModal'
import BonManuelModal from './BonManuelModal'
import './traitements.scss'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')

const FactureDetails = ({ id }) => {
  const navigate = useNavigate()
  const parametres = useParams()
  const factureId = id || parametres.id

  const [facture, setFacture] = useState(null)
  const [instance, setInstance] = useState([])
  const [traites, setTraites] = useState([])
  const [ecritures, setEcritures] = useState([])
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  // Bon en cours de liquidation (modal acte par acte, capture 39).
  const [liquidation, setLiquidation] = useState(null)
  // Création d'un bon manuel (sans document préexistant).
  const [bonManuel, setBonManuel] = useState(false)
  const [demanderConfirmation, modaleConfirmation] = useConfirmation()

  const charger = useCallback(async () => {
    try {
      const [f, inst, trt, ecr] = await Promise.all([
        request(`/factures/${factureId}/`),
        request(`/factures/${factureId}/bons-en-instance/`),
        request(`/factures/${factureId}/bons-traites/`),
        request(`/factures/${factureId}/ecritures/`),
      ])
      setFacture(f)
      setInstance(inst)
      setTraites(trt)
      setEcritures(ecr)
    } catch (e) {
      toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [factureId])

  useEffect(() => {
    // Les états ne sont posés qu'après la réponse du serveur, jamais au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  // Ouvre le modal de liquidation pour un bon en instance (nouvelle liquidation)
  // ou un bon déjà traité (modification).
  const liquiderInstance = (b) =>
    setLiquidation({
      typeDocument: b.typeDocument,
      documentId: b.id,
      numero: b.numero,
      date: b.date,
      matriculePart: b.matriculePart,
      participant: b.participant,
      beneficiaire: b.beneficiaire,
      typeBenef: b.typeBenef,
      codeSoc: b.codeSoc,
      montant: b.montant,
      actes: [],
    })

  const liquiderTraite = (b) =>
    setLiquidation({
      typeDocument: b.typeDocument,
      documentId: b.documentId,
      numero: b.numero,
      date: b.date,
      matriculePart: b.matriculePart,
      participant: b.participant,
      beneficiaire: b.beneficiaire,
      typeBenef: b.typeBenef,
      codeSoc: b.codeSoc,
      montant: b.freel,
      actes: b.actes,
    })

  const detacher = async (liquidationBon) => {
    const confirme = await demanderConfirmation({
      titre: 'Détacher le bon',
      message: `Détacher ${liquidationBon.numero} de la facture ? Il reviendra dans les bons en instance.`,
      confirmer: 'Détacher',
      danger: true,
    })
    if (!confirme) return
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/detacher/`, {
        method: 'POST',
        body: JSON.stringify({ liquidationId: liquidationBon.id }),
      })
      toast.info(`${liquidationBon.numero} détaché`)
      await charger()
    } catch (e) {
      toast.error(`Détachement impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  const valider = async () => {
    const confirme = await demanderConfirmation({
      titre: 'Valider la facture',
      message: `Valider la facture n° ${facture.numero} ? Elle passera « Traitée ».`,
      confirmer: 'Valider',
    })
    if (!confirme) return
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/valider/`, { method: 'POST' })
      toast.success(`Facture n° ${facture.numero} validée`)
      await charger()
    } catch (e) {
      toast.error(`Validation impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  const comptabiliser = async () => {
    const confirme = await demanderConfirmation({
      titre: 'Comptabiliser la facture',
      message: `Comptabiliser la facture n° ${facture.numero} ? Les écritures du journal IF seront générées.`,
      confirmer: 'Comptabiliser',
    })
    if (!confirme) return
    try {
      setEnvoi(true)
      await request(`/factures/${factureId}/comptabiliser/`, { method: 'POST' })
      toast.success(`Facture n° ${facture.numero} comptabilisée`)
      await charger()
    } catch (e) {
      toast.error(`Comptabilisation impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (chargement) {
    return (
      <div className="trt-chargement">
        <CSpinner size="sm" />
        <span>Chargement de la facture…</span>
      </div>
    )
  }
  if (!facture) {
    return <div className="trt-chargement">Facture introuvable.</div>
  }

  const totalFreel = traites.reduce((s, b) => s + Number(b.freel || 0), 0)
  const totalIpm = traites.reduce((s, b) => s + Number(b.qpipm || 0), 0)
  const totalPart = traites.reduce((s, b) => s + Number(b.qppart || 0), 0)
  const totalRemise = traites.reduce((s, b) => s + Number(b.remise || 0), 0)
  const ecart = Number(facture.montantNet || 0) - totalFreel
  const traitee = facture.etat === 'Traitée'
  const comptabilisee = facture.etat === 'Comptabilisée' || facture.etat === 'Payée'
  // « validé » fige le rattachement / la liquidation (dès que la facture est traitée).
  const valide = traitee || comptabilisee

  return (
    <div className="trt-traitement">
      {/* Carte d'en-tête + actions */}
      <div className="trt-entete">
        <div className="trt-carte-facture">
          <div className="trt-carte-titre">
            Fact. N° {facture.numero} / {facture.codeFournisseur} - {facture.fournisseur}
          </div>
          <dl className="trt-infos">
            <Info libelle="Société" valeur={`${facture.codeSoc} - ${nomSociete(facture)}`} />
            <Info libelle="Date" valeur={dateFr(facture.dateFacture)} />
            <Info libelle="Date traitement" valeur={facture.moisTraitement || '-'} />
            <Info
              libelle="État"
              valeur={
                <CBadge color="secondary" className="fw-normal">
                  {facture.etat}
                </CBadge>
              }
            />
            <Info libelle="Frais Réel" valeur={`${montantFr(facture.fraisReel)} CFA`} />
            <Info libelle="Remise" valeur={`${montantFr(facture.remise)} CFA`} />
            <Info libelle="Ristourne" valeur={`${montantFr(facture.ristourne)} CFA`} />
            <Info
              libelle="Montant Net Facture"
              valeur={<span className="trt-net">{montantFr(facture.montantNet)} CFA</span>}
            />
          </dl>
        </div>

        <div className="trt-colonne-droite">
          <div className="trt-boutons">
            {!valide && (
              <button
                type="button"
                className="ddb-outil trt-bouton-manuel"
                onClick={() => setBonManuel(true)}
                disabled={envoi}
              >
                <CIcon icon={cilPlus} className="ddb-outil-icone" />
                Créer bon manuel
              </button>
            )}
            {!valide && (
              <button
                type="button"
                className="ddb-bouton-enregistrer"
                onClick={valider}
                disabled={envoi}
              >
                <CIcon icon={cilCheckAlt} className="me-2" />
                Valider facture
              </button>
            )}
            {traitee && (
              <button
                type="button"
                className="ddb-bouton-enregistrer"
                onClick={comptabiliser}
                disabled={envoi}
              >
                <CIcon icon={cilCalculator} className="me-2" />
                Comptabiliser
              </button>
            )}
            <button
              type="button"
              className="ddb-outil"
              onClick={() => navigate('/traitements/factures')}
            >
              <CIcon icon={cilArrowLeft} className="ddb-outil-icone" />
              Fermer
            </button>
          </div>

          {/* Liste des bons en instance */}
          <div className="trt-bloc">
            <div className="trt-bloc-titre">Liste des bons en instance</div>
            <div className="ddb-tableau-conteneur">
              <CTable hover responsive className="ddb-tableau align-middle mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>N° Bon/Lettre</CTableHeaderCell>
                    <CTableHeaderCell>Date</CTableHeaderCell>
                    <CTableHeaderCell>Mat. Part.</CTableHeaderCell>
                    <CTableHeaderCell>Participant</CTableHeaderCell>
                    <CTableHeaderCell>Type Benef.</CTableHeaderCell>
                    <CTableHeaderCell>Beneficiaire</CTableHeaderCell>
                    <CTableHeaderCell className="text-end" aria-label="Rattacher" />
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {instance.length === 0 ? (
                    <CTableRow>
                      <CTableDataCell colSpan={7} className="ddb-etat-vide">
                        Aucun bon en instance pour ce prestataire.
                      </CTableDataCell>
                    </CTableRow>
                  ) : (
                    instance.map((b) => (
                      <CTableRow key={`${b.typeDocument}-${b.id}`} className="ddb-ligne">
                        <CTableDataCell className="ddb-mono fw-semibold">{b.numero}</CTableDataCell>
                        <CTableDataCell>{dateFr(b.date)}</CTableDataCell>
                        <CTableDataCell className="ddb-mono">{b.matriculePart}</CTableDataCell>
                        <CTableDataCell>{b.participant}</CTableDataCell>
                        <CTableDataCell>{b.typeBenef}</CTableDataCell>
                        <CTableDataCell>{b.beneficiaire}</CTableDataCell>
                        <CTableDataCell className="text-end">
                          {!valide && (
                            <CTooltip content="Liquider le bon">
                              <CButton
                                color="light"
                                size="sm"
                                className="ddb-action"
                                disabled={envoi}
                                aria-label={`Liquider ${b.numero}`}
                                onClick={() => liquiderInstance(b)}
                              >
                                <CIcon icon={cilCalculator} />
                              </CButton>
                            </CTooltip>
                          )}
                        </CTableDataCell>
                      </CTableRow>
                    ))
                  )}
                </CTableBody>
              </CTable>
            </div>
          </div>
        </div>
      </div>

      {/* Bons traités */}
      <div className="trt-bloc trt-bloc-traites">
        <div className="trt-bloc-titre">Bons traités</div>
        <div className="ddb-tableau-conteneur">
          <CTable hover responsive className="ddb-tableau align-middle mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>N° Bon/Lettre</CTableHeaderCell>
                <CTableHeaderCell>Date</CTableHeaderCell>
                <CTableHeaderCell>Mat. Part.</CTableHeaderCell>
                <CTableHeaderCell>Participant</CTableHeaderCell>
                <CTableHeaderCell>Type Bénéf.</CTableHeaderCell>
                <CTableHeaderCell>Bénéficiaire</CTableHeaderCell>
                <CTableHeaderCell className="text-end">F. réels</CTableHeaderCell>
                <CTableHeaderCell className="text-end">QP.IPM</CTableHeaderCell>
                <CTableHeaderCell className="text-end">QP PART</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Remise</CTableHeaderCell>
                <CTableHeaderCell className="text-end" aria-label="Détacher" />
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {traites.length === 0 ? (
                <CTableRow>
                  <CTableDataCell colSpan={11} className="ddb-etat-vide">
                    Aucun bon traité. Rattachez un bon en instance ci-dessus.
                  </CTableDataCell>
                </CTableRow>
              ) : (
                traites.map((b) => (
                  <CTableRow key={b.id} className="ddb-ligne">
                    <CTableDataCell className="ddb-mono fw-semibold">{b.numero}</CTableDataCell>
                    <CTableDataCell>{dateFr(b.date)}</CTableDataCell>
                    <CTableDataCell className="ddb-mono">{b.matriculePart}</CTableDataCell>
                    <CTableDataCell>{b.participant}</CTableDataCell>
                    <CTableDataCell>{b.typeBenef}</CTableDataCell>
                    <CTableDataCell>{b.beneficiaire}</CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(b.freel)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(b.qpipm)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(b.qppart)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {montantFr(b.remise)}
                    </CTableDataCell>
                    <CTableDataCell className="text-end">
                      {/* La modification acte par acte passe par le bon source ;
                          un bon manuel n'en a pas, il se détache et se recrée. */}
                      {!valide && b.typeDocument !== 'manuel' && (
                        <CTooltip content="Modifier la liquidation">
                          <CButton
                            color="light"
                            size="sm"
                            className="ddb-action"
                            disabled={envoi}
                            aria-label={`Modifier la liquidation de ${b.numero}`}
                            onClick={() => liquiderTraite(b)}
                          >
                            <CIcon icon={cilPencil} />
                          </CButton>
                        </CTooltip>
                      )}
                      {!valide && (
                        <CTooltip content="Détacher">
                          <CButton
                            color="light"
                            size="sm"
                            className="ddb-action ddb-action-danger"
                            disabled={envoi}
                            aria-label={`Détacher ${b.numero}`}
                            onClick={() => detacher(b)}
                          >
                            <CIcon icon={cilActionUndo} />
                          </CButton>
                        </CTooltip>
                      )}
                    </CTableDataCell>
                  </CTableRow>
                ))
              )}
            </CTableBody>
            {traites.length > 0 && (
              <CTableBody>
                <CTableRow className="trt-total">
                  <CTableDataCell colSpan={6} className="text-end fw-semibold">
                    Totaux
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(totalFreel)}
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(totalIpm)}
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(totalPart)}
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(totalRemise)}
                  </CTableDataCell>
                  <CTableDataCell />
                </CTableRow>
              </CTableBody>
            )}
          </CTable>
        </div>

        <div className="trt-ecart">
          Total Bons traités : <strong>{montantFr(totalFreel)}</strong> ({traites.length}) - Écart :{' '}
          <strong className={ecart !== 0 ? 'trt-ecart-non-nul' : undefined}>
            {montantFr(ecart)}
          </strong>
        </div>
      </div>

      {/* Écritures comptables (après comptabilisation) */}
      {comptabilisee && ecritures.length > 0 && (
        <div className="trt-bloc trt-bloc-traites">
          <div className="trt-bloc-titre">Écritures comptables (journal IF)</div>
          <div className="ddb-tableau-conteneur">
            <CTable responsive className="ddb-tableau align-middle mb-0">
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Journal</CTableHeaderCell>
                  <CTableHeaderCell>N° pièce</CTableHeaderCell>
                  <CTableHeaderCell>Compte</CTableHeaderCell>
                  <CTableHeaderCell>Tiers</CTableHeaderCell>
                  <CTableHeaderCell>Libellé</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Débit</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Crédit</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {ecritures.map((e) => (
                  <CTableRow key={e.id}>
                    <CTableDataCell className="ddb-mono">{e.codej}</CTableDataCell>
                    <CTableDataCell className="ddb-mono">{e.numpiece}</CTableDataCell>
                    <CTableDataCell className="ddb-mono">{e.comptegen}</CTableDataCell>
                    <CTableDataCell className="ddb-mono">{e.comptetiers}</CTableDataCell>
                    <CTableDataCell>{e.libelle}</CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {e.debit ? montantFr(e.debit) : ''}
                    </CTableDataCell>
                    <CTableDataCell className="text-end ddb-mono">
                      {e.credit ? montantFr(e.credit) : ''}
                    </CTableDataCell>
                  </CTableRow>
                ))}
                <CTableRow className="trt-total">
                  <CTableDataCell colSpan={5} className="text-end fw-semibold">
                    Totaux
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(ecritures.reduce((s, e) => s + Number(e.debit || 0), 0))}
                  </CTableDataCell>
                  <CTableDataCell className="text-end ddb-mono fw-semibold">
                    {montantFr(ecritures.reduce((s, e) => s + Number(e.credit || 0), 0))}
                  </CTableDataCell>
                </CTableRow>
              </CTableBody>
            </CTable>
          </div>
        </div>
      )}

      {liquidation && (
        <LiquidationBonModal
          factureId={factureId}
          bon={liquidation}
          visible={Boolean(liquidation)}
          onFermer={() => setLiquidation(null)}
          onEnregistre={async () => {
            setLiquidation(null)
            await charger()
          }}
        />
      )}

      {bonManuel && (
        <BonManuelModal
          factureId={factureId}
          facture={facture}
          visible={bonManuel}
          onFermer={() => setBonManuel(false)}
          onEnregistre={async () => {
            setBonManuel(false)
            await charger()
          }}
        />
      )}

      {modaleConfirmation}
    </div>
  )
}

/** Une information de la carte : libellé à gauche, valeur à droite. */
const Info = ({ libelle, valeur }) => (
  <div className="trt-info">
    <dt>{libelle}</dt>
    <dd>{valeur}</dd>
  </div>
)

/** Intitulé de la société, lu dans le référentiel des adhérents. */
const nomSociete = (facture) =>
  listerEntreesSync('adherents').find((a) => a.code === facture.codeSoc)?.libelle || ''

export default FactureDetails
