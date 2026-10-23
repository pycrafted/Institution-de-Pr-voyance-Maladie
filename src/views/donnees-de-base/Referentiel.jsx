/**
 * Affichage générique d'un référentiel : barre d'outils + tableau.
 *
 * Ce composant ne connaît aucun référentiel en particulier - il lit sa
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
  cilActionUndo,
  cilBan,
  cilPencil,
  cilPlus,
  cilSearch,
} from '@coreui/icons'

import {
  basculerActivation,
  creerEntree,
  importerEntrees,
  listerEntrees,
  modifierEnLot,
  modifierEntree,
} from '../../services/referentiels'
import { toast } from '../../services/toast'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { useConfirmation } from './Confirmation'
import { useEcouteChangements } from './ecouteChangements'
import { exporterExcel, lireExcel, rapportErreurs } from './excel'
import FormulaireEntree, { CorpsFormulaire } from './FormulaireEntree'
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
  // Cycle de vie d'une facture (Traitements).
  Reçue: 'secondary',
  'En cours de traitement': 'warning',
  Traitée: 'info',
  Comptabilisée: 'primary',
  Payée: 'success',
  // États de règlement (Traitements → Règlements, §17).
  'Non Echue': 'secondary',
  Echue: 'danger',
  Reglée: 'success',
  Annulée: 'dark',
  // États du remboursement (Traitements → Remboursement).
  'Non réglé': 'secondary',
  Réglé: 'success',
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
 * Œil « Voir la fiche » : le jeu d'icônes libres de CoreUI n'a que l'œil barré
 * (« masquer »), qui dirait le contraire. Dessiné ici au même format.
 */
const ICONE_OEIL = [
  '512 512',
  "<path fill='var(--ci-primary-color, currentColor)' d='M256 112C144 112 55 187 16 256c39 69 128 144 240 144s201-75 240-144c-39-69-128-144-240-144zm0 248c-83 0-152-52-187-104 35-52 104-104 187-104s152 52 187 104c-35 52-104 104-187 104z'/><circle fill='var(--ci-primary-color, currentColor)' cx='256' cy='256' r='64'/>",
]

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

/**
 * Les stats d'une vue, en pastilles distinctes : « Total Participants: 8 »,
 * « Epoux(se): 6 », « Enfant: 8 »… une par segment (séparés par « - » dans le
 * texte fourni par la config). Partagé avec les pages à onglets, qui posent ces
 * pastilles à côté de leur titre.
 */
export const PastillesStats = ({ segments, className }) =>
  segments && segments.length ? (
    <span className={`ddb-stats-groupe${className ? ` ${className}` : ''}`}>
      {segments.map((seg, i) => (
        <span key={i} className="ddb-stats-pastille">
          {seg}
        </span>
      ))}
    </span>
  ) : null

/** Découpe le texte de stats (« A - B - C ») en segments pour les pastilles. */
const segmentsStats = (texte) => (texte ? texte.split(' - ') : [])

