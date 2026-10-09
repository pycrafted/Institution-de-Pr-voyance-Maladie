/**
 * Page d'accueil - le tableau de bord, sur les données réelles.
 *
 * Tant que les agrégats de prestations et de remboursements ne sont pas servis
 * (cf. AGREGATS_DISPONIBLES dans TableauDeBord.jsx), l'accueil résume ce que
 * la base contient déjà : participants et familles, sociétés, prestataires, et
 * les documents émis - bons de pharmacie, lettres de garantie, LG
 * hospitalisation, bons optique. Aucun chiffre n'est inventé : tout se compte
 * dans les listes servies par l'API.
 *
 * Mise en page d'OpsDigital (TailAdmin) : une rangée de tuiles chiffrées, un
 * histogramme et un anneau, trois classements, puis les derniers documents.
 */

import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { CCard, CCardBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilDescription, cilHospital, cilPeople, cilUser } from '@coreui/icons'

import { messageErreur } from '../../services/erreurs'
import { listerEntrees } from '../../services/referentiels'
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
    teinte: p.rampe[4],
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

const CLES = [
  'participants',
  'beneficiaires',
  'adherents',
  'fournisseurs-de-soins',
  ...DOCUMENTS.map((d) => d.cle),
]

const capitale = (texte) =>
  texte ? texte.charAt(0).toUpperCase() + texte.slice(1).toLowerCase() : ''

const exerciceDe = (document) =>
  String(document.exercice || String(document.date || '').slice(0, 4))

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
// Calculs
// -----------------------------------------------------------------------------

const calculer = (d, exercice) => {
  const actifs = d.participants.filter((x) => x.etat === 'Actif')
  const enAttente = d.participants.filter((x) => x.etat === 'En Attente').length
  const familles = d.beneficiaires.filter((b) => b.actif !== false)
  const prestataires = d['fournisseurs-de-soins'].filter((f) => f.actif !== false)

  // Un document annulé ne compte pas.
  const documents = DOCUMENTS.map((t) => ({
    ...t,
    lignes: d[t.cle].filter((x) => x.actif !== false),
  }))
  const duExercice = documents.map((t) => ({
    ...t,
    lignes: t.lignes.filter((x) => exerciceDe(x) === exercice),
  }))
  const totalDocuments = duExercice.reduce((s, t) => s + t.lignes.length, 0)
  const aTraiter = duExercice.reduce((s, t) => s + t.lignes.filter((x) => !x.traite).length, 0)

  const parMois = duExercice.map((t) => {
    const mois = Array(12).fill(0)
    t.lignes.forEach((x) => {
      const m = Number(String(x.date || '').slice(5, 7))
      if (m) mois[m - 1] += 1
    })
    return mois
  })

  // Population couverte : les participants actifs, puis leurs ayants droit
  // par qualité.
  const population = new Map([['Participants', actifs.length]])
  familles.forEach((b) => {
    const qualite = capitale(b.typeBenef) || 'Autres'
    population.set(qualite, (population.get(qualite) || 0) + 1)
  })

  const parSociete = d.adherents
    .map((a) => ({
      libelle: a.libelle,
      valeur: actifs.filter((x) => x.adherent === a.code).length,
    }))
    .filter((s) => s.valeur > 0)
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, 6)

  const traitement = duExercice.map((t) => ({
    cle: t.cle,
    libelle: t.libelle,
    teinte: t.teinte,
    total: t.lignes.length,
    traites: t.lignes.filter((x) => x.traite).length,
  }))

  const parPrestataire = new Map()
  duExercice.forEach((t) =>
    t.lignes.forEach((x) => {
      const nom = t.prestataire(x)
      if (nom) parPrestataire.set(nom, (parPrestataire.get(nom) || 0) + 1)
    }),
  )
  const topPrestataires = [...parPrestataire]
    .map(([libelle, valeur]) => ({ libelle, valeur }))
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, 6)

  const derniers = documents
    .flatMap((t) => t.lignes.map((x) => ({ ...x, genre: t })))
    .sort(
      (a, b) =>
        String(b.date || '').localeCompare(String(a.date || '')) ||
        String(b.code || '').localeCompare(String(a.code || '')),
    )
    .slice(0, 8)

  return {
    actifs: actifs.length,
    inscrits: d.participants.length,
    enAttente,
    familles: familles.length,
    prestataires: prestataires.length,
    totalDocuments,
    aTraiter,
    parMois,
    population: [...population].map(([libelle, valeur]) => ({ libelle, valeur })),
    parSociete,
    traitement,
    topPrestataires,
    derniers,
  }
}

// -----------------------------------------------------------------------------
// Vue
// -----------------------------------------------------------------------------

