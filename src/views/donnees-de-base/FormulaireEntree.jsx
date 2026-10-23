/**
 * Panneau de saisie d'une entrée de référentiel.
 *
 * Le même panneau sert à la création et à la modification : cliquer une ligne
 * du tableau l'ouvre pré-rempli.
 *
 * Deux mises en page selon la richesse du référentiel :
 *   - par défaut, les champs s'enchaînent dans l'ordre des colonnes ;
 *   - si le référentiel déclare un `formulaire`, ils se répartissent en
 *     onglets et en sections (fiche fournisseur, adhérent…).
 *
 * Les champs reprennent le style du template : label en petit au-dessus,
 * valeur soulignée d'un trait qui passe au rouge SAR au focus.
 */

import React, { useMemo, useRef, useState } from 'react'
import { COffcanvas, COffcanvasBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCloudUpload, cilPencil, cilPlus, cilTrash, cilUser, cilX } from '@coreui/icons'

import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { listerEntreesSync } from '../../services/referentiels'
import {
  champRequis,
  champVisible,
  optionsDe,
  reporterPropositions,
  texteOption,
} from './optionsChamp'
import SelectRecherche from './SelectRecherche'
import './actes.scss'

/**
 * Forme d'une adresse électronique : de quoi arrêter une faute de frappe avant
 * l'aller-retour au serveur, qui reste seul juge du reste.
 */
const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Côté maximal d'une photo enregistrée, en pixels.
 *
 * Les fiches vivent dans le stockage du navigateur, dont le quota se compte
 * en mégaoctets : une photo d'appareil moderne le remplirait à elle seule.
 * Redimensionnée à 320 px et réencodée en JPEG, une photo d'identité pèse
 * une vingtaine de kilo-octets, ce qui laisse de la place pour des centaines
 * de participants.
 */
const COTE_PHOTO = 320

/** Lit un fichier image, le réduit et le rend en URL de données. */
const reduireImage = (fichier) =>
  new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('Fichier illisible'))
    lecteur.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Ce fichier n’est pas une image'))
      image.onload = () => {
        const echelle = Math.min(1, COTE_PHOTO / Math.max(image.width, image.height))
        const canevas = document.createElement('canvas')
        canevas.width = Math.round(image.width * echelle)
        canevas.height = Math.round(image.height * echelle)
        canevas.getContext('2d').drawImage(image, 0, 0, canevas.width, canevas.height)
        resolve(canevas.toDataURL('image/jpeg', 0.8))
      }
      image.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  })

/**
 * Photo d'identité : un cadre au format 3/4, et le choix du fichier à côté.
 *
 * Le champ de fichier natif est masqué - son bouton « Parcourir… » et son
 * « Aucun fichier sélectionné » n'obéissent à aucune feuille de styles et
 * jureraient au milieu de champs soulignés.
 */
