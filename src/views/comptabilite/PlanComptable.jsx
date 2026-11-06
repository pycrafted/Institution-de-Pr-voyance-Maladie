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

import React, { useCallback, useEffect, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCloudDownload, cilTrash } from '@coreui/icons'

import { request } from '../../services/api'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import '../donnees-de-base/donnees-de-base.scss'
import './plan-comptable.scss'

const TYPES = ['Actifs', 'Autres', 'Charges', 'Passifs', 'Produits']
const TAILLES = [15, 30, 50, 100]
const VIDE = { code: '', libelle: '', typeCompte: 'Autres' }

/**
 * Les comptes rendus VISIBLES sur cet écran - 9 sur les 462 du plan, soit 2 %.
 *
 * Rien n'est retiré de la base : les 462 comptes y restent entiers, les
 * écritures les désignent toujours, les autres écrans les voient. Seule cette
 * page restreint ce qu'elle montre, et elle le fait ici, côté navigateur.
 *
 * Le choix n'est pas arbitraire : ce sont les comptes que l'application écrit
 * réellement, ceux des trois circuits construits - le fournisseur qu'on paie
 * (400xxx), le participant qu'on rembourse (411xxx), la banque qui décaisse
 * (521xxx) et la charge du soin (602xxx).
 *
 * **Pour changer ce qui s'affiche, modifier cette seule liste.** Le type doit
 * correspondre à celui du compte en base, sans quoi il manquera à son segment.
 */
const COMPTES_VISIBLES = [
  { code: '400004', type: 'Autres' }, // OPTIQUE MEDICALE
  { code: '400006', type: 'Autres' }, // PHARMACIES
  { code: '400008', type: 'Autres' }, // CLINIQUES
  { code: '411001', type: 'Autres' }, // PARTICIPANT SAR PERSONNEL MOO
  { code: '411002', type: 'Autres' }, // PARTICIPANT SAR PERSONNEL CADRES
  { code: '521500', type: 'Autres' }, // ECOBANK CMMC
  { code: '521700', type: 'Autres' }, // ECOBANK IPM FONCTIONNEMENT
  { code: '602000', type: 'Charges' }, // VISITE
  { code: '602006', type: 'Charges' }, // PHARMACIE
]
const CODES_VISIBLES = new Set(COMPTES_VISIBLES.map((c) => c.code))
/** Les segments qui ont au moins un compte visible : les autres n'ont plus de sens. */
const TYPES_VISIBLES = TYPES.filter((t) => COMPTES_VISIBLES.some((c) => c.type === t))
/** Le compte d'un segment, pris sur la liste et non sur la base. */
const nombreVisible = (valeur) =>
  valeur === 'tous'
    ? COMPTES_VISIBLES.length
    : COMPTES_VISIBLES.filter((c) => c.type === valeur).length

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
  const [segment, setSegment] = useState(TYPES_VISIBLES[0] || 'tous')
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

  /**
   * On demande le segment entier au serveur (`taille=500`, une seule page) et
   * on garde ce qui est visible, puis on pagine ici.
   *
   * La pagination du serveur ne peut pas servir telle quelle : elle découpe
   * les 462 comptes, pas les 9 retenus - la première page en rendrait un ou
   * deux, les suivantes aucun. C'est le prix d'un filtre posé côté écran, et
   * il est faible : 462 lignes tiennent largement dans une réponse.
   */
  const charger = useCallback(async () => {
    const requete = new URLSearchParams({ type: segment, page: '1', taille: '500' })
    if (termeDiffere) requete.set('recherche', termeDiffere)
    try {
      setChargement(true)
      const liste = await request(`/donnees-de-base/plan-comptable/?${requete}`)
      const visibles = (liste.resultats || []).filter((c) => CODES_VISIBLES.has(c.code))
      const debut = (page - 1) * taille
      setComptes(visibles.slice(debut, debut + taille))
      setNombre(visibles.length)
      setPages(Math.max(1, Math.ceil(visibles.length / taille)))
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

  // Les pastilles comptent les comptes VISIBLES, pas ceux de la base : un
  // segment annoncé « 196 » et qui en montre sept mentirait sur l'écran.
  const nombreDe = (valeur) => nombreVisible(valeur)

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

  const exporter = () => {
    const entetes = 'Niveau;Sous Compte;Compte Gen.;Intitulé;Type;Solde'
    const lignes = comptes.map((c) =>
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

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu pc-page">
          <header className="pc-entete">
            <h2 className="pc-titre">Plan Comptable</h2>

            <div className="pc-barre">
              <div className="pc-segments" role="tablist">
                {[...TYPES_VISIBLES, 'tous'].map((valeur) => {
                  const compte = nombreDe(valeur)
                  return (
                    <button
                      key={valeur}
                      type="button"
                      role="tab"
                      aria-selected={segment === valeur}
                      className={`pc-segment${segment === valeur ? ' pc-segment--actif' : ''}`}
                      onClick={() => {
                        setSegment(valeur)
                        setPage(1)
                      }}
                    >
                      {valeur === 'tous' ? 'Tous' : valeur}
                      {compte !== null && <span className="pc-segment-nombre">{compte}</span>}
                    </button>
                  )
                })}
              </div>

              <button type="button" className="pc-export" onClick={exporter}>
                <CIcon icon={cilCloudDownload} /> Export Excel
              </button>

              <label className="ddb-recherche-flottante pc-recherche">
                <span className="ddb-recherche-libelle">Rechercher…</span>
                <input
                  className="ddb-recherche-champ"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </label>
            </div>
          </header>

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
                <label className="pc-taille">
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
                <span className="pc-position">
                  {nombre === 0
                    ? '0 - 0 / 0'
                    : `${(page - 1) * taille + 1} - ${Math.min(page * taille, nombre)} / ${nombre}`}
                </span>
                <span className="pc-fleches">
                  <button type="button" onClick={() => setPage(1)} disabled={page <= 1}>
                    |&lt;
                  </button>
                  <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                    &lt;
                  </button>
                  <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages}>
                    &gt;
                  </button>
                  <button type="button" onClick={() => setPage(pages)} disabled={page >= pages}>
                    &gt;|
                  </button>
                </span>
              </footer>
            </div>

            {/* --- Le formulaire ------------------------------------------ */}
            <aside className="pc-formulaire">
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

              <div className="pc-boutons">
                <button type="button" className="pc-nouveau" onClick={nouveau}>
                  Nouveau Compte
                </button>
                <button
                  type="button"
                  className="pc-modifier"
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
