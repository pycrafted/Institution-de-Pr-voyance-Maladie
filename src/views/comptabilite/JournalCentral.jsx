/**
 * Page « Journal Central » - menu Comptabilité.
 *
 * Le grand livre à l'écran. Reprise de l'écran de LAMPS (captures 70 à 72) :
 * quatre filtres - Société, Exercice, Mois, Journal -, une recherche, le
 * bandeau de contrôle « Débit / Crédit / Solde » et les treize colonnes des
 * écritures.
 *
 * Trois choses la distinguent de tous les autres écrans de l'application, et
 * elles tiennent toutes à la volumétrie (396 873 écritures reprises de LAMPS) :
 *
 * 1. Elle ne passe **pas** par <Referentiel />. Ce composant sait créer,
 *    modifier, désactiver, importer - et rien de cela n'a de sens ici : dans
 *    LAMPS, on ne saisit pas d'écriture au Journal Central, c'est l'écran
 *    « Saisie Journal » qui le fait. C'est la première page de l'application
 *    qui soit une pure consultation.
 * 2. **Tout se filtre et se pagine côté serveur.** Ailleurs, la liste descend
 *    en entier et le navigateur trie ; ici, janvier 2022 compte à lui seul
 *    37 140 écritures (dont 34 082 de report à nouveau).
 * 3. **Le bandeau n'est pas la somme des lignes affichées.** C'est une
 *    agrégation serveur sur toute la période filtrée. Un solde calculé sur
 *    les 50 lignes de la page tomberait à zéro par hasard - ce serait pire
 *    que pas de bandeau du tout.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import BoutonExport from '../../components/BoutonExport'
import { CCard, CCardBody } from '@coreui/react'

import GestionJournal from './GestionJournal'

import { request } from '../../services/api'
import { listerEntrees } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import '../donnees-de-base/donnees-de-base.scss'
import './journal-central.scss'

/** Montant à la française, avec l'espace des milliers. */
const montant = (valeur) =>
  valeur === null || valeur === undefined ? '' : Number(valeur).toLocaleString('fr-FR')

/**
 * Dans le tableau, une case à zéro reste **vide**.
 *
 * Une écriture porte un débit OU un crédit, jamais les deux : écrire « 0 »
 * dans l'autre colonne double le bruit sans rien apprendre, et c'est ce que
 * fait l'original - ses cellules inutilisées sont blanches.
 */
const montantCellule = (valeur) => (Number(valeur) === 0 ? '' : montant(valeur))

