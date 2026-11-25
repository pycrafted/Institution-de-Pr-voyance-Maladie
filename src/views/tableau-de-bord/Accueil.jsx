/**
 * Page d'accueil - le tableau de bord, sur les données réelles.
 *
 * Les chiffres sont **agrégés par le serveur** (cf. backend/apps/tableau_de_bord)
 * et non recomptés dans le navigateur : participants et familles, sociétés,
 * prestataires actifs, et les documents émis (bons de pharmacie, lettres de
 * garantie, LG hospitalisation, bons optique). Trois requêtes indépendantes -
 * tuiles, graphiques, listes - chacune affichée dès qu'elle répond.
 *
 * Mise en page d'OpsDigital (TailAdmin) : une rangée de tuiles chiffrées, un
 * histogramme et un anneau, trois classements, puis les derniers documents.
 */

import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilDescription, cilHospital, cilPeople, cilUser } from '@coreui/icons'


import { messageErreur } from '../../services/erreurs'
import { request } from '../../services/api'
import { EXERCICES, dateFr } from '../documents/commun'
import Graphique from './Graphique'
import { formaterEntier } from './donnees'
import { PALETTE as p, avecAlpha } from './palette'

const POLICE = '"Satoshi", system-ui, -apple-system, "Segoe UI", sans-serif'

/** Les documents émis, dans l'ordre du menu, avec leur teinte de série. */
const DOCUMENTS = [
  {
    cle: 'bons-pharmacie',
    libelle: 'Bons de pharmacie',
    court: 'Bon de pharmacie',
    chemin: '/documents/bons-pharmacie',
    teinte: p.accent,
    prestataire: (d) => d.pharmacie,
  },
  {
    cle: 'lettres-garantie',
    libelle: 'Lettres de garantie',
    court: 'Lettre de garantie',
    chemin: '/documents/lettres-garantie',
    // Un cran plus clair que le bas de rampe depuis le 2026-11-25 : l'accent,
    // devenu une ardoise sombre, voisine cette série dans le graphique des
    // documents émis, et le presque-noir de la rampe n'en était séparé que
    // par 1,22:1. À 1,75:1, l'écart se voit.
    teinte: p.rampe[3],
    prestataire: (d) => d.prestataire,
  },
  {
    cle: 'lg-hospitalisation',
    libelle: 'LG hospitalisation',
    court: 'LG hospitalisation',
    chemin: '/documents/lg-hospitalisation',
    teinte: p.rampe[2],
    prestataire: (d) => d.prestataire,
  },
  {
    cle: 'bons-optique',
    libelle: 'Bons optique',
    court: 'Bon optique',
    chemin: '/documents/bons-optique',
    teinte: p.rampe[0],
    prestataire: (d) => d.fournisseur,
  },
]

const MOIS = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
]

/**
 * L'exercice ouvert par défaut : l'année en cours (2026). Le sélecteur propose
 * les exercices d'`EXERCICES` (l'année courante seule depuis la remise à neuf),
 * comme les écrans de documents et de factures - le serveur agrège n'importe
 * quelle année sans la charger.
 *
 * Suit l'horloge : en 2027 l'accueil s'ouvrira tout seul sur 2027.
 */
const EXERCICE_AFFICHE = String(new Date().getFullYear())
const EXERCICES_AFFICHES = EXERCICES

// -----------------------------------------------------------------------------
// Fragments
// -----------------------------------------------------------------------------

const EnteteCarte = ({ titre, action }) => (
  <header className="tdb-carte-entete">
    <h2 className="tdb-carte-titre">{titre}</h2>
    {action}
  </header>
)

EnteteCarte.propTypes = { titre: PropTypes.string.isRequired, action: PropTypes.node }

/** Placeholder qui respire, le temps qu'un bloc reçoive ses données. */
const Squelette = ({ hauteur = 120 }) => (
  <div className="tdb-squelette" style={{ height: hauteur }} aria-hidden="true" />
)
Squelette.propTypes = { hauteur: PropTypes.number }

/** Tuile chiffrée, comme les cartes de statistiques d'OpsDigital. */
const Tuile = ({ icone, valeur, libelle, note, chemin, accent = false }) => (
  <Link to={chemin} className={`tdb-tuile${accent ? ' tdb-tuile-accent' : ''}`}>
    <span className="tdb-tuile-icone">
      <CIcon icon={icone} />
    </span>
    <div className="tdb-tuile-bas">
      <div>
        <p className="tdb-tuile-valeur">{formaterEntier(valeur)}</p>
        <span className="tdb-tuile-libelle">{libelle}</span>
      </div>
      {note && <span className="tdb-tuile-note">{note}</span>}
    </div>
  </Link>
)