const Accueil = () => {
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [exercice, setExercice] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    let actif = true
    Promise.all(CLES.map((cle) => listerEntrees(cle)))
      .then((listes) => {
        if (actif) setDonnees(Object.fromEntries(CLES.map((cle, i) => [cle, listes[i]])))
      })
      .catch((e) => {
        if (actif) setErreur(messageErreur(e))
      })
    return () => {
      actif = false
    }
  }, [])

  const c = useMemo(() => (donnees ? calculer(donnees, exercice) : null), [donnees, exercice])

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
      c && {
        labels: MOIS,
        datasets: DOCUMENTS.map((t, i) => ({
          label: t.libelle,
          data: c.parMois[i],
          backgroundColor: t.teinte,
          hoverBackgroundColor: t.teinte,
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 28,
          stack: 'documents',
        })),
      },
    [c],
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
    () => (c ? c.population.map((_, i) => (i === 0 ? p.accent : p.rampe[(i - 1) % 5])) : []),
    [c],
  )

  const donneesPopulation = useMemo(
    () =>
      c && {
        labels: c.population.map((x) => x.libelle),
        datasets: [
          {
            data: c.population.map((x) => x.valeur),
            backgroundColor: teintesPopulation,
            borderColor: p.surface,
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
    [c, teintesPopulation],
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
      {c && (
        <div className="tdb-entete-filtre">
          <span className="tdb-entete-etiquette">Exercice</span>
          <div className="tdb-segments" role="group" aria-label="Exercice">
            {EXERCICES.map((e) => (
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

  if (!c) {
    return (
      <div className="tdb">
        {entete}
        {erreur ? (
          <section className="tdb-vide">
            <p className="tdb-vide-titre">Le tableau de bord n’a pas pu être chargé</p>
            <p className="tdb-vide-texte">{erreur}</p>
          </section>
        ) : (
          <section className="tdb-chargement">
            <CSpinner size="sm" />
            <span>Chargement du tableau de bord…</span>
          </section>
        )}
      </div>
    )
  }

  const totalPopulation = c.population.reduce((s, x) => s + x.valeur, 0)

  return (
    <div className="tdb">
      {entete}

      {/* ---- Tuiles chiffrées ---------------------------------------------- */}
      <section className="tdb-tuiles" aria-label="Chiffres clés">
        <Tuile
          icone={cilUser}
          valeur={c.actifs}
          libelle="Participants actifs"
          note={c.enAttente ? `${formaterEntier(c.enAttente)} en attente` : null}
          chemin="/participants"
        />
        <Tuile
          icone={cilPeople}
          valeur={c.familles}
          libelle="Bénéficiaires rattachés"
          note={`${formaterEntier(c.inscrits)} participants inscrits`}
          chemin="/participants"
        />
        <Tuile
          icone={cilDescription}
          valeur={c.totalDocuments}
          libelle={`Documents émis en ${exercice}`}
          note={c.aTraiter ? `${formaterEntier(c.aTraiter)} à traiter` : null}
          chemin="/documents/bons-pharmacie"
          accent
        />
        <Tuile
          icone={cilHospital}
          valeur={c.prestataires}
          libelle="Prestataires de soins actifs"
          chemin="/fournisseurs-de-soins"
        />
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
            <Graphique
              key={`mois-${exercice}`}
              type="bar"
              data={donneesMois}
              options={optionsMois}
              hauteur={290}
              aria={`Documents émis par mois et par type, exercice ${exercice}`}
            />
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Population couverte" />
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
                {c.population.map((x, i) => (
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
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Sociétés · Traitement · Prestataires --------------------------- */}
      <div className="tdb-trio">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Participants actifs par société" />
            <Classement lignes={c.parSociete} vide="Aucun participant actif." />
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre={`Documents traités - ${exercice}`} />
            <ul className="tdb-etats">
              {c.traitement.map((t) => (
                <li key={t.cle} className="tdb-etats-item">
                  <span
                    className="tdb-legende-puce tdb-legende-puce-pleine"
                    style={{ backgroundColor: t.teinte }}
                    aria-hidden="true"
                  />
                  <span className="tdb-etats-libelle">{t.libelle}</span>
                  <span className="tdb-etats-valeur">
                    {formaterEntier(t.traites)}
                    <span className="tdb-etats-sur"> / {formaterEntier(t.total)}</span>
                  </span>
                  <Jauge part={t.total ? (t.traites / t.total) * 100 : 0} teinte={p.etats.valide} />
                </li>
              ))}
            </ul>
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre={`Principaux prestataires - ${exercice}`} />
            <Classement lignes={c.topPrestataires} vide="Aucun document sur cet exercice." />
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Derniers documents -------------------------------------------- */}
      <CCard className="tdb-carte">
        <CCardBody className="tdb-carte-corps">
          <EnteteCarte titre="Derniers documents émis" />
          {c.derniers.length ? (
            <div className="tdb-tableau-conteneur">
              <table className="tdb-tableau">
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
                  {c.derniers.map((x) => (
                    <tr key={`${x.genre.cle}-${x.id}`}>
                      <th scope="row" className="tdb-cellule-titre tdb-mono">
                        {x.code}
                      </th>
                      <td>
                        <Link to={x.genre.chemin} className="tdb-lien-discret">
                          {x.genre.court}
                        </Link>
                      </td>
                      <td className="tdb-cellule-douce">{dateFr(x.date)}</td>
                      <td>{x.participant}</td>
                      <td className="tdb-cellule-douce">{x.beneficiaire}</td>
                      <td className="tdb-cellule-douce">{x.genre.prestataire(x)}</td>
                      <td>
                        <span className="tdb-badge">
                          <span
                            className="tdb-badge-point"
                            style={{ backgroundColor: x.traite ? p.etats.valide : p.etats.encours }}
                            aria-hidden="true"
                          />
                          {x.traite ? 'Traité' : 'À traiter'}
                        </span>
                      </td>
                    </tr>
                  ))}
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
