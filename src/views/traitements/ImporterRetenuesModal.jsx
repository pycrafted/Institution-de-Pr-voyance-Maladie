/**
 * Modal « Importation Retenues Frais Médicaux » (capture 87).
 *
 * **C'est le seul contrôle de tout le circuit, et il est humain.** Quand
 * M. Sakho a importé le fichier d'octobre, ce modal s'est ouvert, et il a
 * fait une chose : il a pris sa règle, cherché la ligne « IPM » sur le livre
 * de paie mensuel imprimé par Sage, et comparé ce papier au nombre affiché en
 * bas à droite. C'est tout. Si les deux tombent, il clique sur Importer.
 *
 * D'où la seule règle de mise en forme qui compte ici : **le total doit être
 * gros et seul**. « Total Participant: 161 - Montant Total: 9 650 869 »,
 * détaché du tableau, à l'endroit où l'œil va le chercher. Le reste - les
 * lignes du fichier - est là pour qu'on puisse vérifier une ligne qui
 * étonne, pas pour être lu en entier.
 *
 * Rien n'est écrit tant qu'on n'a pas cliqué : le fichier est lu dans le
 * navigateur, rapproché des lignes de la campagne, et l'appel au serveur ne
 * part qu'au clic. Deux choses s'y ajoutent, que l'original ne montrait pas :
 *
 *   - les matricules du fichier qui ne sont **d'aucune ligne** de la
 *     campagne, listés plutôt que tus - un agent parti en cours de mois
 *     figure encore sur l'état de la paie ;
 *   - les prélèvements qui **dépassent la dette**, comptés et totalisés
 *     avant même d'être chargés. Ils ne bloquent rien (décision du
 *     2026-11-05) : le montant est déjà retenu sur le bulletin. Mais on ne
 *     les découvre plus après coup.
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

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')

const ImporterRetenuesModal = ({ visible, campagne, lecture, onFermer, onImporte }) => {
  const [envoi, setEnvoi] = useState(false)

  const lignes = useMemo(() => lecture?.lignes || [], [lecture])
  const horsCampagne = useMemo(() => lecture?.horsCampagne || [], [lecture])

  const total = useMemo(
    () => lignes.reduce((somme, l) => somme + Number(l.montant || 0), 0),
    [lignes],
  )
  const depassements = useMemo(() => lignes.filter((l) => l.excedent > 0), [lignes])
  const excedent = useMemo(
    () => depassements.reduce((somme, l) => somme + l.excedent, 0),
    [depassements],
  )

  const importer = async () => {
    setEnvoi(true)
    try {
      const resultat = await request(`/retenues/${campagne.id}/importer/`, {
        method: 'POST',
        body: JSON.stringify({
          lignes: lignes.map((l) => ({ matricule: l.matricule, montant: l.montant })),
        }),
      })
      toast.success(resultat.message)
      onImporte()
    } catch (e) {
      toast.error(`Import impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!campagne || !lecture) return null

  return (
    <CModal visible={visible} onClose={onFermer} size="xl" alignment="center" className="rfm-modal">
      <CModalHeader>
        {/* Le titre de l'original nomme la campagne en entier : on sait de
            quoi on parle sans refermer le modal. */}
        <CModalTitle>
          Importation Retenues Frais Médicaux {campagne.societe} - {campagne.societeLibelle} -{' '}
          {lecture.periode}
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        {depassements.length > 0 && (
          <p className="rfm-alerte">
            {depassements.length} prélèvement{depassements.length > 1 ? 's' : ''} dépasse
            {depassements.length > 1 ? 'nt' : ''} la dette du participant, pour{' '}
            {montantFr(excedent)} F au total. Ils seront chargés : la paie les a déjà retenus sur
            les bulletins.
          </p>
        )}

        {horsCampagne.length > 0 && (
          <p className="rfm-note">
            {horsCampagne.length} matricule{horsCampagne.length > 1 ? 's' : ''} du fichier
            n&apos;appartien{horsCampagne.length > 1 ? 'nent' : 't'} à aucune ligne de la campagne
            et ser{horsCampagne.length > 1 ? 'ont' : 'a'} ignoré
            {horsCampagne.length > 1 ? 's' : ''} :{' '}
            {horsCampagne
              .slice(0, 12)
              .map((r) => r.matricule)
              .join(', ')}
            {horsCampagne.length > 12 ? '…' : ''}
          </p>
        )}

        <div className="tableau-conteneur rfm-import-tableau">
          <CTable hover className="ddb-tableau tableau-dense">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Code Retenu.</CTableHeaderCell>
                <CTableHeaderCell>Matricule</CTableHeaderCell>
                <CTableHeaderCell>Participant</CTableHeaderCell>
                <CTableHeaderCell>Code</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Montant salarial</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {lignes.map((l, i) => (
                <CTableRow key={`${l.matricule}-${i}`} className={l.excedent ? 'rfm-excede' : ''}>
                  <CTableDataCell className="trt-reg-mono">{l.code}</CTableDataCell>
                  <CTableDataCell className="trt-reg-mono">{l.matricule}</CTableDataCell>
                  <CTableDataCell>{l.participant}</CTableDataCell>
                  <CTableDataCell className="trt-reg-mono">{l.indicateur}</CTableDataCell>
                  <CTableDataCell className="text-end">
                    {montantFr(l.montant)}
                    {l.excedent > 0 && (
                      <span className="rfm-ecart" title="Au-delà de la dette">
                        +{montantFr(l.excedent)}
                      </span>
                    )}
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </div>

        {/* Le nombre que l'agent vient comparer à son livre de paie. Il est
            gros, il est seul, et il est à droite comme dans l'original. */}
        <p className="rfm-import-total">
          Total Participant: {lignes.length} - Montant Total: {montantFr(total)}
        </p>

        <div className="rfm-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={importer}
            disabled={envoi || !lignes.length}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Importer
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default ImporterRetenuesModal