Tuile.propTypes = {
  icone: PropTypes.oneOfType([PropTypes.string, PropTypes.array]).isRequired,
  valeur: PropTypes.number.isRequired,
  libelle: PropTypes.string.isRequired,
  note: PropTypes.string,
  chemin: PropTypes.string.isRequired,
  accent: PropTypes.bool,
}

const Jauge = ({ part, teinte = p.neutre }) => (
  <span
    className="tdb-jauge"
    style={{ backgroundColor: avecAlpha(teinte, 0.14) }}
    aria-hidden="true"
  >
    <span
      className="tdb-jauge-part"
      style={{ width: `${Math.max(0, Math.min(100, part))}%`, backgroundColor: teinte }}
    />
  </span>
)

Jauge.propTypes = { part: PropTypes.number.isRequired, teinte: PropTypes.string }

/** Classement : un intitulé, une valeur, une jauge relative au premier. */
const Classement = ({ lignes, vide }) =>
  lignes.length ? (
    <ol className="tdb-classement">
      {lignes.map((l) => (
        <li key={l.libelle} className="tdb-classement-item">
          <div className="tdb-classement-ligne">
            <span className="tdb-classement-libelle">{l.libelle}</span>
            <span className="tdb-classement-valeur">{formaterEntier(l.valeur)}</span>
          </div>
          <Jauge part={(l.valeur / lignes[0].valeur) * 100} />
        </li>
      ))}
    </ol>
  ) : (
    <p className="tdb-carte-vide">{vide}</p>
  )

Classement.propTypes = {
  lignes: PropTypes.arrayOf(
    PropTypes.shape({ libelle: PropTypes.string, valeur: PropTypes.number }),
  ).isRequired,
  vide: PropTypes.string.isRequired,
}


// -----------------------------------------------------------------------------
// Vue
// -----------------------------------------------------------------------------

