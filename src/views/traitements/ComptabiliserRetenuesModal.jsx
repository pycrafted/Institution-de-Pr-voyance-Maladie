/**
 * Modal « Aperçu écritures au journal » des Retenues Frais Médicaux
 * (capture 88).
 *
 * Le dernier regard avant le grand livre. M. Sakho y fait un seul geste, et
 * c'est le seul contrôle automatique de tout le circuit : **il vérifie que le
 * total débit égale le total crédit**, puis il valide. On garde ce geste, on
 * le rend juste impossible à rater - le bouton Valider reste pâli tant que
 * les deux totaux diffèrent.
 *
 * L'aperçu est calculé par le serveur, par la **même fonction** qui écrira
 * les lignes pour de bon : il ne peut donc pas mentir sur ce qui sera posé.
 * Rien n'est enregistré tant que « Valider » n'est pas cliqué.
 *
 * Trois choses de l'original, qui ne sont pas du décor quand la pièce porte
 * 162 lignes - un crédit par agent prélevé, plus la contrepartie : un champ
 * **Rechercher**, une **pagination** à 50 lignes, et les onze colonnes du
 * grand livre, `N° Chèque` et `N° F. IPM` comprises. Ces deux-là restent vides
 * sur une retenue - elle ne naît ni d'un chèque ni d'une facture - mais la
 * grille est la même partout où l'application montre des écritures, et c'est
 * ce qui permet de la lire sans réapprendre.
 *
 * Une chose s'ajoute à LAMPS, et c'est la décision du 2026-11-05 : les
 * prélèvements qui dépassent la dette sont **rappelés ici**, une dernière
 * fois, avec leur total. Ils ne bloquent rien. Le montant est déjà retenu sur
 * le bulletin de l'agent ; le refuser ne le lui rendrait pas, et creuserait
 * un écart avec la comptabilité de Sage. Mais l'agent qui valide le fait en
 * connaissance de cause, ce que LAMPS ne permettait pas : il n'en disait
 * rien, et la production porte 310 cas pour 8 563 422 F.
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

import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight } from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const dateFr = (iso) => {
  if (!iso) return ''
  const [a, m, j] = String(iso).split('-')
  return `${j}/${m}/${a}`
}
const ABREGES = [
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
/** « juin-2026 » : le mois auquel la retenue se rapporte. */
const moisDe = (iso) => {
  if (!iso) return ''
  const [a, m] = String(iso).split('-')
  return `${ABREGES[Number(m) - 1]}-${a}`
}

const PAR_PAGE = [25, 50, 100, 200]

