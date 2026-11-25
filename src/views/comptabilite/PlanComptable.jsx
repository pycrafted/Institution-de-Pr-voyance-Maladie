/**
 * Page « Plan Comptable Général » - menu Comptabilité (capture 73).
 *
 * Liste à gauche, formulaire à droite : on clique une ligne, elle se charge
 * dans le formulaire ; « Nouveau Compte » le vide, « Modifier » enregistre.
 * Le numéro d'un compte existant n'est pas modifiable - c'est sa clé, et
 * 396 873 écritures le désignent.
 *
 * Deux colonnes que l'original n'a pas, et que nous pouvons calculer :
 *
 * - le **solde réel**, tiré des écritures. LAMPS affiche « Solde du Compte
 *   (0) » pour tout le monde, sa table `plancompta` n'ayant pas de colonne de
 *   solde ;
 * - **qui utilise le compte**. Chez LAMPS, le plan comptable *est* le
 *   référentiel : spécialités, prestations, adhérents et banques n'y sont que
 *   des vues. Chez nous ce sont des tables distinctes, et l'écran dit donc
 *   d'où chaque numéro est cité.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import BoutonExport from '../../components/BoutonExport'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilTrash } from '@coreui/icons'

import { request } from '../../services/api'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import '../donnees-de-base/donnees-de-base.scss'
import './plan-comptable.scss'

const TYPES = ['Actifs', 'Autres', 'Charges', 'Passifs', 'Produits']
const TAILLES = [15, 30, 50, 100]
const VIDE = { code: '', libelle: '', typeCompte: 'Autres' }

const montant = (valeur) => Number(valeur || 0).toLocaleString('fr-FR')

/**
 * Les référentiels qui désignent un compte, chacun nommé UNE fois.
 *
 * Le serveur les renvoie en double - « Spécialité · Fournisseur de soins ·
 * Fournisseur de soins · Fournisseur de soins… » -, un par fiche qui porte le
 * numéro : le compte 400004 est cité par huit opticiens. C'est un défaut de
 * sa requête (un `.distinct()` que l'ordre par défaut du modèle rend
 * inopérant), à corriger côté serveur ; en attendant, l'écran ne répète pas.
 */
const usagesDistincts = (usages) => [...new Set(usages || [])]

