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
import BoutonExport from '../../components/BoutonExport'
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
import './traitements.scss'
import './suspensions.scss'

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

const Tableau = ({ colonnes, lignes, chargement }) => (
  <div className="sus-tableau-cadre">
    <CTable responsive className="sus-tableau align-middle mb-0">
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
            <CTableDataCell colSpan={colonnes.length} className="sus-vide">
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
                      negatif ? ' sus-negatif' : ''
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

  // Les totaux de la vue, posés dans le bandeau au-dessus du tableau. Ils
  // portent sur les lignes AFFICHÉES, recherche comprise : c'est ce que faisait
  // le pied qu'ils remplacent, et c'est ce qu'on attend d'un total qu'on lit
  // au-dessus de la liste qu'il résume.
  const totaux = useMemo(() => {
    const somme = (champ) => lignes.reduce((s, l) => s + Number(l[champ] || 0), 0)
    return onglet === 'optique'
      ? [
          { cle: 'frais', etiquette: 'Frais réels', valeur: somme('fraisReel') },
          { cle: 'qp', etiquette: 'QP Part.', valeur: somme('qpPart') },
        ]
      : [{ cle: 'total', etiquette: 'Total consommation', valeur: somme('consommation') }]
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
        <section className="ddb-contenu sus-page">
          <header className="sus-chapeau">
            <h2 className="sus-titre">Suspensions</h2>
          </header>

          {/* Les deux vues en cartes : ce sont deux lectures différentes du
              même sujet - les limites de droits -, pas deux filtres d'une même
              liste. Leurs colonnes ne se ressemblent même pas. */}
          <nav className="sus-cartes" aria-label="Onglets des suspensions">
            {[
              { cle: 'consommation', libelle: 'Consommation totale' },
              { cle: 'optique', libelle: 'Optique' },
            ].map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`sus-carte${onglet === o.cle ? ' sus-carte-active' : ''}`}
                aria-current={onglet === o.cle ? 'page' : undefined}
                onClick={() => {
                  setOnglet(o.cle)
                  setRecherche('')
                }}
              >
                <span className="sus-carte-libelle">{o.libelle}</span>
              </button>
            ))}
          </nav>

          <div className="sus-panneau">
            <div className="sus-panneau-tete">
              <p className="sus-panneau-titre">Filtres</p>
            </div>

            <div className="sus-barre">
              {/* L'optique ne dépend pas d'un exercice : sa périodicité est
                  biennale, elle court d'un bon au suivant. */}
              {onglet === 'consommation' && (
                <label className="sus-champ">
                  <span className="sus-etiquette">Exercice</span>
                  <select
                    className="sus-liste"
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
              <label className="sus-champ">
                <span className="sus-etiquette">Recherche</span>
                <input
                  className="sus-saisie"
                  placeholder="Matricule, participant, société…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="sus-panneau-pied">
              <div className="sus-actions">
                {/* Pas de bouton « Actualiser » : la liste se rafraîchit toute
                    seule (cf. l'écoute de fond des autres écrans). */}
                <BoutonExport onClick={exporter} />
              </div>
            </div>
          </div>

          {/* Le bandeau de totaux, collé au tableau comme sur les écrans de
              Comptabilité. Il porte sur les lignes affichées, recherche
              comprise. */}
          <div className="sus-bandeau">
            <p className="sus-note">
              {lignes.length} ligne{lignes.length > 1 ? 's' : ''}
            </p>
            <div className="sus-totaux">
              {totaux.map((t, i) => (
                <React.Fragment key={t.cle}>
                  {i > 0 && <span className="sus-filet" aria-hidden="true" />}
                  <div className="sus-total">
                    <span className="sus-total-etiquette">{t.etiquette}</span>
                    <span className="sus-total-valeur">
                      {montantFr(t.valeur)} <span className="sus-devise">FCFA</span>
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <Tableau colonnes={colonnes} lignes={lignes} chargement={chargement} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default Suspensions
