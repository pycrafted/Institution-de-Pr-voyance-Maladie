/**
 * Écran « Report À Nouveau » (menu Comptabilité).
 *
 * La clôture d'exercice de LAMPS ne passe pas par un bouton « clôturer » : elle
 * se fait par le **report à nouveau**, dans le journal RAN. On y reporte, d'un
 * exercice sur le suivant, le **solde de chaque compte de bilan** (classes 1 à
 * 5) ; les charges et produits (classes 6/7) ne se reportent pas, ils repartent
 * de zéro. C'est exactement ce que montrent les 97 067 écritures RAN réelles.
 *
 * L'écran se lit en deux temps : on choisit l'exercice à clôturer et on
 * **calcule** le report (aperçu, sans rien écrire) ; on le relit ; puis on le
 * **génère** - une pièce RAN datée du 1er janvier de l'exercice suivant.
 *
 * Tout vient du backend (/api/report-a-nouveau/apercu/ et /generer/).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CBadge, CButton, CCard, CCardBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCalculator, cilCheckCircle } from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'
import '../donnees-de-base/donnees-de-base.scss'
import './report-a-nouveau.scss'

/** « 1 250 000 » : séparateur de milliers à la française. */
const montant = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('fr-FR'))

/** Huit exercices proposés à la clôture : l'an dernier d'abord (celui qu'on clôt). */
const EXERCICES = (() => {
  const precedent = new Date().getFullYear() - 1
  return Array.from({ length: 8 }, (_, i) => precedent - i)
})()

const ReportANouveau = () => {
  const [exercice, setExercice] = useState(EXERCICES[0])
  const [apercu, setApercu] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [demanderConfirmation, modaleConfirmation] = useConfirmation()

  const calculer = useCallback(async () => {
    setChargement(true)
    try {
      const data = await request(`/report-a-nouveau/apercu/?exercice=${exercice}`)
      setApercu(data)
    } catch (e) {
      toast.error(`Calcul impossible : ${messageErreur(e)}`)
      setApercu(null)
    } finally {
      setChargement(false)
    }
  }, [exercice])

  // Recalcule l'aperçu à chaque changement d'exercice.
  useEffect(() => {
    // Les états ne sont posés qu'après la réponse du serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    calculer()
  }, [calculer])

  const cible = apercu?.exerciceCible ?? exercice + 1

  const generer = async () => {
    const confirme = await demanderConfirmation({
      titre: 'Confirmer le report à nouveau',
      message:
        `Générer le report à nouveau de l'exercice ${exercice} vers ${cible} ? ` +
        `${apercu.nombre} solde(s) de bilan seront reportés au journal RAN, ` +
        `datés du 1er janvier ${cible}. Cette opération fait foi : relisez l'aperçu avant.`,
      confirmer: 'Générer le report',
    })
    if (!confirme) return
    try {
      setEnvoi(true)
      const r = await request('/report-a-nouveau/generer/', {
        method: 'POST',
        body: JSON.stringify({ exercice }),
      })
      toast.success(r.message || 'Report à nouveau généré')
      await calculer()
    } catch (e) {
      toast.error(`Report impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  const ecart = apercu?.ecart ?? 0
  const lignes = useMemo(() => apercu?.lignes || [], [apercu])

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="ddb-contenu">
          <div className="ddb-referentiel-entete">
            <h2 className="ddb-referentiel-titre">Report À Nouveau</h2>
          </div>

          {/* Rappel du principe comptable, comme les autres écrans qui
              expliquent ce qu'ils font. */}
          <p className="ran-rappel">
            La clôture reporte le <strong>solde de chaque compte de bilan</strong> (classes 1 à 5)
            de l'exercice clos sur le suivant, au journal <strong>RAN</strong>. Les charges et
            produits (classes 6 et 7) ne se reportent pas : ils repartent de zéro.
          </p>

          <div className="ddb-barre-outils ddb-barre-soulignee ran-barre">
            <label className="ddb-filtre-groupe">
              <span className="ddb-filtre-etiquette">Exercice à clôturer</span>
              <select
                className="ddb-filtre"
                value={exercice}
                onChange={(e) => setExercice(Number(e.target.value))}
              >
                {EXERCICES.map((an) => (
                  <option key={an} value={an}>
                    {an}
                  </option>
                ))}
              </select>
            </label>

            <span className="ran-fleche" aria-hidden="true">
              →
            </span>
            <span className="ran-cible">
              Report sur <strong>{cible}</strong>
            </span>

            <div className="ddb-barre-actions ddb-barre-actions-droite">
              {apercu?.dejaReporte ? (
                <CBadge color="dark" className="ran-badge-fait">
                  <CIcon icon={cilCheckCircle} className="me-1" />
                  Déjà reporté sur {cible}
                </CBadge>
              ) : (
                <CButton
                  color="primary"
                  className="ddb-bouton-nouveau"
                  disabled={chargement || envoi || !apercu || apercu.nombre === 0}
                  onClick={generer}
                >
                  {envoi ? (
                    <CSpinner size="sm" className="me-2" />
                  ) : (
                    <CIcon icon={cilCalculator} className="ddb-bouton-nouveau-icone" />
                  )}
                  Générer le report
                </CButton>
              )}
            </div>
          </div>

          {/* Totaux du report, en bandeau, comme le solde du Journal Central. */}
          {apercu && !chargement && (
            <div className="ran-totaux">
              <span>
                Soldes à reporter : <strong>{apercu.nombre}</strong>
              </span>
              <span>
                Total débit : <strong>{montant(apercu.totalDebit)}</strong>
              </span>
              <span>
                Total crédit : <strong>{montant(apercu.totalCredit)}</strong>
              </span>
              {ecart !== 0 && (
                <span className="ran-ecart" title="Écart = résultat de l'exercice, non encore affecté">
                  Écart (résultat) : <strong>{montant(ecart)}</strong>
                </span>
              )}
            </div>
          )}

          <div className="ddb-tableau-conteneur">
            <table className="ddb-tableau ran-tableau">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Intitulé</th>
                  <th>Tiers</th>
                  <th>Société</th>
                  <th className="text-end">Débit</th>
                  <th className="text-end">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {chargement ? (
                  <tr>
                    <td colSpan={6} className="ddb-etat-vide">
                      <CSpinner size="sm" className="me-2" />
                      Calcul du report…
                    </td>
                  </tr>
                ) : lignes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="ddb-etat-vide">
                      Aucun solde de bilan à reporter pour l'exercice {exercice}.
                    </td>
                  </tr>
                ) : (
                  lignes.map((l, i) => (
                    <tr key={`${l.comptegen}-${l.comptetiers}-${l.codesoc}-${i}`}>
                      <td className="ddb-mono">{l.comptegen}</td>
                      <td>{l.intitule}</td>
                      <td className="ddb-mono">{l.comptetiers}</td>
                      <td className="ddb-mono">{l.codesoc}</td>
                      <td className="text-end">{l.debit ? montant(l.debit) : ''}</td>
                      <td className="text-end">{l.credit ? montant(l.credit) : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {modaleConfirmation}
      </CCardBody>
    </CCard>
  )
}

export default ReportANouveau