/** « 22/09/20 » : le format court de LAMPS, année sur deux chiffres. */
const dateCourte = (iso) => {
  if (!iso) return ''
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a.slice(2)}`
}

/** « oct.-2019 » : la colonne « Mois trait. » montre un mois, pas une date. */
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
const moisAbrege = (iso) => {
  if (!iso) return ''
  const [a, m] = iso.split('-')
  return `${ABREGES[Number(m) - 1]}-${a}`
}

const MOIS_COMPLETS = [
  'JANVIER',
  'FÉVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOÛT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DÉCEMBRE',
]

const COLONNES = [
  { cle: 'cJl', libelle: 'C.JL', largeur: '70px' },
  { cle: 'dCompta', libelle: 'D. Compta', largeur: '95px', rendu: (e) => dateCourte(e.dCompta) },
  {
    cle: 'moisTrait',
    libelle: 'Mois trait.',
    largeur: '100px',
    rendu: (e) => moisAbrege(e.moisTrait),
  },
  { cle: 'numPiece', libelle: 'N° pièce', largeur: '100px' },
  { cle: 'numCheque', libelle: 'N° Chèque', largeur: '100px' },
  { cle: 'numFactIpm', libelle: 'N° F. IPM', largeur: '95px' },
  { cle: 'compteGen', libelle: 'Cpte. Gen.', largeur: '95px', classe: 'jc-compte' },
  { cle: 'compteTiers', libelle: 'Cpte. Tiers', largeur: '110px' },
  { cle: 'matricule', libelle: 'Matricule', largeur: '95px', classe: 'jc-matricule' },
  { cle: 'libelle', libelle: 'Libellé', largeur: 'auto' },
  { cle: 'codeSoc', libelle: 'Code soc.', largeur: '85px' },
  {
    cle: 'debit',
    libelle: 'Débit',
    largeur: '110px',
    aligne: true,
    rendu: (e) => montantCellule(e.debit),
  },
  {
    cle: 'credit',
    libelle: 'Crédit',
    largeur: '110px',
    aligne: true,
    rendu: (e) => montantCellule(e.credit),
  },
]

const TAILLES = [25, 50, 100, 200]

const JournalCentral = () => {
  const annee = new Date().getFullYear()
  const [societe, setSociete] = useState('')
  const [exercice, setExercice] = useState(String(annee))
  const [mois, setMois] = useState('')
  const [journal, setJournal] = useState('ALL')
  const [recherche, setRecherche] = useState('')
  // La recherche part au serveur : on attend que la frappe se calme plutôt que
  // d'interroger 400 000 lignes à chaque caractère.
  const [termeDiffere, setTermeDiffere] = useState('')
  const [taille, setTaille] = useState(50)
  const [page, setPage] = useState(1)

  const [ecritures, setEcritures] = useState([])
  const [totaux, setTotaux] = useState(null)
  const [nombre, setNombre] = useState(0)
  const [pages, setPages] = useState(1)
  const [chargement, setChargement] = useState(true)

  const [adherents, setAdherents] = useState([])
  const [journaux, setJournaux] = useState([])
  const [exercices, setExercices] = useState([annee])

  // Le mois comptable ouvert (table `params` de LAMPS), qui donne le
  // « (ouvert) » de l'en-tête et ce que clôture le menu Gestion. S'il reste
  // null - serveur plus ancien, table pas encore migrée -, l'en-tête se tait
  // au lieu d'affirmer un état qu'il ne connaît pas.
  const [periode, setPeriode] = useState(null)

  const chargerPeriode = useCallback(async () => {
    try {
      setPeriode(await request('/mois-comptable/'))
    } catch {
      setPeriode(null)
    }
  }, [])

  useEffect(() => {
    // L'état n'est posé qu'après la réponse du serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerPeriode()
  }, [chargerPeriode])

  useEffect(() => {
    const minuteur = setTimeout(() => {
      setTermeDiffere(recherche)
      setPage(1)
    }, 400)
    return () => clearTimeout(minuteur)
  }, [recherche])

  // Les deux référentiels des sélecteurs, et les exercices qui portent
  // réellement des écritures. Chargés une fois.
  useEffect(() => {
    let vivant = true
    const charger = async () => {
      try {
        const [societes, listeJournaux, listeExercices] = await Promise.all([
          listerEntrees('adherents'),
          listerEntrees('journaux-comptables'),
          request('/journal-central/exercices/'),
        ])
        if (!vivant) return
        setAdherents(societes.filter((a) => a.actif !== false))
        setJournaux(listeJournaux)
        setExercices(listeExercices)
      } catch (e) {
        if (vivant) toast.error(`Chargement des listes impossible : ${messageErreur(e)}`)
      }
    }
    charger()
    return () => {
      vivant = false
    }
  }, [])

  const parametres = useMemo(
    () => ({
      exercice,
      mois,
      societe,
      journal,
      recherche: termeDiffere,
    }),
    [exercice, mois, societe, journal, termeDiffere],
  )

  const charger = useCallback(
    async ({ silencieux = false } = {}) => {
      const requete = new URLSearchParams(
        Object.entries(parametres).filter(([, v]) => v !== '' && v !== undefined),
      )
      try {
        if (!silencieux) setChargement(true)
        // Les totaux portent sur TOUTE la période, la liste sur une page :
        // deux appels, volontairement distincts.
        const requeteListe = new URLSearchParams(requete)
        requeteListe.set('page', String(page))
        requeteListe.set('taille', String(taille))
        const [liste, bandeau] = await Promise.all([
          request(`/journal-central/?${requeteListe}`),
          request(`/journal-central/totaux/?${requete}`),
        ])
        setEcritures(liste.resultats)
        setNombre(liste.nombre)
        setPages(liste.pages)
        setTotaux(bandeau)
      } catch (e) {
        toast.error(`Chargement impossible : ${messageErreur(e)}`)
      } finally {
        setChargement(false)
      }
    },
    [parametres, page, taille],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  // Changer un filtre ramène à la première page : rester page 7 d'un périmètre
  // qui n'en compte plus que 2 afficherait un tableau vide sans explication.
  const changerFiltre = (poser) => (valeur) => {
    poser(valeur)
    setPage(1)
  }

  const libelleMois = mois ? MOIS_COMPLETS[Number(mois) - 1] : null
  // « (ouvert) » ne s'affiche que sur le mois que la comptabilité a réellement
  // ouvert, pas sur n'importe quel mois consulté.
  const moisOuvert =
    !!periode?.ouvert &&
    Number(periode.mois) === Number(mois) &&
    Number(periode.annee) === Number(exercice)
  const libelleJournal =
    journal === 'ALL'
      ? 'Tous les journaux'
      : `${journal} - ${journaux.find((j) => j.code === journal)?.libelle || ''}`

  const exporter = () => {
    const entetes = COLONNES.map((c) => c.libelle).join(';')
    const lignes = ecritures.map((e) =>
      COLONNES.map((c) => (c.rendu ? c.rendu(e) : (e[c.cle] ?? ''))).join(';'),
    )
    const blob = new Blob([`﻿${[entetes, ...lignes].join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = `journal-central-${exercice}${mois ? `-${mois}` : ''}.csv`
    lien.click()
    URL.revokeObjectURL(lien.href)
  }

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu jc-page">
          <header className="jc-entete">
            <div className="jc-titre-bloc">
              <h2 className="jc-titre">Journal Central</h2>
              <p className="jc-rappel">
                Exercice {exercice} - {libelleJournal}
              </p>
              {/* La période regardée, et « (ouvert) » quand c'est elle que la
                  comptabilité a ouverte - l'état vient de `/mois-comptable/`,
                  l'équivalent de la table `params` de LAMPS. Le mot ne
                  s'affiche que si le serveur l'a dit : l'annoncer sans le
                  savoir serait une invention. La ligne disparaît sur « Tous
                  les mois » - « Mois Comptable : exercice 2019 » n'aurait
                  aucun sens. */}
              {libelleMois && (
                <p className="jc-periode">
                  Mois Comptable: {libelleMois} {exercice}
                  {moisOuvert && <span className="jc-periode-ouvert"> (ouvert)</span>}
                </p>
              )}
              <label className="ddb-recherche-flottante jc-recherche">
                <span className="ddb-recherche-libelle">Rechercher…</span>
                <input
                  className="ddb-recherche-champ"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </label>
            </div>

            <div className="jc-outils">
              <div className="jc-filtres">
                <label className="jc-filtre-groupe">
                  <span className="jc-filtre-etiquette">Société</span>
                  <select
                    className="ddb-filtre"
                    value={societe}
                    onChange={(e) => changerFiltre(setSociete)(e.target.value)}
                  >
                    <option value="">Toutes les sociétés</option>
                    {adherents.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.libelle}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="jc-filtre-groupe jc-etroit">
                  <span className="jc-filtre-etiquette">Exercice</span>
                  <select
                    className="ddb-filtre"
                    value={exercice}
                    onChange={(e) => changerFiltre(setExercice)(e.target.value)}
                  >
                    {exercices.map((an) => (
                      <option key={an} value={an}>
                        {an}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="jc-filtre-groupe">
                  <span className="jc-filtre-etiquette">Mois</span>
                  <select
                    className="ddb-filtre"
                    value={mois}
                    onChange={(e) => changerFiltre(setMois)(e.target.value)}
                  >
                    <option value="">Tous les mois</option>
                    {MOIS_COMPLETS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m.charAt(0) + m.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="jc-filtre-groupe jc-large">
                  <span className="jc-filtre-etiquette">Journal</span>
                  <select
                    className="ddb-filtre"
                    value={journal}
                    onChange={(e) => changerFiltre(setJournal)(e.target.value)}
                  >
                    <option value="ALL">ALL - Tous les journaux</option>
                    {journaux.map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.code} - {j.libelle}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="jc-boutons">
                <BoutonExport onClick={exporter} />
                {/* « Gestion » : les deux opérations de clôture de LAMPS. Elles
                    n'ont pas d'écran à elles - c'est ici qu'elles vivent, et
                    nulle part ailleurs (capture 72). */}
                <GestionJournal
                  periode={periode}
                  onPeriode={chargerPeriode}
                  onReportGenere={charger}
                />
                {/* Pas de bouton « Actualiser » : la liste et le bandeau de
                    contrôle se rechargent d'eux-mêmes à chaque changement de
                    filtre, de recherche ou de page. */}
              </div>
            </div>
          </header>

          {/* Le bandeau de contrôle : la première chose que lit un comptable. */}
          <div className={`jc-bandeau${totaux && totaux.solde === 0 ? ' jc-equilibre' : ''}`}>
            <span>
              Débit: <strong>{montant(totaux?.debit ?? 0)}</strong>
            </span>
            <span className="jc-separateur">-</span>
            <span>
              Crédit <strong>{montant(totaux?.credit ?? 0)}</strong>
            </span>
            <span className="jc-separateur">-</span>
            <span className="jc-solde">
              Solde: <strong>{montant(totaux?.solde ?? 0)}</strong>
            </span>
            <span className="jc-compte-lignes">
              {nombre.toLocaleString('fr-FR')} écriture{nombre > 1 ? 's' : ''}
            </span>
          </div>

          <div className="ddb-tableau-conteneur jc-tableau-conteneur">
            <table className="ddb-tableau tableau-dense jc-tableau">
              <thead>
                <tr>
                  {COLONNES.map((c) => (
                    <th
                      key={c.cle}
                      style={c.largeur === 'auto' ? undefined : { width: c.largeur }}
                      className={c.aligne ? 'jc-droite' : undefined}
                    >
                      {c.libelle}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chargement && (
                  <tr>
                    <td colSpan={COLONNES.length} className="jc-vide">
                      Chargement…
                    </td>
                  </tr>
                )}
                {!chargement && ecritures.length === 0 && (
                  <tr>
                    <td colSpan={COLONNES.length} className="jc-vide">
                      Aucune écriture sur cette période.
                    </td>
                  </tr>
                )}
                {!chargement &&
                  ecritures.map((e) => (
                    <tr key={e.id}>
                      {COLONNES.map((c) => {
                        const valeur = c.rendu ? c.rendu(e) : e[c.cle]
                        const negatif = c.aligne && Number(e[c.cle]) < 0
                        return (
                          <td
                            key={c.cle}
                            className={[
                              c.classe,
                              c.aligne ? 'jc-droite' : null,
                              negatif ? 'jc-negatif' : null,
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {valeur || ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <footer className="ddb-pagination jc-pagination">
            <label className="jc-taille">
              Nombre par page
              <select
                className="ddb-filtre"
                value={taille}
                onChange={(e) => {
                  setTaille(Number(e.target.value))
                  setPage(1)
                }}
              >
                {TAILLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <span className="jc-position">
              {nombre === 0
                ? '0 - 0 / 0'
                : `${(page - 1) * taille + 1} - ${Math.min(page * taille, nombre)} / ${nombre.toLocaleString('fr-FR')}`}
            </span>
            <span className="jc-fleches">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                aria-label="Première page"
              >
                |&lt;
              </button>
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                aria-label="Page précédente"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= pages}
                aria-label="Page suivante"
              >
                &gt;
              </button>
              <button
                type="button"
                onClick={() => setPage(pages)}
                disabled={page >= pages}
                aria-label="Dernière page"
              >
                &gt;|
              </button>
            </span>
          </footer>
        </section>
      </CCardBody>
    </CCard>
  )
}

export default JournalCentral