const PlanComptable = () => {
  const [segment, setSegment] = useState('tous')
  // Les segments (types de compte), lus au serveur.
  const [segments, setSegments] = useState([{ valeur: 'tous', libelle: 'Tous' }])
  const [recherche, setRecherche] = useState('')
  const [termeDiffere, setTermeDiffere] = useState('')
  const [taille, setTaille] = useState(15)
  const [page, setPage] = useState(1)

  const [comptes, setComptes] = useState([])
  const [nombre, setNombre] = useState(0)
  const [pages, setPages] = useState(1)
  const [chargement, setChargement] = useState(true)

  // La fiche chargée dans le formulaire. `null` = création.
  const [choisi, setChoisi] = useState(null)
  const [saisie, setSaisie] = useState(VIDE)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    const minuteur = setTimeout(() => {
      setTermeDiffere(recherche)
      setPage(1)
    }, 400)
    return () => clearTimeout(minuteur)
  }, [recherche])

  // Les segments et leurs compteurs (par type + « Tous »), une fois.
  //
  // « Tous » passe EN TÊTE, alors que le serveur le rend en dernier et que
  // l'original le place aussi au bout (capture 73). C'est le segment ouvert
  // par défaut et celui sur lequel on revient : le chercher en fin de rangée
  // à chaque fois n'avait pas de sens. L'ordre des autres ne bouge pas.
  useEffect(() => {
    request('/donnees-de-base/plan-comptable/repartition/')
      .then((liste) =>
        setSegments([
          ...liste.filter((s) => s.valeur === 'tous'),
          ...liste.filter((s) => s.valeur !== 'tous'),
        ]),
      )
      .catch(() => {})
  }, [])

  /** Une page du plan comptable, paginée par le serveur (les 462 comptes). */
  const charger = useCallback(async () => {
    const requete = new URLSearchParams({
      type: segment,
      page: String(page),
      taille: String(taille),
    })
    if (termeDiffere) requete.set('recherche', termeDiffere)
    try {
      setChargement(true)
      const liste = await request(`/donnees-de-base/plan-comptable/?${requete}`)
      setComptes(liste.resultats || [])
      setNombre(liste.nombre || 0)
      setPages(liste.pages || 1)
    } catch (e) {
      toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [segment, page, taille, termeDiffere])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  const choisirLigne = (compte) => {
    setChoisi(compte)
    setSaisie({ code: compte.code, libelle: compte.libelle, typeCompte: compte.typeCompte })
    setErreurs({})
  }

  const nouveau = () => {
    setChoisi(null)
    setSaisie(VIDE)
    setErreurs({})
  }

  const enregistrer = async () => {
    setErreurs({})
    setEnvoi(true)
    try {
      if (choisi) {
        await request(`/donnees-de-base/plan-comptable/${choisi.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ libelle: saisie.libelle, typeCompte: saisie.typeCompte }),
        })
        toast.success(`Compte ${choisi.code} modifié.`)
      } else {
        await request('/donnees-de-base/plan-comptable/', {
          method: 'POST',
          body: JSON.stringify(saisie),
        })
        toast.success(`Compte ${saisie.code} créé.`)
        nouveau()
      }
      charger()
    } catch (e) {
      // Les erreurs de champ se posent sous le champ ; le reste part en
      // message (un compte utilisé, par exemple, revient en 409).
      const champs = erreursDeChamps(e)
      if (champs) setErreurs(champs)
      else toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  const retirer = async (compte) => {
    try {
      await request(`/donnees-de-base/plan-comptable/${compte.id}/`, { method: 'DELETE' })
      toast.success(`Compte ${compte.code} désactivé.`)
      if (choisi?.id === compte.id) nouveau()
      charger()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const exporter = async () => {
    // L'export prend tout le segment (recherche comprise), pas seulement la
    // page affichée : une seule requête, le plan tient largement dedans.
    const requete = new URLSearchParams({ type: segment, page: '1', taille: '2000' })
    if (termeDiffere) requete.set('recherche', termeDiffere)
    let aExporter = comptes
    try {
      const liste = await request(`/donnees-de-base/plan-comptable/?${requete}`)
      aExporter = liste.resultats || comptes
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
      return
    }
    const entetes = 'Niveau;Sous Compte;Compte Gen.;Intitulé;Type;Solde'
    const lignes = aExporter.map((c) =>
      [c.niveau, c.sousCompte, c.code, c.libelle, c.typeCompte, c.solde].join(';'),
    )
    const blob = new Blob([`﻿${[entetes, ...lignes].join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = `plan-comptable-${segment.toLowerCase()}.csv`
    lien.click()
    URL.revokeObjectURL(lien.href)
  }

  /** Remet la recherche à zéro ; le segment regardé ne bouge pas. */
  const reinitialiser = () => {
    setRecherche('')
    setPage(1)
  }

  /**
   * Les numéros de page à montrer : une fenêtre de cinq centrée sur la page
   * courante, recalée aux bords. Le plan comptable compte 462 comptes, soit
   * une trentaine de pages à quinze par écran.
   */
  const pagesVisibles = useMemo(() => {
    const largeur = Math.min(5, pages)
    let premier = Math.max(1, page - Math.floor(largeur / 2))
    premier = Math.min(premier, Math.max(1, pages - largeur + 1))
    return Array.from({ length: largeur }, (_, i) => premier + i)
  }, [page, pages])

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu pc-page">
          <header className="pc-chapeau">
            <h2 className="pc-titre">Plan Comptable</h2>
          </header>

          {/* Les familles de comptes, en cartes - même forme que les six
              familles de l'Interrogation de Comptes. Sans effectif : le
              nombre de comptes de la famille ouverte est déjà au pied du
              tableau, et le porter sur chaque carte chargeait la rangée d'une
              dizaine de chiffres qu'on ne lit pas. */}
          <nav className="pc-segments" role="tablist" aria-label="Types de compte">
            {segments.map((s) => (
              <button
                key={s.valeur}
                type="button"
                role="tab"
                aria-selected={segment === s.valeur}
                className={`pc-segment${segment === s.valeur ? ' pc-segment-actif' : ''}`}
                onClick={() => {
                  setSegment(s.valeur)
                  setPage(1)
                }}
              >
                <span className="pc-segment-libelle">{s.libelle}</span>
              </button>
            ))}
          </nav>

          {/* Le panneau de filtres, dans la forme des deux autres écrans de
              Comptabilité. Il ne porte qu'un champ - le plan comptable se
              cherche par numéro ou par intitulé, le type étant déjà choisi
              par les cartes ci-dessus -, mais garder le même contenant évite
              que les trois pages se ressemblent à peu près. */}
          <div className="pc-panneau">
            <div className="pc-panneau-tete">
              <p className="pc-panneau-titre">Filtres</p>
              <button type="button" className="pc-lien" onClick={reinitialiser}>
                Réinitialiser
              </button>
            </div>

            <div className="pc-barre">
              <label className="pc-champ">
                <span className="pc-libelle">Recherche</span>
                <input
                  className="ddb-filtre"
                  placeholder="N° de compte, intitulé…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </label>
            </div>

            <div className="pc-panneau-pied">
              <div className="pc-panneau-actions">
                <BoutonExport onClick={exporter} />
              </div>
            </div>
          </div>

          <div className="pc-corps">
            {/* --- La liste ------------------------------------------------ */}
            <div className="pc-liste">
              <div className="ddb-tableau-conteneur">
                <table className="ddb-tableau tableau-dense pc-tableau">
                  <thead>
                    <tr>
                      <th style={{ width: '90px' }}>Niveau</th>
                      <th style={{ width: '120px' }}>Sous Compte</th>
                      <th style={{ width: '120px' }}>Compte Gen.</th>
                      <th>Intitulé</th>
                      <th style={{ width: '130px' }} className="pc-droite">
                        Solde
                      </th>
                      <th style={{ width: '48px' }} aria-label="Retirer" />
                    </tr>
                  </thead>
                  <tbody>
                    {chargement && (
                      <tr>
                        <td colSpan={6} className="pc-vide">
                          Chargement…
                        </td>
                      </tr>
                    )}
                    {!chargement && comptes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="pc-vide">
                          Aucun compte dans ce segment.
                        </td>
                      </tr>
                    )}
                    {!chargement &&
                      comptes.map((c) => (
                        <tr
                          key={c.id}
                          className={[
                            'pc-ligne',
                            choisi?.id === c.id ? 'pc-ligne--choisie' : '',
                            c.actif === false ? 'pc-ligne--inactive' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => choisirLigne(c)}
                        >
                          <td>{c.niveau}</td>
                          <td>{c.sousCompte}</td>
                          <td className="pc-numero">{c.code}</td>
                          {/* L'intitulé seul, comme l'original. Les référentiels
                              qui désignent le compte restent connus - ils
                              expliquent le refus de la corbeille et la note du
                              formulaire - mais ne s'affichent plus en étiquette
                              au bout de chaque ligne. */}
                          <td>{c.libelle}</td>
                          {/* Un solde à zéro s'écrit « 0 » : la colonne dit
                              alors que le compte existe et ne bouge pas. Ce
                              n'est pas le cas du débit/crédit d'une écriture,
                              où la case inutilisée reste blanche. */}
                          <td className={`pc-droite${c.solde < 0 ? ' pc-negatif' : ''}`}>
                            {montant(c.solde)}
                          </td>
                          <td className="pc-action">
                            <button
                              type="button"
                              className="pc-corbeille"
                              title={
                                usagesDistincts(c.usages).length
                                  ? `Utilisé : ${usagesDistincts(c.usages).join(', ')}`
                                  : 'Désactiver ce compte'
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                retirer(c)
                              }}
                            >
                              <CIcon icon={cilTrash} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <footer className="pc-pagination">
                <div className="pc-pagination-outils">
                  <label className="pc-pagination-taille">
                    Nombre par page :
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

                  <nav className="pc-pages" aria-label="Pagination">
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      disabled={page <= 1}
                      aria-label="Première page"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                      aria-label="Page précédente"
                    >
                      ‹
                    </button>
                    {pagesVisibles.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={p === page ? 'pc-page-active' : undefined}
                        onClick={() => setPage(p)}
                        aria-current={p === page ? 'page' : undefined}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pages}
                      aria-label="Page suivante"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(pages)}
                      disabled={page >= pages}
                      aria-label="Dernière page"
                    >
                      »
                    </button>
                  </nav>
                </div>
              </footer>
            </div>

            {/* --- Le formulaire ------------------------------------------ */}
            <aside className="pc-formulaire">
              {/* Le formulaire porte un titre, comme le panneau de filtres :
                  sans lui, cette colonne était la seule zone de l'écran dont
                  on ne savait pas en la regardant si elle montrait le compte
                  choisi ou en créait un. */}
              <p className="pc-formulaire-titre">
                {choisi ? `Compte ${choisi.code}` : 'Nouveau compte'}
              </p>

              <label className="pc-champ">
                <span className="pc-libelle">
                  Compte Général <em>(minimum 6 caractères)</em>
                </span>
                <input
                  className="pc-saisie"
                  value={saisie.code}
                  // Le numéro est la clé : il ne se modifie pas sur un compte
                  // existant, que les écritures désignent par lui.
                  disabled={Boolean(choisi)}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => setSaisie({ ...saisie, code: e.target.value })}
                />
                {erreurs.code && <span className="pc-erreur">{erreurs.code}</span>}
              </label>

              <label className="pc-champ">
                <span className="pc-libelle">Intitulé de Compte</span>
                <input
                  className="pc-saisie"
                  value={saisie.libelle}
                  onChange={(e) => setSaisie({ ...saisie, libelle: e.target.value })}
                />
                {erreurs.libelle && <span className="pc-erreur">{erreurs.libelle}</span>}
              </label>

              <label className="pc-champ">
                <span className="pc-libelle">
                  Solde du Compte{' '}
                  <em className={choisi && choisi.solde < 0 ? 'pc-negatif' : undefined}>
                    ({montant(choisi?.solde)})
                  </em>
                </span>
                {/* Calculé sur les écritures, jamais saisi. */}
                <input
                  className="pc-saisie pc-saisie--calculee"
                  value={montant(choisi?.solde)}
                  disabled
                />
              </label>

              <label className="pc-champ">
                <span className="pc-libelle">Type de Compte</span>
                <select
                  className="ddb-filtre pc-saisie"
                  value={saisie.typeCompte}
                  onChange={(e) => setSaisie({ ...saisie, typeCompte: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              {usagesDistincts(choisi?.usages).length > 0 && (
                <p className="pc-note">
                  Ce compte est désigné par :{' '}
                  <strong>{usagesDistincts(choisi.usages).join(', ')}</strong>.
                </p>
              )}

              {/* Un seul bouton plein : celui qui écrit. « Nouveau Compte »
                  ne fait que vider le formulaire, il reste secondaire. */}
              <div className="pc-boutons">
                <button type="button" className="pc-btn pc-btn-sec" onClick={nouveau}>
                  Nouveau Compte
                </button>
                <button
                  type="button"
                  className="pc-btn pc-btn-primary"
                  onClick={enregistrer}
                  disabled={envoi || (!choisi && !saisie.code)}
                >
                  {choisi ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </aside>
          </div>
        </section>
      </CCardBody>
    </CCard>
  )
}

export default PlanComptable
