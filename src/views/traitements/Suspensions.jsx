/**
 * Page « Traitements → Suspensions » (§19, captures 63-64).
 *
 * Suit les limites de droits d'un participant. Deux onglets :
 *   - Consommation totale : cumul des frais liquidés par participant, par exercice
 *     (le filtrage par plafond annuel viendra - seuil non encore capturé).
 *   - Optique : la périodicité biennale, dérivée des bons optique (un bon tous les
 *     2 ans par bénéficiaire ; « J. restants » négatif = encore suspendu).
 *
 * Vues en lecture seule, servies calculées par le backend (/api/suspensions/…).
 * À compléter après captures : origine du plafond annuel, effet du blocage à la
 * saisie, et la QP. Part de l'optique (disponible seulement à la liquidation).
 *
 * La feuille de styles de « Données de base » est importée ici parce que les vues
 * sont chargées à la demande.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  CCard,
  CCardBody,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { request } from '../../services/api'
import { EXERCICES, actifs, dateFr } from '../documents/commun'
import { exporterExcel } from '../donnees-de-base/excel'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import './traitements.scss'

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')
const societeNom = (code) => actifs('adherents').find((a) => a.code === code)?.libelle || code

// --- Descripteurs de colonnes (affichage + export Excel) --------------------
const COLONNES_OPTIQUE = [
  { nom: 'matricule', libelle: 'Matricule' },
  { nom: 'participant', libelle: 'Participant' },
  { nom: 'beneficiaire', libelle: 'Bénéficiaire' },
  { nom: 'sexe', libelle: 'Sexe' },
  { nom: 'societe', libelle: 'Société' },
  { nom: 'age', libelle: 'Age', aligne: 'droite' },
  { nom: 'numeroBon', libelle: 'N° Bon' },
  { nom: 'dateBon', libelle: 'Date bon', type: 'date' },
  { nom: 'fraisReel', libelle: 'Frais Réel', type: 'number', aligne: 'droite' },
  { nom: 'qpPart', libelle: 'QP. Part', type: 'number', aligne: 'droite' },
  { nom: 'dateProchaine', libelle: 'Date prochaine', type: 'date' },
  { nom: 'joursRestants', libelle: 'J. restants', type: 'number', aligne: 'droite' },
  { nom: 'fournisseur', libelle: 'Fournisseur' },
]

const COLONNES_CONSO = [
  { nom: 'matricule', libelle: 'Matricule' },
  { nom: 'participant', libelle: 'Participant' },
  { nom: 'sexe', libelle: 'Sexe' },
  { nom: 'societe', libelle: 'Société' },
  { nom: 'age', libelle: 'Age', aligne: 'droite' },
  { nom: 'telephone', libelle: 'N° téléphone' },
  { nom: 'consommation', libelle: 'Consommation', type: 'number', aligne: 'droite' },
]

/** Valeur affichée d'une cellule. */
const afficher = (col, ligne) => {
  const v = ligne[col.nom]
  if (col.type === 'date') return dateFr(v)
  if (col.type === 'number') return v === '' || v === null || v === undefined ? '' : montantFr(v)
  return v ?? ''
}

const Tableau = ({ colonnes, lignes, pied, chargement }) => (
  <div className="ddb-tableau-conteneur sus-tableau">
    <CTable responsive className="ddb-tableau align-middle mb-0">
      <CTableHead>
        <CTableRow>
          {colonnes.map((col) => (
            <CTableHeaderCell key={col.nom} className={col.aligne === 'droite' ? 'text-end' : ''}>
              {col.libelle}
            </CTableHeaderCell>
          ))}
        </CTableRow>
      </CTableHead>
      <CTableBody>
        {/* Chargement : lignes-squelette, comme les autres listes (l'en-tête reste). */}
        {chargement &&
          Array.from({ length: 7 }).map((_, i) => (
            <CTableRow key={`sk-${i}`} className="ddb-ligne-squelette" aria-hidden="true">
              {colonnes.map((col) => (
                <CTableDataCell key={col.nom}>
                  <span className="ddb-squelette" />
                </CTableDataCell>
              ))}
            </CTableRow>
          ))}

        {!chargement && lignes.length === 0 && (
          <CTableRow>
            <CTableDataCell colSpan={colonnes.length} className="ddb-etat-vide">
              Aucune suspension.
            </CTableDataCell>
          </CTableRow>
        )}

        {!chargement &&
          lignes.map((ligne, i) => (
            <CTableRow key={ligne.id ?? i}>
              {colonnes.map((col) => {
                const negatif = col.nom === 'joursRestants' && Number(ligne[col.nom]) < 0
                return (
                  <CTableDataCell
                    key={col.nom}
                    className={`${col.aligne === 'droite' ? 'text-end' : ''}${
                      negatif ? ' text-danger fw-semibold' : ''
                    }`}
                  >
                    {afficher(col, ligne)}
                  </CTableDataCell>
                )
              })}
            </CTableRow>
          ))}
      </CTableBody>
    </CTable>
    {!chargement && pied}
  </div>
)

