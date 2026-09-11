/**
 * Affichage générique d'un référentiel : barre d'outils + tableau.
 *
 * Ce composant ne connaît aucun référentiel en particulier — il lit sa
 * description dans config.js. C'est ce qui permet d'ajouter « Banques » ou
 * « Taux de prise en charge » sans écrire une ligne de composant.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CBadge,
  CButton,
  CFormInput,
  CFormSwitch,
  CInputGroup,
  CInputGroupText,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
  CTooltip,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCloudDownload,
  cilCloudUpload,
  cilInbox,
  cilPencil,
  cilPlus,
  cilSearch,
  cilTrash,
} from '@coreui/icons'

import {
  creerEntree,
  importerEntrees,
  listerEntrees,
  modifierEnLot,
  modifierEntree,
  supprimerEntree,
} from '../../services/referentiels'
import { toast } from '../../services/toast'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { exporterExcel, lireExcel, rapportErreurs } from './excel'
import FormulaireEntree from './FormulaireEntree'
import Pagination from './Pagination'
import { libelleValeur, optionsDe } from './optionsChamp'

const TAILLE_PAGE_PAR_DEFAUT = 10

/** Couleur du badge selon l'état administratif d'un dossier (participants). */
const COULEUR_STATUT = {
  Actif: 'success',
  'En Attente': 'secondary',
  Suspendu: 'warning',
  Résilié: 'danger',
  Radié: 'dark',
}

/**
 * Affichage d'une valeur numérique dans le tableau : séparateur de milliers à
 * la française (« 12 500 »), comme l'application d'origine. Une valeur vide ou
 * non numérique est rendue telle quelle.
 */
const formaterNombre = (valeur) => {
  if (valeur === '' || valeur === null || valeur === undefined) return ''
  const nombre = Number(valeur)
  return Number.isNaN(nombre) ? valeur : nombre.toLocaleString('fr-FR')
}

/**
 * Outils de fin de barre, déclarés par le référentiel via `outils` : l'export
 * et l'import Excel (cf. excel.js). L'export vaut pour toute liste, puisqu'il
 * écrit ce que l'écran affiche ; l'import n'a de sens que pour un référentiel
 * servi par l'API, qui seul peut valider le fichier entier avant d'écrire.
 *
 * Ils portent le filet gris des contrôles voisins, pas une couleur : la
 * maquette d'origine les peignait en bleu et en vert, deux teintes que la
 * charte SAR ne connaît pas et qui voleraient la vedette au seul bouton rouge
 * de l'écran.
 */
const OUTILS = {
  import: { libelle: 'Import Excel', icone: cilCloudUpload },
  export: { libelle: 'Export Excel', icone: cilCloudDownload },
}

/**
 * Prédicat d'un segment : soit celui qu'il déclare (filtre sur un booléen),
 * soit l'égalité sur le champ discriminant du référentiel.
 */
const predicatSegment = (segments, segment) => {
  if (!segment) return () => true
  if (segment.filtre) return segment.filtre
  if (segments.champ) return (e) => e[segments.champ] === segment.valeur
  return () => true
}