const ComptabiliserRetenuesModal = ({ campagne, visible, onFermer, onEnregistre }) => {
  const [recherche, setRecherche] = useState('')
  const [page, setPage] = useState(1)
  const [parPage, setParPage] = useState(50)
  const [apercu, setApercu] = useState(null)
  // La campagne dont le calcul a echoue, et non un simple drapeau : ainsi
  // rien n'a besoin d'etre remis a zero dans l'effet, qui n'aurait alors plus
  // le droit de s'appeler un effet.
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  const id = campagne?.id
  // « En calcul » se déduit : la campagne est là, son aperçu n'est pas encore
  // arrivé, et il n'a pas échoué. Rien à mettre à jour dans l'effet.
  const chargement = Boolean(id) && apercu?.id !== id && echec !== id

  useEffect(() => {
    if (!visible || !id) return undefined
    let abandonne = false
    request(`/retenues/${id}/apercu/`)
      .then((r) => {
        if (!abandonne) setApercu({ id, ...r })
      })
      .catch((e) => {
        if (abandonne) return
        setEchec(id)
        toast.error(`Aperçu impossible : ${messageErreur(e)}`)
      })
    return () => {
      abandonne = true
    }
  }, [visible, id])

  // `id` est teste en premier, et ce n'est pas une precaution de style : sans
  // campagne, `id` et `apercu?.id` valent tous deux `undefined`, la comparaison
  // est vraie, et on dereference un `apercu` nul. Le hook tourne avant le
  // `return null` d'en bas, donc la page entiere tombait.
  const ecritures = useMemo(
    () => (id && apercu?.id === id ? apercu.ecritures || [] : []),
    [apercu, id],
  )
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

  // La recherche et la pagination ne touchent **que l'affichage**. Les totaux
  // du bas restent ceux de la pièce entière : c'est eux qu'on vient vérifier,
  // et un total qui bougerait au gré d'un filtre ne vérifierait plus rien.
  const terme = recherche.trim().toLowerCase()
  const filtrees = terme
    ? ecritures.filter((e) =>
        [e.comptetiers, e.comptegen, e.matri, e.libelle, e.numpiece]
          .join(' ')
          .toLowerCase()
          .includes(terme),
      )
    : ecritures
  const pages = Math.max(1, Math.ceil(filtrees.length / parPage))
  const pageSure = Math.min(page, pages)
  const visibles = filtrees.slice((pageSure - 1) * parPage, pageSure * parPage)
  const premier = filtrees.length ? (pageSure - 1) * parPage + 1 : 0
  const dernier = Math.min(pageSure * parPage, filtrees.length)

  const valider = async () => {
    setEnvoi(true)
    try {
      const r = await request('/retenues/comptabiliser/', {
        method: 'POST',
        body: JSON.stringify({ campagnes: [id] }),
      })
      toast.success(r.message)
      onEnregistre()
    } catch (e) {
      toast.error(`Comptabilisation impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  if (!campagne) return null

  const equilibre = totaux.debit === totaux.credit
  const anomalies = Number(campagne.anomalies || 0)

  return (
    <CModal
      visible={visible}
      onClose={onFermer}
      size="xl"
      alignment="center"
      className="trt-reglement rfm-apercu-modal"
    >
      <CModalHeader>
        <CModalTitle>Aperçu écritures au journal</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="trt-reg-entete">
          <Champ libelle="Campagne">
            <input className="ddb-champ" value={campagne.code} readOnly disabled />
          </Champ>
          <Champ libelle="Société">
            <input
              className="ddb-champ"
              value={`${campagne.societe} - ${campagne.societeLibelle || ''}`}
              readOnly
              disabled
            />
          </Champ>
          <Champ libelle="Prélevés">
            <input
              className="ddb-champ"
              value={`${campagne.preleves} / ${campagne.participants}`}
              readOnly
              disabled
            />
          </Champ>
        </div>

        {/* Le rappel des dépassements : il informe, il n'interdit pas. */}
        {anomalies > 0 && (
          <p className="rfm-alerte">
            {anomalies} prélèvement{anomalies > 1 ? 's' : ''} dépasse
            {anomalies > 1 ? 'nt' : ''} la dette, pour {montantFr(campagne.excedent)} F au total. Le
            montant est déjà retenu sur les bulletins : il part en comptabilité tel quel.
          </p>
        )}

        {chargement && (
          <p className="trt-reg-vide">
            <CSpinner size="sm" /> Calcul des écritures…
          </p>
        )}

        {!chargement && !ecritures.length && (
          <p className="trt-reg-vide">
            Aucune écriture : rien n&apos;a été prélevé sur cette campagne. Importez le fichier de
            la paie avant de comptabiliser.
          </p>
        )}

        {!chargement && ecritures.length > 0 && (
          <>
            {/* La barre de l'original : chercher une ligne dans la pièce, et
                choisir combien on en voit à la fois. */}
            <div className="rfm-apercu-barre">
              <label className="ddb-recherche-flottante rfm-recherche">
                <span className="ddb-recherche-libelle">Rechercher…</span>
                <input
                  className="ddb-recherche-champ"
                  value={recherche}
                  onChange={(e) => {
                    setRecherche(e.target.value)
                    setPage(1)
                  }}
                />
              </label>
              <label className="rfm-par-page">
                Nombre par page
                <select
                  className="ddb-filtre"
                  value={parPage}
                  onChange={(e) => {
                    setParPage(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  {PAR_PAGE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="rfm-compteur">
                {premier} - {dernier} / {filtrees.length}
              </span>
              <button
                type="button"
                className="rfm-page-bouton"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSure <= 1}
                aria-label="Page précédente"
              >
                <CIcon icon={cilChevronLeft} className="rfm-icone" />
              </button>
              <button
                type="button"
                className="rfm-page-bouton"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={pageSure >= pages}
                aria-label="Page suivante"
              >
                <CIcon icon={cilChevronRight} className="rfm-icone" />
              </button>
            </div>

            <div className="tableau-conteneur trt-reg-tableau rfm-apercu">
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
                  {visibles.map((e, i) => (
                    <CTableRow key={i} className={e.debit ? 'rfm-contrepartie' : undefined}>
                      <CTableDataCell className="trt-reg-mono">{e.codej}</CTableDataCell>
                      <CTableDataCell>{dateFr(e.dateCompta)}</CTableDataCell>
                      <CTableDataCell>{moisDe(e.dateTrait)}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.numpiece}</CTableDataCell>
                      {/* Vides sur une retenue : elle ne naît ni d'un chèque
                          ni d'une facture. L'original les montre quand même. */}
                      <CTableDataCell className="trt-reg-mono">{e.numcheque || ''}</CTableDataCell>
                      <CTableDataCell className="trt-reg-mono">{e.numfactipm || ''}</CTableDataCell>
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
            {/* Le geste de M. Sakho : les deux totaux doivent tomber juste.
                Ils portent la **pièce entière**, jamais la page ni le résultat
                d'une recherche - un total qui bougerait au gré d'un filtre ne
                vérifierait plus rien. */}
            <p className="rfm-apercu-solde">
              Débit: {montantFr(totaux.debit)} - Crédit {montantFr(totaux.credit)} - Solde:{' '}
              {montantFr(totaux.debit - totaux.credit)}
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
            disabled={envoi || !ecritures.length || !equilibre}
            title={
              !ecritures.length
                ? 'Rien à comptabiliser.'
                : equilibre
                  ? 'Poser les écritures au journal RP.'
                  : 'Les deux totaux diffèrent.'
            }
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Valider
          </button>
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

export default ComptabiliserRetenuesModal