const ChampPhoto = ({ col, valeur, onChanger }) => {
  const champFichier = useRef(null)
  const [erreur, setErreur] = useState(null)

  const choisir = async (fichier) => {
    if (!fichier) return
    try {
      onChanger(col, await reduireImage(fichier))
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <div className="ddb-groupe">
      <label>{col.libelleForm || col.libelle}</label>

      <div className="ddb-photo">
        <span className="ddb-photo-cadre">
          {valeur ? (
            <img src={valeur} alt="" className="ddb-photo-image" />
          ) : (
            <CIcon icon={cilUser} className="ddb-photo-silhouette" />
          )}
        </span>

        <div className="ddb-photo-actions">
          <button
            type="button"
            className="ddb-photo-bouton"
            onClick={() => champFichier.current?.click()}
          >
            <CIcon icon={cilCloudUpload} className="ddb-photo-bouton-icone" />
            {valeur ? 'Remplacer' : 'Ajouter une photo'}
          </button>

          {valeur && (
            <button type="button" className="ddb-photo-retirer" onClick={() => onChanger(col, '')}>
              <CIcon icon={cilTrash} className="ddb-photo-retirer-icone" />
              Retirer
            </button>
          )}

          <input
            ref={champFichier}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => choisir(e.target.files?.[0])}
          />
        </div>
      </div>

      {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
    </div>
  )
}

const valeursVides = (colonnes) =>
  colonnes.reduce((acc, col) => {
    // Valeur de départ : `false` pour une case, la valeur `defaut` déclarée par
    // la colonne si elle en a une (prix prérempli à 0…), vide sinon. `defaut`
    // peut être une fonction, évaluée à l'ouverture du formulaire : une date du
    // jour figée au chargement de la page serait fausse passé minuit.
    const defaut = typeof col.defaut === 'function' ? col.defaut() : col.defaut
    const depart =
      col.type === 'booleen'
        ? false
        : col.type === 'actes' || col.type === 'medicaments' || col.type === 'selection-actes'
          ? []
          : (defaut ?? '')
    return { ...acc, [col.nom]: depart }
  }, {})

// ---------------------------------------------------------------------------
// Les actes d'un document (`type: 'actes'`)
// ---------------------------------------------------------------------------
const ACTE_VIDE = { acte: '', quantite: '1', tarif: '' }
const chiffres = (texte) => String(texte ?? '').replace(/\D/g, '')
const montant = (n) => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/**
 * Motif d'hospitalisation de l'application d'origine : une ligne de saisie -
 * « - Rechercher acte - », quantité, « Tarif » -, ⊕ l'ajoute aux actes, ⊗ la
 * vide. La valeur du champ est la liste des actes ajoutés :
 * [{ acte, quantite, tarif }]. `col.suggestions(entrees)` propose les actes
 * déjà connus.
 */
const ChampActes = ({ col, valeur, entrees, erreur, onChanger }) => {
  const actes = Array.isArray(valeur) ? valeur : []
  const [saisie, setSaisie] = useState(ACTE_VIDE)
  const liste = `champ-${col.nom}-suggestions`
  const suggestions = col.suggestions ? col.suggestions(entrees) : []

  const ajouter = () => {
    const acte = saisie.acte.trim()
    if (!acte) return
    onChanger(col, [
      ...actes,
      {
        acte,
        quantite: Number(chiffres(saisie.quantite)) || 1,
        tarif: Number(chiffres(saisie.tarif)) || 0,
      },
    ])
    setSaisie(ACTE_VIDE)
  }

  const saisir = (champ, texte) => setSaisie((s) => ({ ...s, [champ]: texte }))

  return (
    <div className={`ddb-groupe${erreur ? ' ddb-groupe-erreur' : ''}`}>
      <div className="ddb-actes-saisie">
        <input
          className="ddb-champ"
          list={liste}
          value={saisie.acte}
          onChange={(e) => saisir('acte', e.target.value)}
          // Entrée ajoute l'acte au lieu d'enregistrer tout le document.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ajouter()
            }
          }}
          placeholder="- Rechercher acte -"
          maxLength={150}
          aria-label="Acte"
          autoComplete="off"
        />
        <datalist id={liste}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          className="ddb-champ ddb-actes-nombre"
          value={saisie.quantite}
          onChange={(e) => saisir('quantite', chiffres(e.target.value))}
          inputMode="numeric"
          maxLength={3}
          aria-label="Quantité"
          autoComplete="off"
        />
        <input
          className="ddb-champ ddb-actes-nombre"
          value={saisie.tarif ? montant(saisie.tarif) : ''}
          onChange={(e) => saisir('tarif', chiffres(e.target.value))}
          placeholder="Tarif"
          inputMode="numeric"
          maxLength={11}
          aria-label="Tarif"
          autoComplete="off"
        />
        <button
          type="button"
          className="ddb-actes-bouton ddb-actes-ajouter"
          onClick={ajouter}
          disabled={!saisie.acte.trim()}
          aria-label="Ajouter l’acte"
          title="Ajouter l’acte"
        >
          <CIcon icon={cilPlus} />
        </button>
        <button
          type="button"
          className="ddb-actes-bouton ddb-actes-effacer"
          onClick={() => setSaisie(ACTE_VIDE)}
          aria-label="Effacer la saisie"
          title="Effacer la saisie"
        >
          <CIcon icon={cilX} />
        </button>
      </div>

      {actes.length > 0 && (
        <ul className="ddb-actes-liste">
          {actes.map((a, index) => (
            <li key={`${a.acte}-${index}`}>
              <span className="ddb-actes-rang">{index + 1} -</span>
              <span>{a.acte}</span>
              <span className="ddb-actes-droite">{a.quantite}</span>
              <span className="ddb-actes-droite">{montant(a.tarif)}</span>
              <button
                type="button"
                className="ddb-actes-retirer"
                onClick={() =>
                  onChanger(
                    col,
                    actes.filter((_, i) => i !== index),
                  )
                }
                aria-label={`Retirer l’acte ${a.acte}`}
                title="Retirer l’acte"
              >
                <CIcon icon={cilX} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
    </div>
  )
}

/**
 * Médicaments d'une ordonnance (`type: 'medicaments'`).
 *
 * Comme l'application d'origine, on ne tape rien : on **sélectionne** les
 * médicaments dans le catalogue (Données de base → Médicaments, prestation 06),
 * et on pose leur quantité. Le bouton « Saisir les médicaments » ouvre le
 * sélecteur ; la liste des médicaments retenus reste visible dessous. La valeur
 * du champ est cette liste : [{ code, libelle, quantite, tarif, exclus }]. Le
 * « Nb. Articles » du bon s'en déduit (champ en lecture seule).
 */
const ChampMedicaments = ({ col, valeur, onChanger }) => {
  const lignes = Array.isArray(valeur) ? valeur : []
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')

  // Le catalogue, lu une fois : les référentiels sont en mémoire au démarrage.
  const catalogue = useMemo(
    () => listerEntreesSync('medicaments').filter((m) => m.actif !== false),
    [],
  )
  const choisis = new Set(lignes.map((l) => l.code))
  const terme = recherche.trim().toLowerCase()
  // Plafonné : un catalogue de centaines de lignes ne se parcourt pas d'un bloc,
  // la recherche le réduit à ce qu'on cherche.
  const resultats = catalogue
    .filter((m) => !choisis.has(m.code))
    .filter((m) => !terme || `${m.code} ${m.libelle}`.toLowerCase().includes(terme))
    .slice(0, 40)

  const ajouter = (m) =>
    onChanger(col, [
      ...lignes,
      {
        code: m.code,
        libelle: m.libelle,
        quantite: 1,
        tarif: m.tarif ?? 0,
        exclus: Boolean(m.exclus),
      },
    ])
  const retirer = (code) =>
    onChanger(
      col,
      lignes.filter((l) => l.code !== code),
    )
  const changerQuantite = (code, texte) => {
    const quantite = Math.max(1, Number(String(texte).replace(/\D/g, '')) || 1)
    onChanger(
      col,
      lignes.map((l) => (l.code === code ? { ...l, quantite } : l)),
    )
  }

  return (
    <div className="ddb-groupe">
      <button
        type="button"
        className={`ddb-bouton-etape${ouvert ? ' ddb-bouton-etape-ouvert' : ''}`}
        onClick={() => setOuvert((o) => !o)}
      >
        Saisir les médicaments
        {lignes.length > 0 && <span className="ddb-medic-compteur">{lignes.length}</span>}
        <CIcon icon={cilPencil} className="ddb-bouton-etape-icone" />
      </button>

      {/* Les médicaments retenus, toujours visibles : l'ordonnance d'un coup d'œil. */}
      {lignes.length > 0 && (
        <ul className="ddb-medic-liste">
          {lignes.map((l, index) => (
            <li key={l.code} className="ddb-medic-ligne">
              <span className="ddb-medic-rang">{index + 1} -</span>
              <span className="ddb-medic-nom">
                <span className="ddb-mono ddb-medic-code">{l.code}</span> {l.libelle}
                {l.exclus && <span className="ddb-medic-exclu">Exclu</span>}
              </span>
              <input
                className="ddb-champ ddb-medic-qte"
                value={l.quantite}
                onChange={(e) => changerQuantite(l.code, e.target.value)}
                inputMode="numeric"
                maxLength={3}
                aria-label={`Quantité de ${l.libelle}`}
              />
              <button
                type="button"
                className="ddb-medic-retirer"
                onClick={() => retirer(l.code)}
                aria-label={`Retirer ${l.libelle}`}
                title="Retirer"
              >
                <CIcon icon={cilX} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Sélecteur : recherche puis catalogue, un clic ajoute le médicament. */}
      {ouvert && (
        <div className="ddb-medic-selecteur">
          <input
            className="ddb-champ ddb-medic-recherche"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un médicament (nom ou code)…"
            autoComplete="off"
            autoFocus
          />
          <ul className="ddb-medic-catalogue">
            {resultats.length === 0 ? (
              <li className="ddb-medic-vide">Aucun médicament</li>
            ) : (
              resultats.map((m) => (
                <li key={m.code}>
                  <button type="button" className="ddb-medic-choix" onClick={() => ajouter(m)}>
                    <CIcon icon={cilPlus} className="ddb-medic-choix-icone" />
                    <span className="ddb-mono ddb-medic-code">{m.code}</span>
                    <span className="ddb-medic-choix-nom">{m.libelle}</span>
                    {m.exclus && <span className="ddb-medic-exclu">Exclu</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Actes d'une prescription (`type: 'selection-actes'`).
 *
 * Comme les médicaments, on **sélectionne** l'acte dans la nomenclature
 * (Données de base → Actes) ; à la différence près que l'acte porte un **tarif
 * saisi** sur le document (le tarif de référence valant le plus souvent 0). La
 * liste proposée se limite à la spécialité du prestataire quand elle est
 * connue (`col.specialiteDe` nomme le champ qui la porte). Valeur du champ :
 * [{ code, libelle, specialite, quantite, tarif }].
 */
const ChampSelectionActes = ({ col, valeur, valeurs, onChanger }) => {
  const lignes = Array.isArray(valeur) ? valeur : []
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')

  const catalogue = useMemo(() => listerEntreesSync('actes').filter((a) => a.actif !== false), [])
  // Filtré sur la spécialité du prestataire quand on la connaît (comme
  // l'origine, où les actes proposés sont ceux de sa spécialité) ; sinon, tous.
  // Deux façons de la désigner : `specialiteDe` nomme un champ qui porte
  // directement le code de spécialité (lettre de garantie) ; `prestataireDe`
  // nomme le champ qui porte le code du prestataire, dont on lit la spécialité
  // sur sa fiche (LG hospitalisation, où la spécialité n'est pas saisie à part).
  let specialiteFiltre = col.specialiteDe ? valeurs?.[col.specialiteDe] : ''
  if (!specialiteFiltre && col.prestataireDe) {
    const codePresta = valeurs?.[col.prestataireDe]
    specialiteFiltre = codePresta
      ? listerEntreesSync('fournisseurs-de-soins').find((f) => f.code === codePresta)?.specialite ||
        ''
      : ''
  }
  const choisis = new Set(lignes.map((l) => l.code))
  const terme = recherche.trim().toLowerCase()
  const resultats = catalogue
    .filter((a) => !choisis.has(a.code))
    .filter((a) => !specialiteFiltre || a.specialite === specialiteFiltre)
    .filter((a) => !terme || `${a.code} ${a.libelle}`.toLowerCase().includes(terme))
    .slice(0, 40)

  const ajouter = (a) =>
    onChanger(col, [
      ...lignes,
      {
        code: a.code,
        libelle: a.libelle,
        specialite: a.specialite,
        quantite: 1,
        tarif: a.tarif ?? 0,
      },
    ])
  const retirer = (code) =>
    onChanger(
      col,
      lignes.filter((l) => l.code !== code),
    )
  const changerQuantite = (code, texte) => {
    const quantite = Math.max(1, Number(String(texte).replace(/\D/g, '')) || 1)
    onChanger(
      col,
      lignes.map((l) => (l.code === code ? { ...l, quantite } : l)),
    )
  }
  const changerTarif = (code, texte) => {
    const tarif = Number(chiffres(texte)) || 0
    onChanger(
      col,
      lignes.map((l) => (l.code === code ? { ...l, tarif } : l)),
    )
  }

  return (
    <div className="ddb-groupe">
      <button
        type="button"
        className={`ddb-bouton-etape${ouvert ? ' ddb-bouton-etape-ouvert' : ''}`}
        onClick={() => setOuvert((o) => !o)}
      >
        Saisir les actes
        {lignes.length > 0 && <span className="ddb-medic-compteur">{lignes.length}</span>}
        <CIcon icon={cilPencil} className="ddb-bouton-etape-icone" />
      </button>

      {/* Les actes retenus, toujours visibles : acte, quantité, tarif saisi. */}
      {lignes.length > 0 && (
        <ul className="ddb-medic-liste">
          {lignes.map((l, index) => (
            <li key={l.code} className="ddb-acte-ligne">
              <span className="ddb-medic-rang">{index + 1} -</span>
              <span className="ddb-medic-nom">
                <span className="ddb-mono ddb-medic-code">{l.code}</span> {l.libelle}
              </span>
              <input
                className="ddb-champ ddb-medic-qte"
                value={l.quantite}
                onChange={(e) => changerQuantite(l.code, e.target.value)}
                inputMode="numeric"
                maxLength={3}
                aria-label={`Quantité de ${l.libelle}`}
              />
              <input
                className="ddb-champ ddb-acte-tarif"
                value={l.tarif ? montant(l.tarif) : ''}
                onChange={(e) => changerTarif(l.code, e.target.value)}
                inputMode="numeric"
                maxLength={11}
                placeholder="Tarif"
                aria-label={`Tarif de ${l.libelle}`}
              />
              <button
                type="button"
                className="ddb-medic-retirer"
                onClick={() => retirer(l.code)}
                aria-label={`Retirer ${l.libelle}`}
                title="Retirer"
              >
                <CIcon icon={cilX} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Sélecteur : recherche puis nomenclature, un clic ajoute l'acte. */}
      {ouvert && (
        <div className="ddb-medic-selecteur">
          <input
            className="ddb-champ ddb-medic-recherche"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un acte (nom ou code)…"
            autoComplete="off"
            autoFocus
          />
          <ul className="ddb-medic-catalogue">
            {resultats.length === 0 ? (
              <li className="ddb-medic-vide">
                {specialiteFiltre ? 'Aucun acte pour cette spécialité' : 'Aucun acte'}
              </li>
            ) : (
              resultats.map((a) => (
                <li key={a.code}>
                  <button type="button" className="ddb-medic-choix" onClick={() => ajouter(a)}>
                    <CIcon icon={cilPlus} className="ddb-medic-choix-icone" />
                    <span className="ddb-mono ddb-medic-code">{a.code}</span>
                    <span className="ddb-medic-choix-nom">{a.libelle}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Structure de saisie effective : celle déclarée par le référentiel, ou à
 * défaut un onglet unique listant les colonnes une par ligne.
 */
const structure = (referentiel) =>
  referentiel.formulaire || [
    {
      sections: [
        {
          // Les champs engendrés par l'application (code séquentiel…) ne se
          // saisissent pas : ils sont calculés à l'enregistrement.
          lignes: referentiel.colonnes.filter((col) => !col.calcule).map((col) => [col.nom]),
        },
      ],
    },
  ]

/** Tous les noms de champs d'un onglet, sections et lignes confondues. */
const lignesDeLaSection = (section) =>
  section.sousOnglets
    ? section.sousOnglets.flatMap((sous) => sous.lignes || [])
    : section.lignes || []

const champsDeLOnglet = (onglet) =>
  onglet.sections.flatMap((section) => lignesDeLaSection(section).flat())

// ---------------------------------------------------------------------------
// Un champ
// ---------------------------------------------------------------------------
const Champ = ({ col, valeur, valeurs, entrees, erreur, autoFocus, onChanger }) => {
  const identifiant = `champ-${col.nom}`
  const requis = champRequis(col, valeurs)

  if (col.type === 'photo') {
    return <ChampPhoto col={col} valeur={valeur} onChanger={onChanger} />
  }

  if (col.type === 'actes') {
    return (
      <ChampActes
        col={col}
        valeur={valeur}
        entrees={entrees}
        erreur={erreur}
        onChanger={onChanger}
      />
    )
  }

  if (col.type === 'medicaments') {
    return <ChampMedicaments col={col} valeur={valeur} onChanger={onChanger} />
  }

  if (col.type === 'selection-actes') {
    return <ChampSelectionActes col={col} valeur={valeur} valeurs={valeurs} onChanger={onChanger} />
  }

  // Bouton d'une étape à venir (`type: 'bouton'`) - « Saisir les médicaments »
  // de l'application d'origine, grisé à la création du bon. Ce n'est pas une
  // donnée : il n'est ni contrôlé ni envoyé.
  if (col.type === 'bouton') {
    return (
      <div className="ddb-groupe">
        <button type="button" className="ddb-bouton-etape" disabled title={col.aide}>
          {col.libelleForm || col.libelle}
          <CIcon icon={cilPencil} className="ddb-bouton-etape-icone" />
        </button>
      </div>
    )
  }

  // Une case à cocher porte son propre libellé : pas de label au-dessus.
  if (col.type === 'booleen') {
    return (
      <label className="ddb-case">
        <input
          type="checkbox"
          id={identifiant}
          checked={Boolean(valeur)}
          onChange={(e) => onChanger(col, e.target.checked)}
        />
        <span>{col.libelleForm || col.libelle}</span>
      </label>
    )
  }

  // État à deux positions : Actif / Suspendu (bascule segmentée). Un adhérent
  // suspendu reste enregistré, simplement mis hors circuit.
  if (col.type === 'etat') {
    const actif = Boolean(valeur)
    return (
      <div className="ddb-groupe">
        <label>{col.libelleForm || col.libelle}</label>
        <div className="ddb-etat" role="group" aria-label={col.libelleForm || col.libelle}>
          <button
            type="button"
            className={`ddb-etat-choix${actif ? ' ddb-etat-actif' : ''}`}
            onClick={() => onChanger(col, true)}
          >
            Actif
          </button>
          <button
            type="button"
            className={`ddb-etat-choix${actif ? '' : ' ddb-etat-suspendu'}`}
            onClick={() => onChanger(col, false)}
          >
            Suspendu
          </button>
        </div>
      </div>
    )
  }

  // Bascule segmentée générique à partir d'options (ex. Compense / Banque) :
  // deux positions, l'active en sombre, comme dans LAMPS.
  if (col.type === 'bascule') {
    const opts = optionsDe(col, valeurs, entrees)
    return (
      <div className="ddb-groupe">
        <label>{col.libelleForm || col.libelle}</label>
        <div
          className="ddb-etat ddb-bascule"
          role="group"
          aria-label={col.libelleForm || col.libelle}
        >
          {opts.map((o) => (
            <button
              key={o.valeur}
              type="button"
              className={`ddb-etat-choix${valeur === o.valeur ? ' ddb-bascule-actif' : ''}`}
              onClick={() => onChanger(col, o.valeur)}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Choix fermé rendu en boutons radio (sexe, type de contrat…).
  if (col.type === 'radio') {
    return (
      <div className={`ddb-groupe${erreur ? ' ddb-groupe-erreur' : ''}`}>
        <label>
          {col.libelleForm || col.libelle}
          {requis && <span className="ddb-requis"> *</span>}
        </label>
        {/* Empilés par défaut (Homme / Femme) ; côte à côte avec `enLigne`
            (CDD  CDI), comme l'application d'origine. */}
        <div className={`ddb-radios${col.enLigne ? ' ddb-radios-en-ligne' : ''}`}>
          {optionsDe(col, valeurs, entrees).map((option) => (
            <label key={option.valeur} className="ddb-radio">
              <input
                type="radio"
                name={identifiant}
                checked={valeur === option.valeur}
                onChange={() => onChanger(col, option.valeur)}
              />
              <span>{option.libelle}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  // Champ calculé par l'application : montré pour information, jamais saisi.
  if (col.lectureSeule) {
    const brute = col.valeur ? col.valeur(valeurs) : valeur
    const option = col.options
      ? optionsDe(col, valeurs, entrees).find((o) => o.valeur === brute)
      : null
    return (
      <div className="ddb-groupe ddb-groupe-fige">
        <label htmlFor={identifiant}>{col.libelleForm || col.libelle}</label>
        <div className="ddb-champ-enveloppe">
          <input
            id={identifiant}
            className={`ddb-champ${col.mono ? ' ddb-mono' : ''}`}
            value={option ? texteOption(option, col) : brute || ''}
            readOnly
            tabIndex={-1}
          />
        </div>
      </div>
    )
  }

  // Libellé flottant, comme l'application d'origine : dans le champ tant qu'il
  // est vide, au-dessus dès qu'on y entre ou qu'il porte une valeur. Un champ
  // qui affiche toujours quelque chose - l'indicatif « +221 », le « jj/mm/aaaa »
  // d'une date - garde son libellé au-dessus : il n'y aurait pas la place dedans.
  const flottant = !col.prefixe && col.type !== 'date'
  const vide = valeur === '' || valeur === null || valeur === undefined
  // Une amorce seule (« +221 ») n'est pas une saisie : le champ obligatoire
  // reste signalé tant que le numéro manque. Le libellé, lui, reste au-dessus,
  // sans se poser sur l'indicatif.
  const sansSaisie = vide || Boolean(col.amorce && String(valeur).trim() === col.amorce.trim())
  const classes = [
    'ddb-groupe',
    flottant && 'ddb-groupe-flottant',
    flottant && vide && 'ddb-groupe-vide',
    // Obligatoire et encore vide : la page peut le cadrer (participants).
    requis && sansSaisie && 'ddb-groupe-requis-vide',
    erreur && 'ddb-groupe-erreur',
  ]
    .filter(Boolean)
    .join(' ')

  // Message d'aide propre au champ (ex. « pas d'épouse », « 2 enfants : choisissez »).
  const aide = col.message ? col.message(valeurs, entrees) : null

  return (
    <div className={classes}>
      <label htmlFor={identifiant}>
        {col.libelleForm || col.libelle}
        {requis && <span className="ddb-requis"> *</span>}
      </label>

      {col.options ? (
        // Liste déroulante AVEC recherche (combobox) : essentielle pour les
        // longues listes. Le libellé flottant reste dans le champ tant qu'il est
        // vide (placeholder ''), remonte à l'ouverture (focus) ou dès qu'il porte
        // une valeur. Effaçable seulement si le champ n'est pas obligatoire.
        <SelectRecherche
          id={identifiant}
          value={valeur}
          options={optionsDe(col, valeurs, entrees)}
          texte={(option) => texteOption(option, col)}
          placeholder={flottant ? '' : requis ? 'Choisir…' : '- Aucun -'}
          effacable={!requis}
          disabled={col.desactive}
          autoFocus={autoFocus}
          onChange={(v) => onChanger(col, v)}
        />
      ) : (
        <div className={`ddb-champ-enveloppe${col.prefixe ? ' ddb-champ-prefixe' : ''}`}>
          {col.prefixe && <span className="ddb-prefixe">{col.prefixe}</span>}
          <input
            id={identifiant}
            type={col.type || 'text'}
            className={`ddb-champ${col.mono ? ' ddb-mono' : ''}`}
            value={valeur}
            onChange={(e) => onChanger(col, e.target.value)}
            maxLength={col.maxLength}
            autoFocus={autoFocus}
            disabled={col.desactive}
            autoComplete="off"
            placeholder={col.placeholder}
          />
        </div>
      )}

      {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
      {!erreur && aide && <span className="ddb-champ-aide">{aide}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Corps du formulaire
// ---------------------------------------------------------------------------
/**
 * Monté avec une `key` liée à l'entrée éditée : changer de cible remonte le
 * composant, ce qui réinitialise la saisie sans effet.
 */
export const CorpsFormulaire = ({
  referentiel,
  entree,
  entrees,
  valeursDefaut,
  onConfirmer,
  onEnregistrer,
}) => {
  // Un code numéroté par l'application (`genererCode`) et montré dans le
  // formulaire devient une proposition : prérempli à la création, modifiable,
  // et recalculé tant qu'on n'y a pas touché - le code d'une entité suit son
  // type (DEP015 → SRV016).
  const colonnes = useMemo(
    () =>
      referentiel.colonnes.map((col) =>
        col.nom === 'code' &&
        referentiel.genererCode &&
        !col.calcule &&
        !col.lectureSeule &&
        !col.valeurProposee
          ? { ...col, valeurProposee: referentiel.genererCode }
          : col,
      ),
    [referentiel],
  )
  const onglets = useMemo(() => structure(referentiel), [referentiel])
  const parNom = useMemo(
    () => Object.fromEntries(colonnes.map((col) => [col.nom, col])),
    [colonnes],
  )

  const [ongletActif, setOngletActif] = useState(0)
  // Sous-onglet actif d'une section qui en déclare (`sousOnglets`) : les quatre
  // pièces des « Références professionnelles », comme l'application d'origine.
  // Une entrée par section (clé = clé de la section).
  const [sousOngletActif, setSousOngletActif] = useState({})
  const [valeurs, setValeurs] = useState(() => {
    const depart = entree
      ? { ...valeursVides(colonnes), ...entree }
      : { ...valeursVides(colonnes), ...valeursDefaut }
    if (!entree) {
      // Valeurs proposées à l'ouverture - le code d'un adhérent (le numéro
      // suivant), puis son compte, qui en découle : préremplies comme dans
      // l'application d'origine, mais modifiables. Dans l'ordre des colonnes,
      // pour qu'une proposition puisse s'appuyer sur la précédente.
      colonnes.forEach((col) => {
        if (col.valeurProposee && !depart[col.nom]) {
          depart[col.nom] = col.valeurProposee(depart, entrees || [])
        }
      })
    }
    // Amorce - le « +221 » d'un téléphone : posée dans tout champ vide, à la
    // création comme en modification, et modifiable comme le reste. Laissée
    // seule, elle n'est pas enregistrée (cf. `soumettre`).
    colonnes.forEach((col) => {
      if (col.amorce && !depart[col.nom]) depart[col.nom] = col.amorce
    })
    return depart
  })
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)

  // Champs dont la valeur devient caduque quand celui-ci change.
  const dependants = useMemo(
    () =>
      colonnes
        .filter((c) => c.dependDe)
        .reduce((acc, c) => {
          acc[c.dependDe] = [...(acc[c.dependDe] || []), c.nom]
          return acc
        }, {}),
    [colonnes],
  )

  const changer = (col, valeurBrute) => {
    const valeur =
      col.majuscules && typeof valeurBrute === 'string' ? valeurBrute.toUpperCase() : valeurBrute
    const aVider = dependants[col.nom] || []

    setValeurs((v) => {
      const suivant = { ...v, [col.nom]: valeur }
      // Changer le type d'une entité invalide son rattachement : le conserver
      // laisserait un service pointer sur une direction.
      aVider.forEach((nom) => {
        suivant[nom] = ''
      })
      // Un champ proposé d'après celui-ci - le compte d'après le code - le
      // suit, tant qu'on ne l'a pas retouché.
      return reporterPropositions(colonnes, v, suivant, entrees || [])
    })
    setErreurs((e) => ({
      ...e,
      [col.nom]: null,
      ...Object.fromEntries(aVider.map((n) => [n, null])),
    }))
  }

  const valider = (candidat) => {
    const trouvees = {}
    colonnes.forEach((col) => {
      if (
        col.calcule ||
        col.lectureSeule ||
        col.desactive ||
        col.type === 'booleen' ||
        col.type === 'bouton' ||
        col.type === 'actes' ||
        col.type === 'medicaments' ||
        col.type === 'selection-actes'
      )
        return // rien à exiger
      if (!champVisible(col, candidat)) return // champ masqué : rien à exiger
      const valeur = candidat[col.nom]
      if (champRequis(col, candidat) && !valeur) {
        trouvees[col.nom] = 'Champ obligatoire'
        return
      }
      // Une faute de frappe dans une adresse s'arrête ici, sous le champ,
      // plutôt qu'après un aller-retour au serveur.
      if (col.type === 'email' && valeur && !FORME_EMAIL.test(valeur)) {
        trouvees[col.nom] = 'Adresse e-mail invalide - exemple : contact@clinique.sn'
        return
      }
      if (col.unique && valeur) {
        const doublon = entrees.some(
          (e) =>
            e.id !== entree?.id && String(e[col.nom] || '').toLowerCase() === valeur.toLowerCase(),
        )
        if (doublon) trouvees[col.nom] = 'Cette valeur existe déjà'
      }
    })
    return trouvees
  }

  const soumettre = async (evenement) => {
    evenement.preventDefault()
    const candidat = {}
    colonnes.forEach((col) => {
      // Un bouton n'est pas une donnée : rien à envoyer.
      if (col.type === 'bouton') return
      // Les actes et médicaments partent en liste ; masqués, ils partent vides.
      if (col.type === 'actes' || col.type === 'medicaments' || col.type === 'selection-actes') {
        candidat[col.nom] = champVisible(col, valeurs) ? valeurs[col.nom] || [] : []
        return
      }
      if (col.type === 'booleen' || col.type === 'etat') {
        candidat[col.nom] = Boolean(valeurs[col.nom])
        return
      }
      // Un champ figé porte la valeur que l'application calcule, pas ce que
      // l'écran affichait.
      if (col.lectureSeule) {
        candidat[col.nom] = col.valeur ? col.valeur(valeurs) : valeurs[col.nom] || ''
        return
      }
      const saisie = String(valeurs[col.nom] ?? '').trim()
      // Une amorce laissée seule - « +221 » sans numéro - n'est pas une saisie.
      const valeur = col.amorce && saisie === col.amorce.trim() ? '' : saisie
      // Un champ masqué ne doit rien laisser derrière lui : une direction qui
      // était un service ne garde pas son ancien rattachement.
      candidat[col.nom] = champVisible(col, valeurs) ? valeur : ''
    })

    const trouvees = valider(candidat)
    if (Object.keys(trouvees).length) {
      montrerErreurs(trouvees)
      return
    }

    // Confirmation demandée par la page (fenêtre modale) avant tout envoi.
    // Renoncer laisse le formulaire ouvert, tel quel.
    if (onConfirmer && !(await onConfirmer(candidat, entree))) return

    try {
      setEnvoi(true)
      await onEnregistrer(candidat, entree)
    } catch (e) {
      // Le serveur a refusé la saisie : ses erreurs se posent sous les champs,
      // exactement comme celles du formulaire - jamais de message technique.
      const duServeur = erreursDeChamps(e)
      if (!duServeur) {
        toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
        return
      }
      montrerErreurs(duServeur)
      // Un champ que ce formulaire ne montre pas (rare) se dit dans le message.
      const horsEcran = Object.keys(duServeur).find(
        (nom) => !colonnes.some((col) => col.nom === nom),
      )
      toast.error(
        horsEcran
          ? `Enregistrement impossible : ${duServeur[horsEcran]}`
          : 'Enregistrement impossible : vérifiez les champs signalés en rouge.',
      )
    } finally {
      setEnvoi(false)
    }
  }

  /**
   * Pose les erreurs sous leurs champs et ouvre l'onglet du premier fautif :
   * sans ça, une erreur sur un onglet masqué bloquerait l'enregistrement sans
   * que rien ne s'affiche. Sert aux erreurs du formulaire comme à celles que
   * renvoie le serveur.
   */
  const montrerErreurs = (trouvees) => {
    setErreurs(trouvees)
    const fautif = onglets.findIndex((onglet) =>
      champsDeLOnglet(onglet).some((nom) => trouvees[nom]),
    )
    if (fautif >= 0) {
      setOngletActif(fautif)
      // Ouvre aussi le sous-onglet du premier champ fautif : sinon une erreur
      // sur une pièce masquée resterait invisible.
      ;(onglets[fautif]?.sections || []).forEach((section, i) => {
        if (!section.sousOnglets) return
        const index = section.sousOnglets.findIndex((sous) =>
          (sous.lignes || []).flat().some((nom) => trouvees[nom]),
        )
        if (index >= 0)
          setSousOngletActif((m) => ({ ...m, [section.titre || `section-${i}`]: index }))
      })
    }
  }

  const onglet = onglets[ongletActif] || onglets[0]

  // Sections toujours visibles au-dessus des onglets (identité d'un
  // participant, par exemple), déclarées par `formulaireEnTete`.
  const sectionsEnTete = referentiel.formulaireEnTete || []
  const premierChamp = sectionsEnTete[0]?.lignes?.[0]?.[0] || onglet.sections[0]?.lignes?.[0]?.[0]

  /** Les lignes de champs d'une section (ou d'un sous-onglet). */
  const rendreLignes = (lignes) =>
    lignes.map((ligne) => {
      // Un champ conditionnel masqué ne doit pas laisser de colonne vide dans
      // la grille : on recalcule la ligne avant de la poser.
      const affiches = ligne.filter((nom) => parNom[nom] && champVisible(parNom[nom], valeurs))
      if (affiches.length === 0) return null

      return (
        <div
          className="ddb-ligne-champs"
          key={ligne.join('-')}
          // Nombre de champs de la ligne : une page peut replier les lignes
          // chargées quand la place manque (cf. participants.scss).
          data-colonnes={affiches.length}
          style={{
            // Colonnes égales par défaut ; un champ « etat » prend sa largeur
            // naturelle pour ne pas être tronqué, les autres se partageant le reste.
            gridTemplateColumns: affiches
              .map((nom) => (parNom[nom].type === 'etat' ? 'auto' : 'minmax(0, 1fr)'))
              .join(' '),
          }}
        >
          {affiches.map((nom) => (
            <Champ
              key={nom}
              col={parNom[nom]}
              // Un zéro se montre (Remise : 0) ; seul l'absent devient vide.
              valeur={valeurs[nom] ?? ''}
              valeurs={valeurs}
              entrees={entrees}
              erreur={erreurs[nom]}
              autoFocus={nom === premierChamp}
              onChanger={changer}
            />
          ))}
        </div>
      )
    })

  const rendreSection = (section, cle) => {
    // Section à sous-onglets (`sousOnglets`) : un titre, une barre de sous-onglets
    // (les quatre pièces des Références professionnelles), puis le contenu du
    // sous-onglet actif - comme l'application d'origine.
    if (section.sousOnglets) {
      const actif = sousOngletActif[cle] || 0
      const sous = section.sousOnglets[actif] || section.sousOnglets[0]
      return (
        <section className="ddb-section" key={cle}>
          {section.titre && <h3 className="ddb-section-titre">{section.titre}</h3>}
          <div className="ddb-sous-onglets" role="tablist">
            {section.sousOnglets.map((s, index) => {
              const enErreur = (s.lignes || []).flat().some((nom) => erreurs[nom])
              return (
                <button
                  type="button"
                  role="tab"
                  key={s.titre}
                  aria-selected={index === actif}
                  className={`ddb-sous-onglet${index === actif ? ' ddb-sous-onglet-actif' : ''}${
                    enErreur ? ' ddb-sous-onglet-erreur' : ''
                  }`}
                  onClick={() => setSousOngletActif((m) => ({ ...m, [cle]: index }))}
                >
                  {s.titre}
                </button>
              )
            })}
          </div>
          {rendreLignes(sous.lignes || [])}
        </section>
      )
    }

    return (
      <section className="ddb-section" key={cle}>
        {section.titre && <h3 className="ddb-section-titre">{section.titre}</h3>}
        {rendreLignes(section.lignes || [])}
      </section>
    )
  }

  return (
    // La classe au nom du référentiel laisse une page habiller son formulaire
    // sans toucher aux autres (participants.scss, par exemple).
    <form
      className={`ddb-formulaire ddb-formulaire-${referentiel.cle}`}
      onSubmit={soumettre}
      noValidate
    >
      {sectionsEnTete.length > 0 && (
        <fieldset className="ddb-formulaire-entete-champs">
          {sectionsEnTete.map((section, i) =>
            rendreSection(section, section.titre || `entete-${i}`),
          )}
        </fieldset>
      )}

      {onglets.length > 1 && (
        <div className="ddb-onglets" role="tablist">
          {onglets.map((o, index) => {
            const enErreur = champsDeLOnglet(o).some((nom) => erreurs[nom])
            return (
              <button
                type="button"
                role="tab"
                key={o.libelle}
                aria-selected={index === ongletActif}
                className={`ddb-onglet${index === ongletActif ? ' ddb-onglet-actif' : ''}${
                  enErreur ? ' ddb-onglet-erreur' : ''
                }`}
                onClick={() => setOngletActif(index)}
              >
                {o.libelle}
              </button>
            )
          })}
        </div>
      )}

      <fieldset className="ddb-formulaire-champs">
        {onglet.sections.map((section, indexSection) =>
          rendreSection(section, section.titre || `section-${indexSection}`),
        )}
      </fieldset>

      <div className="ddb-formulaire-pied">
        <button type="submit" className="ddb-bouton-enregistrer" disabled={envoi}>
          {envoi && <CSpinner size="sm" className="me-2" />}
          Enregistrer
        </button>
      </div>
    </form>
  )
}

const FormulaireEntree = ({
  referentiel,
  entree,
  entrees,
  valeursDefaut,
  titreCreation,
  visible,
  onFermer,
  onConfirmer,
  onEnregistrer,
  enPause = false,
}) => {
  const modification = Boolean(entree)

  return (
    <COffcanvas
      placement="end"
      visible={visible}
      onHide={onFermer}
      // En pause le temps d'une confirmation (`enPause`) : le panneau lâche
      // son piège à focus et la touche Échap, que la fenêtre de confirmation
      // prend à son tour - sans quoi les deux se disputeraient le clavier, et
      // Échap refermerait le formulaire avec la question. Le voile de la
      // fenêtre couvre alors le sien.
      backdrop={!enPause}
      keyboard={!enPause}
      className={`ddb-panneau${referentiel.formulaire ? ' ddb-panneau-large' : ''}`}
    >
      <div className="ddb-panneau-entete">
        <span className="ddb-panneau-titre">
          {modification ? referentiel.modifier : titreCreation || referentiel.nouveau}
        </span>
        <button type="button" className="ddb-panneau-fermer" onClick={onFermer} aria-label="Fermer">
          <CIcon icon={cilX} size="sm" />
        </button>
      </div>

      <COffcanvasBody className="p-0">
        {visible && (
          <CorpsFormulaire
            key={entree?.id || `nouvelle-entree-${JSON.stringify(valeursDefaut || {})}`}
            referentiel={referentiel}
            entree={entree}
            entrees={entrees}
            valeursDefaut={valeursDefaut}
            onConfirmer={onConfirmer}
            onEnregistrer={onEnregistrer}
          />
        )}
      </COffcanvasBody>
    </COffcanvas>
  )
}

export default FormulaireEntree