const Referentiel = ({ referentiel }) => {
  const { cle, libelle, colonnes, nouveau } = referentiel

  const segments = referentiel.segments
  const TAILLE_PAGE = referentiel.taillePage || TAILLE_PAGE_PAR_DEFAUT

  /**
   * Certains référentiels expriment déjà l'activité dans leurs segments
   * (Tous / Actifs / Suspendus). Ils ne portent alors pas l'interrupteur
   * « Afficher les inactifs » : les deux diraient la même chose, et pire, se
   * contrediraient — « Suspendus » ne montrerait rien tant que l'interrupteur
   * resterait fermé, puisque le filtre d'activité s'applique après le segment.
   */
  const activiteParSegments = Boolean(segments?.activite)

  /**
   * Un référentiel peut exposer l'état (Actif / Suspendu) comme une colonne et
   * un champ du formulaire — c'est le cas des adhérents. On montre alors toutes
   * les lignes, la colonne disant leur état, et on retire l'interrupteur
   * « Afficher les inactifs » qui ferait double emploi.
   */
  const etatEnColonne = colonnes.some((col) => col.type === 'etat')

  // Filtres facultatifs déclarés par le référentiel : une liste déroulante par
  // dimension, à côté de la recherche. Un fournisseur de soins se cherche
  // autant par sa spécialité que par son nom.
  const filtresDeclares = referentiel.filtres || []

  /**
   * Comment nommer une entrée dans un message ou un libellé accessible.
   * Par défaut son intitulé ; un référentiel dont le nom se compose de
   * plusieurs champs — prénoms et nom d'un participant — donne sa formule.
   */
  const nommer = referentiel.nommer || ((e) => e.libelle)

  /**
   * Vocabulaire de l'activation. Une nomenclature se « désactive », une
   * convention avec un prestataire se « suspend » : le référentiel peut
   * remplacer ces mots, sans quoi le tableau dirait « Inactif » là où le
   * sélecteur juste au-dessus dit « Suspendus ».
   */
  const etat = {
    inactif: 'Inactif',
    desactiver: 'Désactiver',
    reactiver: 'Réactiver',
    desactive: 'désactivé',
    reactive: 'réactivé',
    ...referentiel.etat,
  }

  const [entrees, setEntrees] = useState([])
  const [chargement, setChargement] = useState(true)
  const [segmentActif, setSegmentActif] = useState(segments?.valeurs[0].valeur || null)
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState({})
  const [afficherInactifs, setAfficherInactifs] = useState(false)
  const [page, setPage] = useState(1)
  const [panneauOuvert, setPanneauOuvert] = useState(false)
  const [entreeEditee, setEntreeEditee] = useState(null)
  const [selection, setSelection] = useState(() => new Set())

  const recharger = useCallback(async () => {
    try {
      setChargement(true)
      setEntrees(await listerEntrees(cle))
    } catch (e) {
      toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [cle])

  // La page monte ce composant avec une `key` sur la clé du référentiel :
  // changer de référentiel le remonte, donc la vue repart naturellement propre.
  useEffect(() => {
    recharger()
  }, [recharger])

  /**
   * Filtrage côté client : ces listes font quelques dizaines de lignes,
   * le résultat est donc instantané à chaque frappe.
   */
  const definitionSegment = segments?.valeurs.find((s) => s.valeur === segmentActif)

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    const dansLeSegment = predicatSegment(segments, definitionSegment)
    return (
      entrees
        // Filtre de base du référentiel : partitionne une même source en vues
        // (participants actifs vs retraités), avant tout autre filtre.
        .filter(referentiel.filtreBase || (() => true))
        .filter(dansLeSegment)
        .filter((e) => etatEnColonne || activiteParSegments || afficherInactifs || e.actif)
        .filter((e) =>
          Object.entries(filtres).every(([champ, valeur]) => !valeur || e[champ] === valeur),
        )
        .filter(
          (e) =>
            !terme ||
            // La photo est exclue : parcourir une URL de données de plusieurs
            // milliers de caractères à chaque frappe coûterait cher et
            // produirait des correspondances qui n'ont aucun sens.
            colonnes.some(
              (col) =>
                col.type !== 'photo' &&
                String(e[col.nom] || '')
                  .toLowerCase()
                  .includes(terme),
            ),
        )
    )
  }, [
    entrees,
    recherche,
    filtres,
    afficherInactifs,
    activiteParSegments,
    etatEnColonne,
    colonnes,
    segments,
    definitionSegment,
    referentiel.filtreBase,
  ])

  // Compté dans le segment ouvert : un service désactivé ne concerne pas
  // l'onglet des directions.
  const nbInactifs = useMemo(() => {
    const dansLeSegment = predicatSegment(segments, definitionSegment)
    return entrees.filter((e) => !e.actif && dansLeSegment(e)).length
  }, [entrees, segments, definitionSegment])

  /**
   * Colonnes affichées : celles du segment ouvert si le référentiel en
   * distingue (les directions n'ont pas de rattachement à montrer), sinon
   * celles du référentiel, sinon toutes.
   */
  const colonnesTableau = useMemo(() => {
    const noms = definitionSegment?.colonnesTableau || referentiel.colonnesTableau
    if (!noms) return colonnes
    return noms.map((nom) => colonnes.find((c) => c.nom === nom)).filter(Boolean)
  }, [definitionSegment, referentiel.colonnesTableau, colonnes])

  // La page est bornée au calcul plutôt que remise à zéro dans un effet :
  // si un filtre réduit la liste alors qu'on est en page 4, on retombe
  // simplement sur la dernière page existante.
  const nbPages = Math.max(1, Math.ceil(visibles.length / TAILLE_PAGE))
  const pageCourante = Math.min(page, nbPages)
  const premierIndex = (pageCourante - 1) * TAILLE_PAGE
  const lignes = visibles.slice(premierIndex, premierIndex + TAILLE_PAGE)

  /**
   * La sélection porte sur le résultat filtré, jamais sur la page affichée :
   * cocher l'en-tête après une recherche doit prendre les 12 résultats, pas
   * les 10 visibles — sinon on croit avoir tout traité.
   */
  const idsVisibles = useMemo(() => visibles.map((e) => e.id), [visibles])
  const nbSelectionnes = idsVisibles.filter((id) => selection.has(id)).length
  const toutSelectionne = idsVisibles.length > 0 && nbSelectionnes === idsVisibles.length

  const basculerSelection = (id) =>
    setSelection((s) => {
      const suivant = new Set(s)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })

  const basculerToutSelectionner = () =>
    setSelection(toutSelectionne ? new Set() : new Set(idsVisibles))

  const viderSelection = () => setSelection(new Set())

  /** Applique une modification au lot sélectionné, puis relâche la sélection. */
  const agirEnLot = async (champs, message) => {
    const ids = idsVisibles.filter((id) => selection.has(id))
    if (ids.length === 0) return
    try {
      await modifierEnLot(cle, ids, champs)
      toast.success(`${ids.length} ${message}`)
      viderSelection()
      await recharger()
    } catch (e) {
      toast.error(`Opération impossible : ${messageErreur(e)}`)
    }
  }

  const ouvrirCreation = () => {
    setEntreeEditee(null)
    setPanneauOuvert(true)
  }

  const ouvrirModification = (entree) => {
    setEntreeEditee(entree)
    setPanneauOuvert(true)
  }

  const enregistrer = async (valeurs, cible) => {
    try {
      if (cible) {
        await modifierEntree(cle, cible.id, valeurs)
        toast.success(`${nommer(valeurs)} mis à jour`)
      } else {
        // Les codes séquentiels sont attribués ici, une fois le type connu.
        const complet = referentiel.genererCode
          ? { ...valeurs, code: referentiel.genererCode(valeurs, entrees) }
          : valeurs
        await creerEntree(cle, complet)
        toast.success(`${nommer(valeurs)} ajouté`)
        // L'entrée est ajoutée en fin de liste : on efface la recherche et on
        // saute à la dernière page, sinon la création resterait invisible.
        setRecherche('')
        // On compte dans la vue où la nouvelle entrée va apparaître.
        const dansLaVue = predicatSegment(segments, definitionSegment)
        const nbApres =
          entrees.filter((e) => (afficherInactifs || e.actif) && dansLaVue(e)).length + 1
        setPage(Math.ceil(nbApres / TAILLE_PAGE))
      }
      setPanneauOuvert(false)
      await recharger()
    } catch (e) {
      // Erreurs de saisie renvoyées par le serveur : le formulaire les pose
      // sous les champs concernés, comme les siennes.
      if (erreursDeChamps(e)) throw e
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
    }
  }

  const supprimer = async (entree) => {
    // La suppression est définitive : on confirme avant d'agir.
    if (!window.confirm(`Supprimer « ${nommer(entree)} » ? Cette action est définitive.`)) return
    try {
      await supprimerEntree(cle, entree.id)
      toast.info(`${nommer(entree)} supprimé`)
      await recharger()
    } catch (e) {
      toast.error(`Suppression impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Actions propres à un référentiel, déclarées dans sa config
   * (`actionsLigne`) — valider une demande d'agrément, par exemple. Chacune
   * peut demander confirmation, puis renvoie le message à afficher. La liste
   * est rechargée ensuite : l'action a pu faire sortir la ligne de la vue.
   */
  const executerActionLigne = async (action, entree) => {
    if (action.confirmer && !window.confirm(action.confirmer(entree))) return
    try {
      toast.success(await action.executer(entree))
      await recharger()
    } catch (e) {
      toast.error(`${action.libelle} impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Outils Excel (cf. excel.js). L'export écrit la vue affichée — segment,
   * recherche et filtres compris — avec tous les champs de la fiche. L'import
   * lit un fichier au même format, le fait valider à blanc par le serveur, en
   * annonce le bilan, puis l'enregistre sur confirmation ; une seule ligne en
   * erreur et rien n'est enregistré.
   */
  const champFichier = useRef(null)

  const exporter = async () => {
    if (!visibles.length) {
      toast.info('Rien à exporter : la vue est vide')
      return
    }
    try {
      const nb = await exporterExcel(referentiel, visibles, entrees)
      toast.success(`${nb} ligne${nb > 1 ? 's' : ''} exportée${nb > 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Export des seules lignes cochées, dans l'ordre de la liste — action de lot
   * `{ type: 'export' }`. La sélection est relâchée ensuite, comme après toute
   * action de lot.
   */
  const exporterSelection = async () => {
    const cochees = visibles.filter((e) => selection.has(e.id))
    if (!cochees.length) return
    try {
      const nb = await exporterExcel(referentiel, cochees, entrees)
      toast.success(`${nb} ligne${nb > 1 ? 's' : ''} exportée${nb > 1 ? 's' : ''}`)
      viderSelection()
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  const importer = async (fichier) => {
    try {
      const { lignes: aImporter, ignorees } = await lireExcel(fichier, referentiel, entrees)
      if (!aImporter.length) {
        toast.info('Aucune ligne à importer dans ce fichier')
        return
      }
      const essai = await importerEntrees(cle, aImporter, { simulation: true })
      const annonce = [
        `${essai.crees} création(s), ${essai.modifies} mise(s) à jour.`,
        ignorees.length ? `Colonnes ignorées : ${ignorees.join(', ')}.` : '',
        'Enregistrer ces changements ?',
      ]
        .filter(Boolean)
        .join('\n\n')
      if (!window.confirm(annonce)) return
      const bilan = await importerEntrees(cle, aImporter)
      toast.success(`Import terminé : ${bilan.crees} création(s), ${bilan.modifies} mise(s) à jour`)
      await recharger()
    } catch (e) {
      // Un import refusé renvoie son rapport ligne par ligne : il se lit en
      // entier, un toast le tronquerait.
      if (e.donnees?.erreurs?.length) window.alert(rapportErreurs(e.donnees, referentiel))
      else toast.error(`Import impossible : ${messageErreur(e)}`)
    }
  }

  const nbColonnes = colonnesTableau.length + 1 + (referentiel.selection ? 1 : 0)

  /**
   * Barre compacte (`barreCompacte`) : le total et le bouton de création
   * rejoignent la barre d'outils, sur une seule ligne — total, recherche,
   * outils, puis le bouton poussé à droite. Pour une liste sans titre, où une
   * ligne d'en-tête ne porterait plus que le bouton.
   */
  const barreCompacte = Boolean(referentiel.barreCompacte)
  const creation = !referentiel.sansCreation
  const creationEnTete = creation && !barreCompacte
  // En barre compacte, le total se range à côté du titre quand la liste en a
  // un. Sans titre, il garde sa ligne au-dessus de la barre d'outils, comme
  // partout ailleurs.
  const statsAuTitre = barreCompacte && !referentiel.sansTitre && Boolean(referentiel.stats)
  // Le sélecteur de segments ouvre d'ordinaire la barre d'outils. Un
  // référentiel peut l'envoyer à droite (`segmentsADroite`), avec les outils :
  // recherche et filtres restent alors seuls à gauche.
  const segmentsADroite = Boolean(segments && referentiel.segmentsADroite)
  const selecteurSegments = segments && (
    <div className="ddb-segments" role="tablist">
      {segments.valeurs.map((segment) => (
        <button
          type="button"
          role="tab"
          key={segment.valeur}
          aria-selected={segment.valeur === segmentActif}
          className={`ddb-segment${segment.valeur === segmentActif ? ' ddb-segment-actif' : ''}`}
          onClick={() => {
            setSegmentActif(segment.valeur)
            setPage(1)
          }}
        >
          {segment.libelle}
        </button>
      ))}
    </div>
  )
  const boutonNouveau = (
    <button type="button" className="ddb-bouton-nouveau" onClick={ouvrirCreation}>
      <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
      {definitionSegment?.nouveau || nouveau}
    </button>
  )

  return (
    <div className="ddb-referentiel">
      {/* L'en-tête porte le titre et le bouton de création. Une liste montée
          sous une page qui se titre déjà peut taire le sien (`sansTitre`) ;
          en barre compacte, le bouton descend dans la barre d'outils. Sans
          titre ni bouton, l'en-tête n'a plus rien à porter et disparaît
          plutôt que de laisser un blanc au-dessus de la liste. */}
      {(!referentiel.sansTitre || creationEnTete) && (
        <div className="ddb-referentiel-entete">
          {!referentiel.sansTitre && <h2 className="ddb-referentiel-titre">{libelle}</h2>}
          {statsAuTitre && (
            <span className="ddb-bandeau-stats ddb-stats-titre">{referentiel.stats(visibles)}</span>
          )}
          {creationEnTete && boutonNouveau}
        </div>
      )}

      {/* Bandeau de synthèse : totaux de la vue, sur leur propre ligne au-dessus
          de la barre d'outils — sauf quand ils sont déjà accolés au titre. */}
      {referentiel.stats && !statsAuTitre && (
        <div className="ddb-bandeau-stats">{referentiel.stats(visibles)}</div>
      )}

      {/* Barre contextuelle : elle ne paraît qu'une fois une ligne cochée, et
          remplace la barre d'outils plutôt que de s'y ajouter. */}
      {nbSelectionnes > 0 ? (
        <div className="ddb-barre-selection">
          <span className="ddb-selection-compte">
            {nbSelectionnes} {nbSelectionnes > 1 ? 'sélectionnés' : 'sélectionné'}
          </span>
          <div className="ddb-selection-actions">
            {/* Actions de lot déclarées par le référentiel (`actionsLot`) : les
                médicaments s'excluent et se réintègrent, les conventions des
                fournisseurs se suspendent et se rétablissent. Chacune applique
                ses `champs` à toute la sélection, après confirmation si elle
                le demande — sauf `type: 'export'`, qui écrit les lignes
                cochées dans un fichier Excel sans rien modifier. */}
            {(referentiel.actionsLot || []).map((action) => (
              <button
                key={action.libelle}
                type="button"
                className={`ddb-action-lot${action.danger ? ' ddb-action-lot-danger' : ''}`}
                onClick={() => {
                  if (action.type === 'export') {
                    exporterSelection()
                    return
                  }
                  if (action.confirmer && !window.confirm(action.confirmer(nbSelectionnes))) return
                  agirEnLot(action.champs, action.message)
                }}
              >
                {action.libelle}
              </button>
            ))}
            <button type="button" className="ddb-action-lot-annuler" onClick={viderSelection}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`ddb-barre-outils${referentiel.champsSoulignes ? ' ddb-barre-soulignee' : ''}`}
        >
          {!segmentsADroite && selecteurSegments}

          <CInputGroup className="ddb-recherche">
            {/* Le fond est posé en feuille de styles et non par `bg-white` :
                l'utilitaire Bootstrap est en !important, et rien de local ne
                peut alors le reprendre. */}
            <CInputGroupText className="border-end-0">
              <CIcon icon={cilSearch} />
            </CInputGroupText>
            <CFormInput
              className="border-start-0"
              placeholder={referentiel.placeholderRecherche || 'Rechercher…'}
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value)
                setPage(1)
              }}
            />
          </CInputGroup>

          {/* Filtres déclarés : la première option vide vaut « tous », c'est
              l'état de repos et il n'a donc pas à être choisi. Un filtre qui
              déclare une `etiquette` la porte au-dessus de sa liste — c'est
              alors elle qui la nomme, et non plus l'`aria-label`. */}
          {filtresDeclares.map((filtre) => {
            const liste = (
              <select
                key={filtre.champ}
                className="ddb-filtre"
                aria-label={filtre.etiquette ? undefined : filtre.libelle}
                value={filtres[filtre.champ] || ''}
                onChange={(e) => {
                  setFiltres((f) => ({ ...f, [filtre.champ]: e.target.value }))
                  setPage(1)
                }}
              >
                <option value="">{filtre.libelle}</option>
                {optionsDe(filtre).map((option) => (
                  <option key={option.valeur} value={option.valeur}>
                    {option.libelle}
                  </option>
                ))}
              </select>
            )
            return filtre.etiquette ? (
              <label key={filtre.champ} className="ddb-filtre-groupe">
                <span className="ddb-filtre-etiquette">{filtre.etiquette}</span>
                {liste}
              </label>
            ) : (
              liste
            )
          })}

          {!activiteParSegments && !etatEnColonne && nbInactifs > 0 && (
            <CFormSwitch
              className="ddb-switch"
              id={`inactifs-${cle}`}
              label={`Afficher les inactifs (${nbInactifs})`}
              checked={afficherInactifs}
              onChange={(e) => {
                setAfficherInactifs(e.target.checked)
                setPage(1)
              }}
            />
          )}

          {/* Outils de fin de barre. En barre compacte, le bouton de création
              les rejoint : outils et bouton forment un seul groupe, accolés et
              poussés à droite (cf. donnees-de-base.scss). */}
          {((referentiel.outils || []).length > 0 ||
            (barreCompacte && creation) ||
            segmentsADroite) && (
            <div
              className={`ddb-barre-actions${
                barreCompacte || segmentsADroite ? ' ddb-barre-actions-droite' : ''
              }`}
            >
              {segmentsADroite && selecteurSegments}
              {(referentiel.outils || []).map((nom) => {
                const outil = OUTILS[nom]
                if (!outil) return null
                return (
                  <button
                    type="button"
                    key={nom}
                    className={`ddb-outil ddb-outil-${nom}`}
                    onClick={nom === 'export' ? exporter : () => champFichier.current?.click()}
                  >
                    <CIcon icon={outil.icone} className="ddb-outil-icone" />
                    {outil.libelle}
                  </button>
                )
              })}
              {(referentiel.outils || []).includes('import') && (
                <input
                  ref={champFichier}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={(e) => {
                    const fichier = e.target.files?.[0]
                    // Vidé aussitôt : choisir de nouveau le même fichier —
                    // une fois corrigé — doit relancer l'import.
                    e.target.value = ''
                    if (fichier) importer(fichier)
                  }}
                />
              )}
              {barreCompacte && creation && boutonNouveau}
            </div>
          )}
        </div>
      )}

      <div className="ddb-tableau-conteneur">
        <CTable hover responsive className="ddb-tableau align-middle mb-0">
          <CTableHead>
            <CTableRow>
              {referentiel.selection && (
                <CTableHeaderCell style={{ width: '44px' }} className="ddb-cellule-case">
                  <input
                    type="checkbox"
                    checked={toutSelectionne}
                    ref={(el) => {
                      // État indéterminé : une partie seulement du résultat filtré.
                      if (el) el.indeterminate = nbSelectionnes > 0 && !toutSelectionne
                    }}
                    onChange={basculerToutSelectionner}
                    aria-label="Tout sélectionner"
                  />
                </CTableHeaderCell>
              )}
              {colonnesTableau.map((col) => (
                <CTableHeaderCell
                  key={col.nom}
                  style={col.largeur ? { width: col.largeur } : undefined}
                  className={col.aligne === 'droite' ? 'text-end' : undefined}
                >
                  {col.libelle}
                </CTableHeaderCell>
              ))}
              <CTableHeaderCell style={{ width: '110px' }} className="text-end">
                Actions
              </CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {chargement && (
              <CTableRow>
                <CTableDataCell colSpan={nbColonnes} className="ddb-etat-vide">
                  <CSpinner size="sm" className="me-2" />
                  Chargement…
                </CTableDataCell>
              </CTableRow>
            )}

            {!chargement && visibles.length === 0 && (
              <LigneVide
                nbColonnes={nbColonnes}
                recherche={recherche}
                nouveau={nouveau}
                // Un référentiel peut retirer le bouton du tableau vide quand
                // celui de l'en-tête, juste au-dessus, suffit.
                onCreer={
                  referentiel.sansCreation || referentiel.sansCreationTableauVide
                    ? null
                    : ouvrirCreation
                }
              />
            )}

            {!chargement &&
              lignes.map((entree) => (
                <CTableRow
                  key={entree.id}
                  className={`ddb-ligne${entree.actif ? '' : ' ddb-ligne-inactive'}${
                    selection.has(entree.id) ? ' ddb-ligne-selectionnee' : ''
                  }`}
                  onClick={() => ouvrirModification(entree)}
                >
                  {referentiel.selection && (
                    <CTableDataCell
                      className="ddb-cellule-case"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selection.has(entree.id)}
                        onChange={() => basculerSelection(entree.id)}
                        aria-label={`Sélectionner ${nommer(entree)}`}
                      />
                    </CTableDataCell>
                  )}
                  {colonnesTableau.map((col, index) => (
                    <CTableDataCell
                      key={col.nom}
                      className={`${col.mono ? 'ddb-mono' : ''}${
                        col.aligne === 'droite' ? ' text-end' : ''
                      }`}
                    >
                      {col.type === 'statut' ? (
                        // État multi-valeurs (participants) : badge dont la
                        // couleur suit la valeur.
                        <CBadge
                          color={COULEUR_STATUT[entree[col.nom]] || 'secondary'}
                          className="fw-normal"
                        >
                          {entree[col.nom]}
                        </CBadge>
                      ) : col.type === 'etat' ? (
                        <CBadge
                          color={entree[col.nom] ? 'success' : 'secondary'}
                          className="fw-normal"
                        >
                          {entree[col.nom] ? 'Actif' : 'Suspendu'}
                        </CBadge>
                      ) : col.type === 'booleen' ? (
                        // Une colonne de cases vides ne se lit pas : seule la
                        // ligne concernée porte une marque.
                        entree[col.nom] && (
                          <CBadge color="warning" className="fw-normal">
                            Exclu
                          </CBadge>
                        )
                      ) : (
                        <span className={index === 0 ? 'fw-semibold' : undefined}>
                          {/* Colonne calculée (âge, compteurs…) ; sinon nombre
                              formaté, valeur brute (`afficherCode`), ou code
                              résolu en intitulé. */}
                          {col.valeurTableau
                            ? col.valeurTableau(entree, entrees)
                            : col.type === 'number'
                              ? formaterNombre(entree[col.nom])
                              : col.afficherCode
                                ? entree[col.nom]
                                : libelleValeur(col, entree[col.nom], entree, entrees)}
                        </span>
                      )}
                      {index === 0 && !entree.actif && !etatEnColonne && (
                        <CBadge color="secondary" className="ms-2 fw-normal">
                          {etat.inactif}
                        </CBadge>
                      )}
                    </CTableDataCell>
                  ))}
                  <CTableDataCell className="text-end" onClick={(e) => e.stopPropagation()}>
                    {(referentiel.actionsLigne || []).map((action) => (
                      <CTooltip key={action.cle} content={action.libelle}>
                        <CButton
                          color="light"
                          size="sm"
                          className={`ddb-action ${action.classe || ''}`}
                          aria-label={`${action.libelle} : ${nommer(entree)}`}
                          onClick={() => executerActionLigne(action, entree)}
                        >
                          <CIcon icon={action.icone} />
                        </CButton>
                      </CTooltip>
                    ))}
                    <CTooltip content="Modifier">
                      <CButton
                        color="light"
                        size="sm"
                        className="ddb-action"
                        onClick={() => ouvrirModification(entree)}
                      >
                        <CIcon icon={cilPencil} />
                      </CButton>
                    </CTooltip>
                    <CTooltip content="Supprimer">
                      <CButton
                        color="light"
                        size="sm"
                        className="ddb-action ddb-action-danger"
                        onClick={() => supprimer(entree)}
                      >
                        <CIcon icon={cilTrash} />
                      </CButton>
                    </CTooltip>
                  </CTableDataCell>
                </CTableRow>
              ))}
          </CTableBody>
        </CTable>
      </div>

      {/* Le pied ne porte plus que la pagination : sur une seule page, il
          n'aurait rien à montrer et ne laisserait qu'un blanc sous le tableau. */}
      {!chargement && nbPages > 1 && (
        <div className="ddb-pied">
          <Pagination page={pageCourante} nbPages={nbPages} onChange={setPage} />
        </div>
      )}

      <FormulaireEntree
        referentiel={referentiel}
        entree={entreeEditee}
        entrees={entrees}
        // Une création lancée depuis « Services » arrive avec le type déjà posé.
        valeursDefaut={segments?.champ ? { [segments.champ]: segmentActif } : undefined}
        titreCreation={definitionSegment?.nouveau}
        visible={panneauOuvert}
        onFermer={() => setPanneauOuvert(false)}
        onEnregistrer={enregistrer}
      />
    </div>
  )
}

/** Ligne d'état vide : distingue « référentiel vide » de « recherche sans résultat ». */
const LigneVide = ({ nbColonnes, recherche, nouveau, onCreer }) => (
  <CTableRow>
    <CTableDataCell colSpan={nbColonnes} className="ddb-etat-vide">
      <CIcon icon={cilInbox} size="xl" className="d-block mx-auto mb-2 text-body-secondary" />
      {recherche ? (
        <>
          Aucun résultat pour <strong>« {recherche} »</strong>
        </>
      ) : (
        <>
          <div className="mb-2">Aucune entrée</div>
          {onCreer && (
            <button type="button" className="ddb-bouton-nouveau" onClick={onCreer}>
              <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
              {nouveau}
            </button>
          )}
        </>
      )}
    </CTableDataCell>
  </CTableRow>
)

export default Referentiel