const Suspensions = () => {
  const [onglet, setOnglet] = useState('consommation')
  const [exercice, setExercice] = useState(() => String(new Date().getFullYear()))
  const [recherche, setRecherche] = useState('')
  const [donnees, setDonnees] = useState({ optique: [], consommation: [] })
  const [chargement, setChargement] = useState(true)

  // `silencieux` : rafraîchissement de fond, sans indicateur de chargement ni
  // message d'erreur - il ne doit jamais clignoter ni déranger (cf. l'écoute des
  // référentiels). La recherche en cours n'est pas touchée (filtre côté client).
  const charger = async (quel, ex, silencieux = false) => {
    if (!silencieux) setChargement(true)
    try {
      const chemin =
        quel === 'optique' ? '/suspensions/optique/' : `/suspensions/consommation/?exercice=${ex}`
      const reponse = await request(chemin)
      // Optique : une simple liste. Consommation : { plafond, lignes }.
      let lignes = reponse
      if (quel === 'consommation') {
        lignes = (reponse.lignes || []).map((l) => ({ ...l, societe: societeNom(l.societe) }))
      }
      setDonnees((d) => ({ ...d, [quel]: lignes }))
    } catch (e) {
      if (!silencieux) toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      if (!silencieux) setChargement(false)
    }
  }

  // Charge l'onglet actif (et recharge la consommation quand l'exercice change).
  // Lecture d'une vue calculée au montage / au changement d'onglet : un effet est
  // la voie prévue ; `charger` ne pose son état qu'après la réponse réseau.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger(onglet, exercice)
  }, [onglet, exercice])

  // Mise à jour automatique, comme les autres listes : on réinterroge en fond
  // à un rythme tranquille, et au retour sur l'onglet du navigateur - mais
  // seulement quand la page est visible, pour ne rien coûter en arrière-plan.
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === 'visible') charger(onglet, exercice, true)
    }
    const minuteur = setInterval(rafraichir, 10000)
    document.addEventListener('visibilitychange', rafraichir)
    return () => {
      clearInterval(minuteur)
      document.removeEventListener('visibilitychange', rafraichir)
    }
  }, [onglet, exercice])

  const colonnes = onglet === 'optique' ? COLONNES_OPTIQUE : COLONNES_CONSO
  const toutes = donnees[onglet]

  // Filtre de recherche (côté client).
  const lignes = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (!terme) return toutes
    return toutes.filter((l) =>
      colonnes.some((col) =>
        String(l[col.nom] ?? '')
          .toLowerCase()
          .includes(terme),
      ),
    )
  }, [toutes, recherche, colonnes])

  // Totaux de pied, selon l'onglet.
  const pied = useMemo(() => {
    if (onglet === 'optique') {
      const frais = lignes.reduce((s, l) => s + Number(l.fraisReel || 0), 0)
      const qp = lignes.reduce((s, l) => s + Number(l.qpPart || 0), 0)
      return (
        <div className="sus-total">
          Frais réels : <strong>{montantFr(frais)}</strong> - QP Part. :{' '}
          <strong>{montantFr(qp)}</strong>
        </div>
      )
    }
    const total = lignes.reduce((s, l) => s + Number(l.consommation || 0), 0)
    return (
      <div className="sus-total">
        Total : <strong>{montantFr(total)}</strong>
      </div>
    )
  }, [onglet, lignes])

  const exporter = async () => {
    if (!lignes.length) {
      toast.info('Rien à exporter.')
      return
    }
    try {
      const pseudo = {
        libelle: onglet === 'optique' ? 'Suspensions Optique' : 'Suspensions Consommation totale',
        colonnes,
      }
      await exporterExcel(pseudo, lignes, lignes)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Suspensions</h1>
            </div>
          </div>
          <nav className="prt-onglets" aria-label="Onglets des suspensions">
            {[
              { cle: 'consommation', libelle: 'Consommation totale' },
              { cle: 'optique', libelle: 'Optique' },
            ].map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-onglet${onglet === o.cle ? ' prt-onglet-actif' : ''}`}
                onClick={() => {
                  setOnglet(o.cle)
                  setRecherche('')
                }}
              >
                {o.libelle}
              </button>
            ))}
          </nav>
        </div>

        <section className="ddb-contenu">
          <div className="ddb-barre-outils ddb-barre-soulignee sus-barre">
            {onglet === 'consommation' && (
              <label className="ddb-filtre-groupe">
                <span className="ddb-filtre-etiquette">Exercice</span>
                <select
                  className="ddb-filtre"
                  value={exercice}
                  onChange={(e) => setExercice(e.target.value)}
                >
                  {EXERCICES.map((ex) => (
                    <option key={ex.valeur} value={ex.valeur}>
                      {ex.libelle}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label
              className={`ddb-recherche-flottante sus-recherche${
                recherche ? ' ddb-recherche-remplie' : ''
              }`}
            >
              <span className="ddb-recherche-libelle">Rechercher…</span>
              <input
                className="ddb-recherche-champ"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="sus-barre-actions">
              {/* Pas de bouton « Actualiser » : la liste se rafraîchit toute seule
                  (cf. l'écoute de fond des autres écrans). */}
              <button type="button" className="ddb-outil ddb-outil-export" onClick={exporter}>
                Export Excel
              </button>
            </div>
          </div>

          <Tableau colonnes={colonnes} lignes={lignes} pied={pied} chargement={chargement} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default Suspensions
