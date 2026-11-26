/**
 * Recherche globale, au centre de la barre du haut.
 *
 * **Le manque qu'elle comble.** Chaque écran a sa recherche, aucune ne
 * traverse l'application : pour retrouver le bon « BPI000002 », il fallait
 * d'abord savoir que c'est un bon de pharmacie, ouvrir cet écran, puis
 * chercher. Un seul champ interroge maintenant les cinq familles -
 * participants et ayants droit, les quatre documents, factures, prestataires
 * (GET /api/recherche/?q=).
 *
 * **Elle n'ouvre pas de fiche, elle oriente.** Chaque résultat mène à l'écran
 * qui sait déjà l'afficher, sa recherche posée dans l'adresse
 * (`?recherche=BPI000002`, lu par <Referentiel />). Rien à maintenir en
 * double le jour où une liste change de colonnes, et on arrive là où l'on
 * peut agir - imprimer, modifier, traiter.
 *
 * Le terme posé dans l'adresse est toujours un **code** ou un **matricule**,
 * jamais un nom : deux personnes peuvent porter le même.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilMagnifyingGlass, cilX } from '@coreui/icons'

import { request } from '../../services/api'

/** En deçà, « a » ramènerait la moitié de la base pour rien (même règle au serveur). */
const LONGUEUR_MINIMALE = 2
/** On n'interroge qu'après une pause de frappe, comme les listes paginées. */
const ATTENTE_MS = 300

const RechercheGlobale = () => {
  const navigate = useNavigate()
  const [terme, setTerme] = useState('')
  const [resultat, setResultat] = useState(null)
  const [ouvert, setOuvert] = useState(false)
  const [survol, setSurvol] = useState(0)
  const zone = useRef(null)
  const champ = useRef(null)

  const propre = terme.trim()
  const assezLong = propre.length >= LONGUEUR_MINIMALE
  // Le résultat en main répond-il à ce qui est écrit MAINTENANT ? Tant que
  // non, on annonce « Recherche… » plutôt que de montrer la réponse à la
  // question d'avant. Déduit, et non gardé dans un état : un drapeau de
  // chargement posé à la main finit toujours par rester allumé un jour où une
  // requête échoue autrement que prévu.
  const aJour = Boolean(resultat) && resultat.q === propre
  const chargement = assezLong && !aJour

  // Les résultats à plat, dans l'ordre affiché : c'est sur cette liste que
  // les flèches du clavier se déplacent, pas sur les groupes. Et le rang de
  // départ de chaque groupe, pour retrouver la position d'un élément sans
  // compteur mutable au milieu du rendu.
  const groupes = aJour ? resultat.groupes : []
  const plats = groupes.flatMap((g) => g.elements)
  const debuts = groupes.reduce(
    (rangs, g) => [...rangs, rangs[rangs.length - 1] + g.elements.length],
    [0],
  )

  // --- Interrogation, après la pause de frappe -------------------------------
  useEffect(() => {
    const demande = terme.trim()
    if (demande.length < LONGUEUR_MINIMALE) return undefined
    let actif = true
    const minuteur = window.setTimeout(async () => {
      try {
        const reponse = await request(`/recherche/?q=${encodeURIComponent(demande)}`)
        if (actif) {
          setResultat(reponse)
          setSurvol(0)
        }
      } catch {
        // Hors ligne ou session close : on ne montre pas de résultats faux.
        // L'écran reste sur « Recherche… », qui est la vérité.
      }
    }, ATTENTE_MS)
    return () => {
      actif = false
      window.clearTimeout(minuteur)
    }
  }, [terme])

  // --- Fermeture : clic ailleurs ---------------------------------------------
  useEffect(() => {
    if (!ouvert) return undefined
    const fermer = (e) => {
      if (zone.current && !zone.current.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [ouvert])

  // --- Ctrl+K (Cmd+K) : le champ prend la main depuis n'importe quel écran ---
  useEffect(() => {
    const raccourci = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        champ.current?.focus()
        champ.current?.select()
      }
    }
    document.addEventListener('keydown', raccourci)
    return () => document.removeEventListener('keydown', raccourci)
  }, [])

  const aller = useCallback(
    (element) => {
      if (!element) return
      setOuvert(false)
      setTerme('')
      setResultat(null)
      champ.current?.blur()
      navigate(element.lien)
    },
    [navigate],
  )

  const auClavier = (e) => {
    if (e.key === 'Escape') {
      setOuvert(false)
      champ.current?.blur()
      return
    }
    if (!plats.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurvol((i) => (i + 1) % plats.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurvol((i) => (i - 1 + plats.length) % plats.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      aller(plats[survol])
    }
  }

  const montrer = ouvert && assezLong

  return (
    <div className="app-recherche" ref={zone}>
      <div className="app-recherche-champ">
        <CIcon icon={cilMagnifyingGlass} className="app-recherche-loupe" />
        <input
          ref={champ}
          type="search"
          className="app-recherche-saisie"
          placeholder="Rechercher un participant, un bon, une facture…"
          aria-label="Recherche globale"
          value={terme}
          onChange={(e) => {
            setTerme(e.target.value)
            setOuvert(true)
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={auClavier}
        />
        {terme ? (
          <button
            type="button"
            className="app-recherche-vider"
            aria-label="Vider la recherche"
            onClick={() => {
              setTerme('')
              setResultat(null)
              champ.current?.focus()
            }}
          >
            <CIcon icon={cilX} />
          </button>
        ) : (
          // Le raccourci s'affiche tant que le champ est vide : il s'apprend
          // en le voyant, et disparaît dès qu'il gênerait la lecture.
          <span className="app-recherche-raccourci" aria-hidden="true">
            Ctrl K
          </span>
        )}
      </div>

      {montrer && (
        <div className="app-recherche-resultats" role="listbox" aria-label="Résultats">
          {chargement && <p className="app-recherche-etat">Recherche…</p>}

          {aJour && !groupes.length && (
            <p className="app-recherche-etat">Aucun résultat pour « {resultat.q} »</p>
          )}

          {groupes.map((groupe, iGroupe) => (
            <div key={groupe.cle} className="app-recherche-groupe">
              <div className="app-recherche-groupe-titre">
                {groupe.titre}
                {/* Le serveur n'en renvoie que cinq : on dit combien il y en
                    a en tout, pour qu'on sache qu'il faut ouvrir l'écran. */}
                {groupe.total > groupe.elements.length && (
                  <span className="app-recherche-groupe-total">{groupe.total} au total</span>
                )}
              </div>
              {groupe.elements.map((element, iElement) => {
                const ici = debuts[iGroupe] + iElement
                return (
                  <button
                    key={`${groupe.cle}-${element.titre}-${ici}`}
                    type="button"
                    role="option"
                    aria-selected={survol === ici}
                    className={`app-recherche-item${survol === ici ? ' app-recherche-item-vise' : ''}`}
                    onMouseEnter={() => setSurvol(ici)}
                    onClick={() => aller(element)}
                  >
                    <span className="app-recherche-item-titre">{element.titre}</span>
                    <span className="app-recherche-item-detail">{element.detail}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default React.memo(RechercheGlobale)