const Referentiel = ({ referentiel, onStats }) => {
  const { cle, libelle, colonnes, nouveau } = referentiel

  /**
   * Segments (Tous / Epouse / Enfant…). `valeurs` accepte une fonction : les
   * onglets de « Familles » se lisent dans le référentiel des types de
   * bénéficiaire plutôt que d'en recopier la liste - une liste recopiée finit
   * par ne plus dire la même chose que le référentiel, et un type ajouté
   * n'aurait alors aucun onglet. Évalué une fois au montage : les référentiels
   * sont en mémoire depuis le démarrage (cf. prechargerReferentiels).
   */
  const valeursSegments = referentiel.segments?.valeurs
  const segments = useMemo(
    () =>
      referentiel.segments && {
        ...referentiel.segments,
        valeurs: typeof valeursSegments === 'function' ? valeursSegments() : valeursSegments,
      },
    [referentiel.segments, valeursSegments],
  )
  const TAILLE_PAGE = referentiel.taillePage || TAILLE_PAGE_PAR_DEFAUT
  // Fiche en lecture propre au référentiel (`fiche`) - un composant, ouvert
  // par l'œil de chaque ligne. Majuscule : React le monte comme un composant.
  const Fiche = referentiel.fiche
  // Saisie propre au référentiel (`editeur`) - le bon optique se saisit sur le
  // bon lui-même, dans une fenêtre modale. Mêmes propriétés que le panneau
  // latéral, qu'il remplace ; sans lui, c'est ce panneau qui sert.
  const Editeur = referentiel.editeur || FormulaireEntree

  /**
   * Certains référentiels expriment déjà l'activité dans leurs segments
   * (Tous / Actifs / Suspendus). Ils ne portent alors pas l'interrupteur
   * « Afficher les inactifs » : les deux diraient la même chose, et pire, se
   * contrediraient - « Suspendus » ne montrerait rien tant que l'interrupteur
   * resterait fermé, puisque le filtre d'activité s'applique après le segment.
   */
  const activiteParSegments = Boolean(segments?.activite)

  /**
   * Cycle de vie à plusieurs états, en colonne : le dossier d'un participant
   * va de « En Attente » à « Radié », et cette suite dit à elle seule où il
   * en est. Une désactivation posée à côté aurait été un second cycle,
   * invisible dans le tableau - un participant « Actif » aurait pu disparaître
   * de la liste sans qu'aucune colonne ne l'explique. Là où l'état est en
   * colonne, il est donc la seule sortie : ni bouton « Désactiver », ni
   * interrupteur « Afficher les inactifs ».
   */
  const statutEnColonne = colonnes.some((col) => col.type === 'statut')

  /**
   * Un référentiel peut exposer l'état (Actif / Suspendu) comme une colonne et
   * un champ du formulaire - c'est le cas des adhérents. On montre alors toutes
   * les lignes, la colonne disant leur état, et on retire l'interrupteur
   * « Afficher les inactifs » qui ferait double emploi.
   */
  const etatEnColonne = statutEnColonne || colonnes.some((col) => col.type === 'etat')

  // Filtres facultatifs déclarés par le référentiel : une liste déroulante par
  // dimension, à côté de la recherche. Un fournisseur de soins se cherche
  // autant par sa spécialité que par son nom.
  const filtresDeclares = referentiel.filtres || []

  /**
   * Comment nommer une entrée dans un message ou un libellé accessible.
   * Par défaut son intitulé ; un référentiel dont le nom se compose de
   * plusieurs champs - prénoms et nom d'un participant - donne sa formule.
   */
  // Le libellé étant facultatif, une fiche sans libellé se nomme par son code.
  const nommer = referentiel.nommer || ((e) => e.libelle || e.code || '')
  const nomDe = (e) => String(nommer(e) || '').trim()
  // Dans une phrase : « CLINIQUE X », ou « cette fiche » si elle n'a ni nom ni
  // code - aucun champ n'étant obligatoire.
  const designer = (e) => (nomDe(e) ? `« ${nomDe(e)} »` : 'cette fiche')

  /**
   * Vocabulaire de l'activation. Une nomenclature se « désactive », une
   * convention avec un prestataire se « suspend » : le référentiel peut
   * remplacer ces mots, sans quoi le tableau dirait « Inactif » là où le
   * sélecteur juste au-dessus dit « Suspendus ».
   */
  const etat = {
    actif: 'Actif',
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
  // Un filtre peut partir d'une valeur (`defaut`) : l'exercice en cours, par
  // exemple, comme l'application d'origine.
  const [filtres, setFiltres] = useState(() =>
    Object.fromEntries(
      filtresDeclares
        .filter((f) => f.defaut !== undefined)
        .map((f) => [f.champ, typeof f.defaut === 'function' ? f.defaut() : f.defaut]),
    ),
  )
  const [afficherInactifs, setAfficherInactifs] = useState(false)
  const [page, setPage] = useState(1)
  const [panneauOuvert, setPanneauOuvert] = useState(false)
  // Remonte le formulaire de création docké après chaque ajout (le vide).
  const [resetDockee, setResetDockee] = useState(0)
  // Ligne chargée dans la card dockée pour modification (clic sur une ligne).
  // Nulle = la card est en création. C'est la façon de modifier des référentiels
  // à card dockée : pas de crayon, on clique la ligne (comme l'application
  // d'origine, cf. Fournisseurs Divers).
  const [entreeDockee, setEntreeDockee] = useState(null)
  const [entreeEditee, setEntreeEditee] = useState(null)
  const [codePropose, setCodePropose] = useState('')
  // Fiche en lecture ouverte par l'œil d'une ligne. L'entrée survit à la
  // fermeture : la fenêtre s'efface en fondu sans se vider sous les yeux.
  const [ficheOuverte, setFicheOuverte] = useState(false)
  const [entreeVue, setEntreeVue] = useState(null)
  // Ajout, modification, suppression, actions de lot, import : tout ce qui
  // écrit se confirme dans une fenêtre modale (cf. Confirmation.jsx).
  const [demanderConfirmation, modaleConfirmation, confirmationOuverte] = useConfirmation()
  const [selection, setSelection] = useState(() => new Set())

  /**
   * `silencieux` : rechargement de fond (cf. ecouteChangements.js). Ni
   * indicateur de chargement - qui remplacerait le tableau par une ligne
   * « Chargement… », ferait sauter la page et perdrait le défilement - ni
   * message d'erreur : l'utilisateur n'a rien demandé, il n'a pas à être
   * dérangé si le réseau hoquette.
   */
  const recharger = useCallback(
    async ({ silencieux = false } = {}) => {
      try {
        if (!silencieux) setChargement(true)
        setEntrees(await listerEntrees(cle))
      } catch (e) {
        if (!silencieux) toast.error(`Chargement impossible : ${messageErreur(e)}`)
      } finally {
        if (!silencieux) setChargement(false)
      }
    },
    [cle],
  )

  // La page monte ce composant avec une `key` sur la clé du référentiel :
  // changer de référentiel le remonte, donc la vue repart naturellement propre.
  useEffect(() => {
    // Les états ne sont posés qu'après la réponse du serveur (recharger est
    // asynchrone), jamais pendant le rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recharger()
  }, [recharger])

  const rechargerEnFond = useCallback(() => recharger({ silencieux: true }), [recharger])

  /**
   * L'écran est-il en cours d'usage ? Formulaire ou fiche ouverts, demande de
   * confirmation affichée, lignes cochées : dans tous ces cas, un rechargement
   * viendrait sous les doigts de l'utilisateur - il attend. (Les écritures en
   * vol sont vues directement par l'écoute, cf. services/api.js.)
   */
  const ecranOccupe = panneauOuvert || ficheOuverte || confirmationOuverte || selection.size > 0

  // Mise à jour automatique du tableau : un bon émis depuis le mobile, ou par
  // un collègue, paraît ici en quelques secondes. Active pour tout référentiel
  // servi par l'API ; les rares écrans qui n'en sont pas se taisent d'eux-mêmes.
  useEcouteChangements({ cle, occupe: ecranOccupe, recharger: rechargerEnFond })

  // Les lignes qui arrivent d'elles-mêmes ne sont plus teintées : le tableau
  // se met à jour en silence. L'écoute de fond, elle, continue de tourner
  // (cf. useEcouteChangements ci-dessus).

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
   * les 10 visibles - sinon on croit avoir tout traité.
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

  const ouvrirCreation = async () => {
    setEntreeEditee(null)
    // Numéro tenu par le serveur (`proposerCode`, demandes d'agrément) : demandé
    // à l'ouverture, pour que le formulaire le montre prérempli. S'il ne répond
    // pas, le champ s'ouvre vide et se saisit à la main.
    let code = ''
    if (referentiel.proposerCode) {
      try {
        code = await referentiel.proposerCode()
      } catch (e) {
        console.error(e)
      }
    }
    setCodePropose(code)
    setPanneauOuvert(true)
  }

  const ouvrirModification = (entree) => {
    setEntreeEditee(entree)
    setPanneauOuvert(true)
  }

  /** Demandée par le formulaire avant l'envoi : ajout ou modification. */
  const confirmerEnregistrement = (valeurs, cible) =>
    demanderConfirmation(
      cible
        ? {
            titre: 'Confirmer la modification',
            message: `Enregistrer les modifications de ${designer({ ...cible, ...valeurs })} ?`,
            confirmer: 'Enregistrer',
          }
        : {
            titre: 'Confirmer l’ajout',
            message: `Ajouter ${designer(valeurs)} ?`,
            confirmer: 'Ajouter',
          },
    )

  const enregistrer = async (valeurs, cible) => {
    // Aucun champ n'est obligatoire. Le champ qui partage la table en onglets
    // (le type d'une entité de structure), laissé vide, reprend celui de la
    // fiche ou de l'onglet ouvert : sans lui, la fiche n'apparaîtrait dans
    // aucun onglet.
    const saisie =
      segments?.champ && !valeurs[segments.champ]
        ? { ...valeurs, [segments.champ]: cible?.[segments.champ] || segmentActif }
        : valeurs
    try {
      if (cible) {
        const modifiee = await modifierEntree(cle, cible.id, saisie)
        toast.success(`${nomDe(modifiee || saisie) || 'Fiche'} mis à jour`)
      } else {
        // Les codes séquentiels sont attribués ici, une fois le type connu -
        // sauf si le formulaire en montrait déjà un (adhérents) : on garde
        // alors celui que l'utilisateur a vu, et le compte qui en découle.
        // Sans numérotation à l'écran, un code vide est donné par le serveur.
        const complet =
          referentiel.genererCode && !saisie.code
            ? { ...saisie, code: referentiel.genererCode(saisie, entrees) }
            : saisie
        const creee = await creerEntree(cle, complet)
        toast.success(`${nomDe(creee || complet) || 'Fiche'} ajouté`)
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

  // Enregistrement depuis le panneau de création docké (données de base) :
  // même traitement que le formulaire glissant, mais le panneau ne se ferme
  // pas - il se vide pour la saisie suivante, comme l'application d'origine.
  // Si le serveur refuse la saisie, `enregistrer` relance l'erreur : elle se
  // pose sous les champs et le panneau garde ce qui était saisi.
  const enregistrerDockee = async (valeurs, cible) => {
    await enregistrer(valeurs, cible)
    // Retour en création : la card se vide, plus aucune ligne n'est sélectionnée.
    setEntreeDockee(null)
    setResetDockee((n) => n + 1)
  }

  /**
   * Désactiver ou réactiver une fiche - la seule sortie prévue.
   *
   * On ne supprime jamais une entrée : les dossiers déjà saisis la désignent,
   * et l'effacer ferait retomber leur libellé sur un code nu. La désactivation
   * la retire des choix à la saisie et la laisse lisible partout ailleurs.
   * Le serveur applique la même règle (cf. ReferentielViewSet.destroy).
   *
   * La réactivation ne demande rien : elle ne retire rien à personne.
   */
  const basculerActif = async (entree) => {
    const desactivation = entree.actif !== false
    if (desactivation) {
      const confirme = await demanderConfirmation({
        titre: `Confirmer : ${etat.desactiver.toLowerCase()}`,
        message:
          `${etat.desactiver} ${designer(entree)} ? Elle ne sera plus proposée à la saisie ; ` +
          'les fiches qui la portent déjà restent inchangées.',
        confirmer: etat.desactiver,
        danger: true,
      })
      if (!confirme) return
    }
    try {
      await basculerActivation(cle, entree.id)
      toast.info(`${nomDe(entree) || 'Fiche'} ${desactivation ? etat.desactive : etat.reactive}`)
      await recharger()
    } catch (e) {
      toast.error(`${etat.desactiver} : impossible - ${messageErreur(e)}`)
    }
  }

  /**
   * Actions propres à un référentiel, déclarées dans sa config
   * (`actionsLigne`) - valider une demande d'agrément, par exemple. Chacune
   * peut demander confirmation, puis renvoie le message à afficher. La liste
   * est rechargée ensuite : l'action a pu faire sortir la ligne de la vue.
   */
  const executerActionLigne = async (action, entree) => {
    if (action.confirmer) {
      const confirme = await demanderConfirmation({
        titre: action.libelle,
        message: action.confirmer(entree),
        confirmer: action.libelle,
        danger: action.danger,
      })
      if (!confirme) return
    }
    try {
      // Une action qui se montre d'elle-même - l'aperçu d'un document
      // imprimé - n'a rien à ajouter : pas de message.
      const message = await action.executer(entree)
      if (typeof message === 'string' && message.trim()) toast.success(message)
      await recharger()
    } catch (e) {
      toast.error(`${action.libelle} impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Outils Excel (cf. excel.js). L'export écrit la vue affichée - segment,
   * recherche et filtres compris - avec tous les champs de la fiche. L'import
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
   * Export des seules lignes cochées, dans l'ordre de la liste - action de lot
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
      const confirme = await demanderConfirmation({
        titre: 'Confirmer l’import',
        message: annonce,
        confirmer: 'Importer',
      })
      if (!confirme) return
      const bilan = await importerEntrees(cle, aImporter)
      toast.success(`Import terminé : ${bilan.crees} création(s), ${bilan.modifies} mise(s) à jour`)
      await recharger()
    } catch (e) {
      // Un import refusé renvoie son rapport ligne par ligne : il se lit en
      // entier, un toast le tronquerait.
      if (e.donnees?.erreurs?.length) {
        demanderConfirmation({
          titre: 'Import refusé',
          message: rapportErreurs(e.donnees, referentiel),
          confirmer: 'Fermer',
          annuler: null,
          large: true,
        })
      } else toast.error(`Import impossible : ${messageErreur(e)}`)
    }
  }

  const nbColonnes = colonnesTableau.length + 1 + (referentiel.selection ? 1 : 0)

  /**
   * Barre compacte (`barreCompacte`) : le total et le bouton de création
   * rejoignent la barre d'outils, sur une seule ligne - total, recherche,
   * outils, puis le bouton poussé à droite. Pour une liste sans titre, où une
   * ligne d'en-tête ne porterait plus que le bouton.
   */
  const barreCompacte = Boolean(referentiel.barreCompacte)
  const creation = !referentiel.sansCreation
  const creationEnTete = creation && !barreCompacte
  // Formulaire de création accolé à droite de la grille, toujours visible,
  // comme l'application d'origine (au lieu du panneau glissant) - réservé aux
  // référentiels simples de données de base (`creationDockee`).
  const creationDockee = Boolean(referentiel.creationDockee)
  // Saisie en pleine page (au lieu du panneau glissant), comme l'application
  // d'origine pour la demande d'agrément : le formulaire remplace la liste, et
  // un bouton ramène à la liste. Pas de modal.
  const creationPleinePage = Boolean(referentiel.creationPleinePage)
  // Total de la vue, affiché en pastille sur chaque tableau (« Total : 13 »),
  // comme sur la page Données de base. Un référentiel peut fournir sa propre
  // formule (`stats`) ou renoncer à la pastille (`sansStats`) ; sinon c'est le
  // compte des lignes visibles, filtres et recherche compris.
  const fnStats = referentiel.sansStats
    ? null
    : referentiel.stats || ((entrees) => `Total : ${entrees.length}`)
  // Avec un titre (barre compacte), la pastille se range à côté du titre ;
  // sans titre, elle ouvre la barre d'outils, à gauche.
  const statsAuTitre = barreCompacte && !referentiel.sansTitre && Boolean(fnStats)
  // Texte des stats de la vue (total/ventilation) et sa légende éventuelle.
  const statsTexte = fnStats ? fnStats(visibles) : null
  const statsSegments = segmentsStats(statsTexte)
  const legendeTexte = referentiel.legendeStats ? referentiel.legendeStats(filtres) : null
  // Pages à onglets : le titre est celui de la page (hors de ce composant). On
  // remonte alors les stats au parent, qui les pose à côté de son titre - comme
  // sur Données de base. Dans ce cas le composant ne les affiche pas lui-même.
  useEffect(() => {
    if (onStats) onStats({ segments: segmentsStats(statsTexte), legende: legendeTexte })
  }, [onStats, statsTexte, legendeTexte])
  // Le sélecteur de segments ouvre d'ordinaire la barre d'outils. Un
  // référentiel peut l'envoyer à droite (`segmentsADroite`), avec les outils :
  // recherche et filtres restent alors seuls à gauche.
  const segmentsADroite = Boolean(segments && referentiel.segmentsADroite)
  // En liste déroulante soulignée (`segmentsEnListe`) plutôt qu'en boutons :
  // l'allure du filtre Traités / Non Traités de l'application d'origine.
  const selecteurSegments =
    segments &&
    (referentiel.segmentsEnListe ? (
      <div className="ddb-filtre-groupe">
        <select
          className="ddb-filtre"
          aria-label="Filtrer la liste"
          value={segmentActif || ''}
          onChange={(e) => {
            setSegmentActif(e.target.value)
            setEntreeDockee(null)
            setPage(1)
          }}
        >
          {segments.valeurs.map((segment) => (
            <option key={segment.valeur} value={segment.valeur}>
              {segment.libelle}
            </option>
          ))}
        </select>
      </div>
    ) : (
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
              setEntreeDockee(null)
              setPage(1)
            }}
          >
            {segment.libelle}
          </button>
        ))}
      </div>
    ))

  // Recherche : champ à loupe, ou à libellé flottant (`rechercheFlottante`)
  // comme l'application d'origine - « Rechercher… » tient la place de la saisie
  // tant que le champ est vide, et remonte au-dessus dès qu'on y entre.
  const changerRecherche = (e) => {
    setRecherche(e.target.value)
    setPage(1)
  }
  const champRecherche = referentiel.rechercheFlottante ? (
    <label className={`ddb-recherche-flottante${recherche ? ' ddb-recherche-remplie' : ''}`}>
      <span className="ddb-recherche-libelle">
        {referentiel.placeholderRecherche || 'Rechercher…'}
      </span>
      <input
        className="ddb-recherche-champ"
        value={recherche}
        onChange={changerRecherche}
        autoComplete="off"
      />
    </label>
  ) : (
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
        onChange={changerRecherche}
      />
    </CInputGroup>
  )

  // Pas de bouton « Actualiser » : le fond se rafraîchit tout seul
  // (cf. ecouteChangements).

  const boutonNouveau = (
    <button type="button" className="ddb-bouton-nouveau" onClick={ouvrirCreation}>
      <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
      {definitionSegment?.nouveau || nouveau}
    </button>
  )

  // Saisie en pleine page (demande d'agrément, cf. `creationPleinePage`) : le
  // formulaire remplace la liste, sans modal. Le bouton « Liste des demandes »
  // y ramène ; l'enregistrement aussi (cf. `enregistrer`, qui ferme le panneau).
  if (creationPleinePage && panneauOuvert) {
    return (
      <div className="ddb-referentiel">
        <div className="ddb-referentiel-entete">
          <h2 className="ddb-referentiel-titre">
            {entreeEditee
              ? referentiel.modifier
              : referentiel.titrePleinePage || referentiel.nouveau}
          </h2>
          <button
            type="button"
            className="ddb-bouton-nouveau ms-auto"
            onClick={() => setPanneauOuvert(false)}
          >
            {referentiel.libelleRetourListe || 'Retour à la liste'}
          </button>
        </div>
        <CorpsFormulaire
          referentiel={referentiel}
          entree={entreeEditee}
          entrees={entrees}
          valeursDefaut={{
            ...(segments?.champ ? { [segments.champ]: segmentActif } : {}),
            ...(codePropose ? { code: codePropose } : {}),
          }}
          onConfirmer={confirmerEnregistrement}
          onEnregistrer={enregistrer}
        />
        {modaleConfirmation}
      </div>
    )
  }

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
          {statsAuTitre && !onStats && (
            <PastillesStats segments={statsSegments} className="ddb-stats-groupe-titre" />
          )}
          {creationEnTete && !creationDockee && boutonNouveau}
        </div>
      )}

      {/* Stats de la vue, placées sous le titre (ou sous les onglets de la
          page), au-dessus de la barre d'outils - comme l'application d'origine.
          La légende (`legendeStats`, p. ex. la société filtrée) tient sa ligne
          au-dessus ; le total et sa ventilation forment la pastille. Pas
          rappelées ici quand elles sont déjà accolées au titre (`statsAuTitre`). */}
      {(fnStats || referentiel.legendeStats) && !statsAuTitre && !onStats && (
        <div className="ddb-stats-entete">
          {legendeTexte && <div className="ddb-stats-legende">{legendeTexte}</div>}
          <PastillesStats segments={statsSegments} />
        </div>
      )}

      {/* Barre contextuelle : elle ne paraît qu'une fois une ligne cochée, et
          remplace la barre d'outils plutôt que de s'y ajouter. */}
      {nbSelectionnes > 0 ? (
        <div className="ddb-barre-selection">
          {/* Trois temps : à gauche l'export des lignes cochées (en vert,
              comme le bouton de la barre d'outils), au milieu leur nombre, à
              droite ce qui les modifie - puis Annuler. */}
          <div className="ddb-selection-gauche">
            {(referentiel.actionsLot || [])
              .filter((action) => action.type === 'export')
              .map((action) => (
                <button
                  key={action.libelle}
                  type="button"
                  className="ddb-action-lot ddb-action-lot-export"
                  onClick={exporterSelection}
                >
                  <CIcon icon={OUTILS.export.icone} className="ddb-action-lot-icone" />
                  {action.libelle}
                </button>
              ))}
          </div>
          <span className="ddb-selection-compte">
            {nbSelectionnes} {nbSelectionnes > 1 ? 'sélectionnés' : 'sélectionné'}
          </span>
          <div className="ddb-selection-actions">
            {/* Actions de lot déclarées par le référentiel (`actionsLot`) : les
                médicaments s'excluent et se réintègrent, les conventions des
                fournisseurs se suspendent et se rétablissent. Chacune applique
                ses `champs` à toute la sélection, après confirmation. L'export
                (`type: 'export'`), qui ne modifie rien, se tient à gauche. */}
            {(referentiel.actionsLot || [])
              .filter((action) => action.type !== 'export')
              .map((action) => (
                <button
                  key={action.libelle}
                  type="button"
                  className={`ddb-action-lot${action.danger ? ' ddb-action-lot-danger' : ''}${
                    action.primaire ? ' ddb-action-lot-primaire' : ''
                  }`}
                  onClick={async () => {
                    const n = nbSelectionnes
                    const entreesSel = visibles.filter((e) => selection.has(e.id))
                    if (entreesSel.length === 0) return
                    // Action à exécuteur (`executer`) : la page la prend en main -
                    // ouvrir un modal (règlement), appeler un point d'API (A Payer).
                    // Elle se confirme seulement si elle le demande (`confirmer`).
                    if (action.executer) {
                      if (action.confirmer) {
                        const confirme = await demanderConfirmation({
                          titre: action.titreConfirmation || action.libelle,
                          message: action.confirmer(n),
                          confirmer: action.boutonConfirmation || action.libelle,
                          danger: action.danger,
                        })
                        if (!confirme) return
                      }
                      try {
                        const message = await action.executer(entreesSel)
                        // Un message rendu = l'action a abouti (point d'API) : on
                        // relâche la sélection et on recharge. Sans message, la
                        // page poursuit elle-même (un modal reste ouvert).
                        if (typeof message === 'string' && message.trim()) {
                          toast.success(message)
                          viderSelection()
                          await recharger()
                        }
                      } catch (e) {
                        toast.error(`${action.libelle} impossible : ${messageErreur(e)}`)
                      }
                      return
                    }
                    // Action par champs : modifie des fiches, se confirme toujours.
                    const confirme = await demanderConfirmation({
                      // Titre et bouton propres à l'action s'il en faut plus que
                      // son libellé (« Changer l'état », « Passer à Actif »).
                      titre: action.titreConfirmation || action.libelle,
                      message: action.confirmer
                        ? action.confirmer(n)
                        : `${action.libelle} ${n} ligne${n > 1 ? 's' : ''} sélectionnée${
                            n > 1 ? 's' : ''
                          } ?`,
                      confirmer: action.boutonConfirmation || action.libelle,
                      danger: action.danger,
                    })
                    if (confirme) agirEnLot(action.champs, action.message)
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
          {!segmentsADroite && !referentiel.segmentsEnListe && selecteurSegments}
          {!referentiel.rechercheEnDernier && champRecherche}

          {/* Filtres déclarés : la première option vide vaut « tous », c'est
              l'état de repos et il n'a donc pas à être choisi. Un filtre qui
              déclare une `etiquette` la porte au-dessus de sa liste - c'est
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
              <label
                key={filtre.champ}
                className="ddb-filtre-groupe"
                // Largeur propre au filtre (`largeur`) : un exercice tient en
                // sept caractères, une spécialité non.
                style={filtre.largeur ? { width: filtre.largeur } : undefined}
              >
                <span className="ddb-filtre-etiquette">{filtre.etiquette}</span>
                {liste}
              </label>
            ) : (
              liste
            )
          })}

          {/* Ordre de l'application d'origine, là où la page le demande :
              filtres, état en liste, puis la recherche. */}
          {!segmentsADroite && referentiel.segmentsEnListe && selecteurSegments}
          {referentiel.rechercheEnDernier && champRecherche}

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
              {/* Bouton de création avant les outils (`creationAvantOutils`),
                  comme la barre des bons de l'application d'origine. */}
              {barreCompacte &&
                creation &&
                !creationDockee &&
                referentiel.creationAvantOutils &&
                boutonNouveau}
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
                    // Vidé aussitôt : choisir de nouveau le même fichier -
                    // une fois corrigé - doit relancer l'import.
                    e.target.value = ''
                    if (fichier) importer(fichier)
                  }}
                />
              )}
              {barreCompacte &&
                creation &&
                !creationDockee &&
                !referentiel.creationAvantOutils &&
                boutonNouveau}
            </div>
          )}
        </div>
      )}

      <div className={creationDockee ? 'ddb-zone-creation' : undefined}>
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
              {chargement &&
                Array.from({ length: 7 }).map((_, i) => (
                  <CTableRow key={`sk-${i}`} className="ddb-ligne-squelette" aria-hidden="true">
                    {Array.from({ length: nbColonnes }).map((__, j) => (
                      <CTableDataCell key={j}>
                        <span className="ddb-squelette" />
                      </CTableDataCell>
                    ))}
                  </CTableRow>
                ))}

              {!chargement && visibles.length === 0 && (
                <LigneVide nbColonnes={nbColonnes} recherche={recherche} vide={referentiel.vide} />
              )}

              {!chargement &&
                lignes.map((entree) => (
                  <CTableRow
                    key={entree.id}
                    className={`ddb-ligne${entree.actif ? '' : ' ddb-ligne-inactive'}${
                      selection.has(entree.id) ? ' ddb-ligne-selectionnee' : ''
                    }${
                      (creationDockee && entreeDockee?.id === entree.id) ||
                      (referentiel.modificationParLigne &&
                        panneauOuvert &&
                        entreeEditee?.id === entree.id)
                        ? ' ddb-ligne-active'
                        : ''
                    }`}
                    onClick={() =>
                      creationDockee
                        ? setEntreeDockee(entree)
                        : referentiel.onLigne
                          ? referentiel.onLigne(entree)
                          : ouvrirModification(entree)
                    }
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
                            {entree[col.nom] ? etat.actif : etat.inactif}
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
                      {Fiche && (
                        <CTooltip content="Voir la fiche">
                          <CButton
                            color="light"
                            size="sm"
                            className="ddb-action"
                            aria-label={`Voir la fiche : ${nommer(entree)}`}
                            onClick={() => {
                              setEntreeVue(entree)
                              setFicheOuverte(true)
                            }}
                          >
                            <CIcon icon={ICONE_OEIL} />
                          </CButton>
                        </CTooltip>
                      )}
                      {/* Une action peut ne valoir que pour certaines lignes
                        (`visible`) : l'impression d'un bon traité, par exemple. */}
                      {(referentiel.actionsLigne || [])
                        .filter((action) => !action.visible || action.visible(entree))
                        .map((action) => (
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
                      {/* Pas de crayon là où on modifie en cliquant la ligne :
                          card dockée (`entreeDockee`), ouverture du panneau au
                          clic (`modificationParLigne`, cf. fournisseurs), ou
                          clic détourné par la page (`onLigne`, cf. Règlements). */}
                      {!creationDockee &&
                        !referentiel.modificationParLigne &&
                        !referentiel.onLigne && (
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
                        )}
                      {/* Jamais de suppression : une fiche se désactive, et se
                        réactive. Le libellé suit le vocabulaire du référentiel
                        (« Suspendre » une convention, « Annuler » un bon).
                        Sauf là où l'état est en colonne : il est alors la seule
                        sortie, et se change par les cases à cocher. */}
                      {!statutEnColonne && (
                        <CTooltip
                          content={entree.actif === false ? etat.reactiver : etat.desactiver}
                        >
                          <CButton
                            color="light"
                            size="sm"
                            className={`ddb-action ${entree.actif === false ? '' : 'ddb-action-danger'}`}
                            aria-label={`${
                              entree.actif === false ? etat.reactiver : etat.desactiver
                            } : ${nommer(entree)}`}
                            onClick={() => basculerActif(entree)}
                          >
                            <CIcon icon={entree.actif === false ? cilActionUndo : cilBan} />
                          </CButton>
                        </CTooltip>
                      )}
                    </CTableDataCell>
                  </CTableRow>
                ))}
            </CTableBody>
          </CTable>
        </div>
        {creationDockee && !panneauOuvert && !chargement && (
          <aside className="ddb-creation-dockee">
            <div className="ddb-panneau-entete">
              <span className="ddb-panneau-titre">
                {entreeDockee
                  ? referentiel.modifier || 'Modifier'
                  : definitionSegment?.nouveau || nouveau}
              </span>
              {/* En modification : revenir à une création vierge sans enregistrer. */}
              {entreeDockee && (
                <button
                  type="button"
                  className="ddb-dockee-nouveau"
                  onClick={() => {
                    setEntreeDockee(null)
                    setResetDockee((n) => n + 1)
                  }}
                >
                  <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
                  Nouveau
                </button>
              )}
            </div>
            <CorpsFormulaire
              // Le panneau se remonte à chaque changement de sous-onglet
              // (segment) et à chaque ligne sélectionnée, pour charger la bonne
              // entrée (ou repartir d'une création) et recalculer le type proposé
              // - et le code qui s'en déduit : Départements → DEP, DEP0xx.
              key={`creation-dockee-${entreeDockee?.id ?? 'new'}-${segmentActif || ''}-${resetDockee}`}
              referentiel={referentiel}
              entree={entreeDockee}
              entrees={entrees}
              valeursDefaut={segments?.champ ? { [segments.champ]: segmentActif } : {}}
              onConfirmer={confirmerEnregistrement}
              onEnregistrer={enregistrerDockee}
            />
          </aside>
        )}
      </div>

      {/* Le pied ne porte plus que la pagination : sur une seule page, il
          n'aurait rien à montrer et ne laisserait qu'un blanc sous le tableau. */}
      {!chargement && nbPages > 1 && (
        <div className="ddb-pied">
          <Pagination page={pageCourante} nbPages={nbPages} onChange={setPage} />
        </div>
      )}

      {/* Le panneau glissant - sauf en saisie pleine page, qui a son propre
          formulaire (early-return ci-dessus). */}
      {!creationPleinePage && (
        <Editeur
          referentiel={referentiel}
          entree={entreeEditee}
          entrees={entrees}
          // Une création lancée depuis « Services » arrive avec le type déjà posé ;
          // celle d'une demande d'agrément, avec le numéro proposé par le serveur.
          valeursDefaut={{
            ...(segments?.champ ? { [segments.champ]: segmentActif } : {}),
            ...(codePropose ? { code: codePropose } : {}),
          }}
          titreCreation={definitionSegment?.nouveau}
          visible={panneauOuvert}
          onFermer={() => setPanneauOuvert(false)}
          onConfirmer={confirmerEnregistrement}
          onEnregistrer={enregistrer}
          enPause={confirmationOuverte}
        />
      )}

      {modaleConfirmation}

      {Fiche && entreeVue && (
        <Fiche entree={entreeVue} visible={ficheOuverte} onFermer={() => setFicheOuverte(false)} />
      )}
    </div>
  )
}

/** Ligne d'état vide : distingue « référentiel vide » de « recherche sans résultat ». */
const LigneVide = ({ nbColonnes, recherche, vide }) => (
  <CTableRow>
    <CTableDataCell colSpan={nbColonnes} className="ddb-etat-vide">
      {recherche ? (
        <>
          Aucun résultat pour <strong>« {recherche} »</strong>
        </>
      ) : (
        // Message propre au tableau (« Aucun fournisseur », « Aucune facture »…),
        // plus parlant que « Aucune entrée ».
        vide || 'Aucune entrée'
      )}
    </CTableDataCell>
  </CTableRow>
)

export default Referentiel