const Accueil = () => {
  // Trois blocs indépendants : les tuiles (compteurs), les graphiques et les
  // listes. Chacun a sa requête et s'affiche dès que SA réponse arrive, sans
  // attendre les autres. Les agrégats sont calculés par le serveur - des
  // chiffres, pas des listes brutes à recompter dans le navigateur.
  const [tuiles, setTuiles] = useState(null)
  const [graphiques, setGraphiques] = useState(null)
  const [listes, setListes] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [exercice, setExercice] = useState(EXERCICE_AFFICHE)

  useEffect(() => {
    let actif = true
    setTuiles(null)
    setGraphiques(null)
    setListes(null)
    setErreur(null)
    const q = `?exercice=${encodeURIComponent(exercice)}`
    const charger = (chemin, poser) =>
      request(`/tableau-de-bord/${chemin}/${q}`)
        .then((d) => actif && poser(d))
        .catch((e) => actif && setErreur(messageErreur(e)))
    charger('tuiles', setTuiles)
    charger('graphiques', setGraphiques)
    charger('listes', setListes)
    return () => {
      actif = false
    }
  }, [exercice])

  // --- Base commune des options de graphique ---------------------------------
  const socle = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      font: { family: POLICE },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.infobulle.fond,
          titleColor: p.infobulle.titre,
          bodyColor: p.infobulle.corps,
          borderWidth: 0,
          cornerRadius: 8,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          titleFont: { family: POLICE, size: 12, weight: '600' },
          bodyFont: { family: POLICE, size: 12 },
        },
      },
    }),
    [],
  )

  const donneesMois = useMemo(
    () =>
      graphiques && {
        labels: MOIS,
        datasets: DOCUMENTS.map((t, i) => ({
          label: t.libelle,
          data: graphiques.parMois[i]?.mois || [],
          backgroundColor: t.teinte,
          hoverBackgroundColor: t.teinte,
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 28,
          stack: 'documents',
        })),
      },
    [graphiques],
  )

  const optionsMois = useMemo(
    () => ({
      ...socle,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { color: p.axe },
          ticks: { color: p.encreMuette, font: { family: POLICE, size: 11 }, padding: 8 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: p.grille, drawTicks: false },
          border: { display: false },
          ticks: {
            color: p.encreMuette,
            font: { family: POLICE, size: 11 },
            padding: 10,
            precision: 0,
          },
        },
      },
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: { label: (x) => ` ${x.dataset.label} : ${formaterEntier(x.parsed.y)}` },
        },
      },
    }),
    [socle],
  )

  const teintesPopulation = useMemo(
    () =>
      graphiques ? graphiques.population.map((_, i) => (i === 0 ? p.accent : p.rampe[(i - 1) % 5])) : [],
    [graphiques],
  )

  const donneesPopulation = useMemo(
    () =>
      graphiques && {
        labels: graphiques.population.map((x) => x.libelle),
        datasets: [
          {
            data: graphiques.population.map((x) => x.valeur),
            backgroundColor: teintesPopulation,
            borderColor: p.surface,
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
    [graphiques, teintesPopulation],
  )

  const optionsPopulation = useMemo(
    () => ({
      ...socle,
      cutout: '70%',
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: { label: (x) => ` ${x.label} : ${formaterEntier(x.parsed)}` },
        },
      },
    }),
    [socle],
  )

  const entete = (
    <header className="tdb-entete">
      <h1 className="tdb-titre">Tableau de bord</h1>
      {EXERCICES_AFFICHES.length > 0 && (
        <div className="tdb-entete-filtre">
          <span className="tdb-entete-etiquette">Exercice</span>
          <div className="tdb-segments" role="group" aria-label="Exercice">
            {EXERCICES_AFFICHES.map((e) => (
              <button
                type="button"
                key={e.valeur}
                className={`tdb-segment${e.valeur === exercice ? ' tdb-segment-actif' : ''}`}
                aria-pressed={e.valeur === exercice}
                onClick={() => setExercice(e.valeur)}
              >
                {e.libelle}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )

  // La page (coquille + filtre) s'affiche tout de suite ; chaque bloc montre un
  // squelette tant que sa réponse n'est pas là. On ne bascule en plein écran
  // que si une requête échoue vraiment (rien à montrer).
  if (erreur && !tuiles && !graphiques && !listes) {
    return (
      <div className="tdb">
        {entete}
        <section className="tdb-vide">
          <p className="tdb-vide-titre">Le tableau de bord n’a pas pu être chargé</p>
          <p className="tdb-vide-texte">{erreur}</p>
        </section>
      </div>
    )
  }

  const totalPopulation = graphiques ? graphiques.population.reduce((s, x) => s + x.valeur, 0) : 0

  return (
    <div className="tdb">
      {entete}

      {/* ---- Tuiles chiffrées ---------------------------------------------- */}
      <section className="tdb-tuiles" aria-label="Chiffres clés">
        {tuiles ? (
          <>
            <Tuile
              icone={cilUser}
              valeur={tuiles.actifs}
              libelle="Participants actifs"
              note={tuiles.enAttente ? `${formaterEntier(tuiles.enAttente)} en attente` : null}
              chemin="/participants"
            />
            <Tuile
              icone={cilPeople}
              valeur={tuiles.familles}
              libelle="Bénéficiaires rattachés"
              note={`${formaterEntier(tuiles.inscrits)} participants inscrits`}
              chemin="/participants"
            />
            <Tuile
              icone={cilDescription}
              valeur={tuiles.totalDocuments}
              libelle={`Documents émis en ${exercice}`}
              note={tuiles.aTraiter ? `${formaterEntier(tuiles.aTraiter)} à traiter` : null}
              chemin="/documents/bons-pharmacie"
              accent
            />
            <Tuile
              icone={cilHospital}
              valeur={tuiles.prestataires}
              libelle="Prestataires de soins actifs"
              chemin="/fournisseurs-de-soins"
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Squelette key={i} hauteur={96} />)
        )}
      </section>

      {/* ---- Activité · Population ----------------------------------------- */}
      <div className="tdb-duo tdb-duo-large">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre={`Documents émis par mois - ${exercice}`} />
            <ul className="tdb-legende">
              {DOCUMENTS.map((t) => (
                <li key={t.cle} className="tdb-legende-item">
                  <span
                    className="tdb-legende-puce tdb-legende-puce-pleine"
                    style={{ backgroundColor: t.teinte }}
                    aria-hidden="true"
                  />
                  {t.libelle}
                </li>
              ))}
            </ul>
            {graphiques ? (
              <Graphique
                key={`mois-${exercice}`}
                type="bar"
                data={donneesMois}
                options={optionsMois}
                hauteur={290}
                aria={`Documents émis par mois et par type, exercice ${exercice}`}
              />
            ) : (
              <Squelette hauteur={290} />
            )}
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Population couverte" />
            {!graphiques ? (
              <Squelette hauteur={200} />
            ) : (
            <div className="tdb-anneau">
              <div className="tdb-anneau-centre">
                <Graphique
                  type="doughnut"
                  data={donneesPopulation}
                  options={optionsPopulation}
                  hauteur={178}
                  aria="Participants actifs et ayants droit, par qualité"
                />
                <span className="tdb-anneau-total">
                  <strong>{formaterEntier(totalPopulation)}</strong>
                  personnes
                </span>
              </div>
              <ul className="tdb-releve">
                {graphiques.population.map((x, i) => (
                  <li key={x.libelle} className="tdb-releve-item">
                    <span
                      className="tdb-legende-puce tdb-legende-puce-pleine"
                      style={{ backgroundColor: teintesPopulation[i] }}
                      aria-hidden="true"
                    />
                    <span className="tdb-releve-libelle">{x.libelle}</span>
                    <span className="tdb-releve-valeur">{formaterEntier(x.valeur)}</span>
                  </li>
                ))}
              </ul>
            </div>
            )}
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Sociétés · Traitement · Prestataires --------------------------- */}
      <div className="tdb-trio">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Participants actifs par société" />
            {graphiques ? (
              <Classement lignes={graphiques.parSociete} vide="Aucun participant actif." />
            ) : (
              <Squelette hauteur={160} />
            )}
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre={`Documents traités - ${exercice}`} />
            {listes ? (
              <ul className="tdb-etats">
                {listes.traitement.map((t) => {
                  const genre = DOCUMENTS.find((d) => d.cle === t.cle)
                  return (
                    <li key={t.cle} className="tdb-etats-item">
                      <span
                        className="tdb-legende-puce tdb-legende-puce-pleine"
                        style={{ backgroundColor: genre?.teinte }}
                        aria-hidden="true"
                      />
                      <span className="tdb-etats-libelle">{t.libelle}</span>
                      <span className="tdb-etats-valeur">
                        {formaterEntier(t.traites)}
                        <span className="tdb-etats-sur"> / {formaterEntier(t.total)}</span>
                      </span>
                      <Jauge
                        part={t.total ? (t.traites / t.total) * 100 : 0}
                        teinte={p.etats.valide}
                      />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Squelette hauteur={160} />
            )}
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre={`Principaux prestataires - ${exercice}`} />
            {listes ? (
              <Classement lignes={listes.topPrestataires} vide="Aucun document sur cet exercice." />
            ) : (
              <Squelette hauteur={160} />
            )}
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Derniers documents -------------------------------------------- */}
      <CCard className="tdb-carte">
        <CCardBody className="tdb-carte-corps">
          <EnteteCarte titre="Derniers documents émis" />
          {!listes ? (
            <Squelette hauteur={220} />
          ) : listes.derniers.length ? (
            <div className="tableau-conteneur tdb-tableau-conteneur">
              <table className="tableau tdb-tableau">
                <thead>
                  <tr>
                    <th scope="col">Numéro</th>
                    <th scope="col">Document</th>
                    <th scope="col">Date</th>
                    <th scope="col">Participant</th>
                    <th scope="col">Bénéficiaire</th>
                    <th scope="col">Prestataire</th>
                    <th scope="col">État</th>
                  </tr>
                </thead>
                <tbody>
                  {listes.derniers.map((x) => {
                    const genre = DOCUMENTS.find((d) => d.cle === x.cle)
                    return (
                      <tr key={`${x.cle}-${x.code}`}>
                        <th scope="row" className="tdb-cellule-titre tdb-mono">
                          {x.code}
                        </th>
                        <td>
                          <Link to={genre?.chemin || '#'} className="tdb-lien-discret">
                            {x.court}
                          </Link>
                        </td>
                        <td className="tdb-cellule-douce">{dateFr(x.date)}</td>
                        <td>{x.participant}</td>
                        <td className="tdb-cellule-douce">{x.beneficiaire}</td>
                        <td className="tdb-cellule-douce">{x.prestataire}</td>
                        <td>
                          <span className="tdb-badge">
                            <span
                              className="tdb-badge-point"
                              style={{
                                backgroundColor: x.traite ? p.etats.valide : p.etats.encours,
                              }}
                              aria-hidden="true"
                            />
                            {x.traite ? 'Traité' : 'À traiter'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="tdb-carte-vide">Aucun document émis pour l’instant.</p>
          )}
        </CCardBody>
      </CCard>
    </div>
  )
}

export default Accueil
