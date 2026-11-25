/**
 * Le menu « Gestion » du Journal Central (capture 72).
 *
 * LAMPS n'a pas d'écran pour la clôture : son menu Comptabilité ne porte que
 * Journal Central, Plan Comptable Général et Interrogation de Comptes. Les
 * deux opérations de clôture vivent ici, dans un menu déroulant du Journal
 * Central, et nulle part ailleurs :
 *
 *   - **Cloture Mensuelle** : la période ouverte avance d'un mois. C'est un
 *     curseur dans la table `params`, pas une opération comptable - rien n'est
 *     écrit au grand livre, aucune pièce n'est produite.
 *   - **Nouvel exercice** : le report à nouveau. Les soldes de bilan de
 *     l'exercice clos deviennent les à-nouveaux du suivant, en une pièce du
 *     journal **RAN** datée du 1er janvier.
 *
 * Nous avions fait de la seconde une page à part, « Report À Nouveau ». Elle
 * n'existe nulle part dans LAMPS : elle a été retirée en novembre 2026 et son
 * contenu est revenu ici, dans la fenêtre « Nouvel exercice ».
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CButton,
  CDropdown,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCalculator, cilCheckCircle, cilChevronBottom } from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'

/** « 1 250 000 » : séparateur de milliers à la française. */
const montant = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('fr-FR'))

/** Huit exercices proposés à la clôture : l'an dernier d'abord, celui qu'on clôt. */
const EXERCICES = (() => {
  const precedent = new Date().getFullYear() - 1
  return Array.from({ length: 8 }, (_, i) => precedent - i)
})()

/**
 * La fenêtre « Nouvel exercice » : on choisit l'exercice à clôturer, on relit
 * le report calculé par le serveur, puis on le génère. L'aperçu n'écrit rien -
 * il est produit par la même fonction que la génération, il ne peut donc pas
 * mentir sur ce qui sera posé.
 */
function NouvelExercice({ visible, onFermer, onGenere }) {
  const [exercice, setExercice] = useState(EXERCICES[0])
  const [apercu, setApercu] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [demanderConfirmation, modaleConfirmation] = useConfirmation()

  const calculer = useCallback(async () => {
    if (!visible) return
    setChargement(true)
    try {
      setApercu(await request(`/report-a-nouveau/apercu/?exercice=${exercice}`))
    } catch (e) {
      toast.error(`Calcul impossible : ${messageErreur(e)}`)
      setApercu(null)
    } finally {
      setChargement(false)
    }
  }, [exercice, visible])

  useEffect(() => {
    // Les états ne sont posés qu'après la réponse du serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    calculer()
  }, [calculer])

  const cible = apercu?.exerciceCible ?? exercice + 1
  const lignes = useMemo(() => apercu?.lignes || [], [apercu])
  const ecart = apercu?.ecart ?? 0

  const generer = async () => {
    // Conservé : écrit au journal RAN, une fois l'an, et ne se défait pas.
    const confirme = await demanderConfirmation({
      titre: 'Report à nouveau',
      message:
        `${apercu.nombre} solde(s) de bilan de l'exercice ${exercice} vont être reportés ` +
        `au journal RAN, datés du 1er janvier ${cible}. ` +
        `Cette opération fait foi : relisez l'aperçu avant.`,
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
      onGenere?.()
    } catch (e) {
      toast.error(`Report impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <CModal visible={visible} onClose={onFermer} size="xl" alignment="center">
        <CModalHeader>
          <CModalTitle>Nouvel exercice</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p className="jc-gestion-rappel">
            Le nouvel exercice reporte le <strong>solde de chaque compte de bilan</strong> (classes
            1 à 5) de l&rsquo;exercice clos sur le suivant, au journal <strong>RAN</strong>. Les
            charges et produits (classes 6 et 7) ne se reportent pas : ils repartent de zéro.
          </p>

          <div className="jc-gestion-barre">
            <label className="jc-filtre-groupe">
              <span className="jc-filtre-etiquette">Exercice à clôturer</span>
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
            <span className="jc-gestion-cible">
              Report sur <strong>{cible}</strong>
            </span>
          </div>

          {apercu && !chargement && (
            <div className="jc-gestion-totaux">
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
                <span
                  className="jc-gestion-ecart"
                  title="Écart = résultat de l'exercice, non encore affecté"
                >
                  Écart (résultat) : <strong>{montant(ecart)}</strong>
                </span>
              )}
            </div>
          )}

          <div className="tableau-conteneur jc-gestion-tableau">
            <table className="table ddb-tableau">
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
                    <td colSpan={6} className="text-center py-4">
                      <CSpinner size="sm" className="me-2" />
                      Calcul du report…
                    </td>
                  </tr>
                ) : lignes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      Aucun solde de bilan à reporter pour l&rsquo;exercice {exercice}.
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
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onFermer}>
            Fermer
          </CButton>
          {apercu?.dejaReporte ? (
            <span className="jc-gestion-fait">
              <CIcon icon={cilCheckCircle} className="me-1" />
              Déjà reporté sur {cible}
            </span>
          ) : (
            <CButton
              color="primary"
              disabled={chargement || envoi || !apercu || apercu.nombre === 0}
              onClick={generer}
            >
              {envoi ? (
                <CSpinner size="sm" className="me-2" />
              ) : (
                <CIcon icon={cilCalculator} className="me-2" />
              )}
              Générer le report
            </CButton>
          )}
        </CModalFooter>
      </CModal>
      {modaleConfirmation}
    </>
  )
}

/**
 * Le bouton « Gestion » et ses deux entrées. `periode` est le mois comptable
 * ouvert (ou null quand le serveur ne sait pas le dire) ; `onPeriode` est
 * rappelé après une clôture pour que l'en-tête se remette à jour.
 */
export default function GestionJournal({ periode, onPeriode, onReportGenere }) {
  const [nouvelExercice, setNouvelExercice] = useState(false)
  const [demanderConfirmation, modaleConfirmation] = useConfirmation()

  const cloturerMois = async () => {
    const quoi = periode?.libelle ? `le mois ${periode.libelle}` : 'le mois comptable en cours'
    // Conservé : la période comptable est commune à tous les postes, et rien
    // dans l'application ne sait la faire reculer.
    const confirme = await demanderConfirmation({
      titre: 'Clôture mensuelle',
      message:
        `Clôturer ${quoi} fait avancer d'un mois la période comptable, pour tout le monde. ` +
        `Aucune écriture n'est produite.`,
      confirmer: 'Clôturer le mois',
    })
    if (!confirme) return
    try {
      const r = await request('/mois-comptable/cloturer/', { method: 'POST', body: '{}' })
      toast.success(r.message || 'Mois clôturé')
      onPeriode?.()
    } catch (e) {
      toast.error(`Clôture impossible : ${messageErreur(e)}`)
    }
  }

  return (
    <>
      <CDropdown>
        <CDropdownToggle className="jc-bouton jc-gestion" caret={false}>
          <CIcon icon={cilChevronBottom} /> Gestion
        </CDropdownToggle>
        <CDropdownMenu>
          <CDropdownItem role="button" onClick={cloturerMois}>
            Cloture Mensuelle
          </CDropdownItem>
          <CDropdownItem role="button" onClick={() => setNouvelExercice(true)}>
            Nouvel exercice
          </CDropdownItem>
        </CDropdownMenu>
      </CDropdown>

      <NouvelExercice
        visible={nouvelExercice}
        onFermer={() => setNouvelExercice(false)}
        onGenere={onReportGenere}
      />
      {modaleConfirmation}
    </>
  )
}
