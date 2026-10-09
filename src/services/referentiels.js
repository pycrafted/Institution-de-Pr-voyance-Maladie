/**
 * Accès aux données des référentiels de la section « Données de base ».
 *
 * Migration en cours vers l'API IPM (Django). Les référentiels listés dans
 * ENDPOINTS_API sont servis par le backend ; les autres continuent de vivre en
 * localStorage le temps que leur endpoint existe. Aiguiller un référentiel de
 * plus = ajouter une ligne dans ENDPOINTS_API et retirer ses données statiques.
 *
 * Toutes les fonctions sont asynchrones : les composants ne voient pas d'où
 * viennent les données.
 */

import { request } from './api'

// =====================================================================
// Aiguillage backend
//
// clé du référentiel → chemin de son endpoint (relatif à API_BASE). Un
// référentiel absent de cette table reste servi par le localStorage ci-dessous.
// =====================================================================
const ENDPOINTS_API = {
  'types-beneficiaires': '/donnees-de-base/types-beneficiaires',
  'types-prestations': '/donnees-de-base/types-prestations',
  specialites: '/donnees-de-base/specialites',
  actes: '/donnees-de-base/actes',
  'articles-achat': '/donnees-de-base/articles-achat',
  'journaux-comptables': '/donnees-de-base/journaux-comptables',
  medicaments: '/donnees-de-base/medicaments',
  'fournisseurs-divers': '/donnees-de-base/fournisseurs-divers',
  'fournisseurs-de-soins': '/donnees-de-base/fournisseurs-de-soins',
  'demandes-agrement': '/donnees-de-base/demandes-agrement',
  structure: '/donnees-de-base/structure',
  // Module à part entière, monté à la racine de l'API (cf. backend/apps/adherents).
  adherents: '/adherents',
  // Module Participants, monté lui aussi à la racine (cf. backend/apps/participants).
  // « beneficiaires » : les familles, rattachées à un participant.
  participants: '/participants',
  beneficiaires: '/beneficiaires',
  // Module Documents (cf. backend/apps/documents).
  'bons-pharmacie': '/bons-pharmacie',
  'lettres-garantie': '/lettres-garantie',
  'bons-optique': '/bons-optique',
  'lg-hospitalisation': '/lg-hospitalisation',
  'taux-prise-en-charge': '/taux-prise-en-charge',
  'taux-exceptionnels': '/taux-exceptionnels',
  // Module Traitements (cf. backend/apps/traitements).
  factures: '/factures',
}

const servrParApi = (cle) => cle in ENDPOINTS_API

// =====================================================================
// Store mémoire - source synchrone unique
//
// Les référentiels servis par l'API sont copiés ici au démarrage
// (prechargerReferentiels), pour que les lectures synchrones - les cascades
// Direction → Département → Service de la fiche participant, qui se calculent
// pendant le rendu - disposent des données sans attendre le réseau.
//
// La base de données reste la source de vérité ; ce store n'est qu'une copie de
// travail, tenue à jour à chaque écriture pour ne jamais diverger de la base.
// =====================================================================
const magasin = {}

/**
 * Précharge en mémoire tous les référentiels servis par l'API. À appeler une
 * fois au démarrage de l'application, avant d'afficher les écrans qui lisent
 * ces données de façon synchrone.
 */
export async function prechargerReferentiels() {
  await Promise.all(
    Object.entries(ENDPOINTS_API).map(async ([cle, chemin]) => {
      magasin[cle] = await request(`${chemin}/`)
    }),
  )
}

// Le suffixe de version force le rechargement du jeu de départ quand celui-ci
// évolue, sans quoi les postes ayant déjà ouvert l'application garderaient
// l'ancien contenu en cache. v25 : plus aucune donnée de démonstration - les
// participants, familles et bons engendrés disparaissent des postes.
const CLE_STOCKAGE = 'ipm-referentiels-v25'
const PREFIXE_STOCKAGE = 'ipm-referentiels-'

/**
 * Référentiels tenus dans le navigateur : il n'en reste aucun, tous sont
 * servis par le backend (cf. ENDPOINTS_API). Le mécanisme demeure pour un
 * écran qui n'aurait pas encore son API - et il partirait vide.
 */
const DONNEES_INITIALES = {}

let compteurId = 1
const nouvelId = () => `r${Date.now().toString(36)}${(compteurId++).toString(36)}`

/**
 * Copie en mémoire du stockage. Sans elle, chaque cellule d'un tableau qui
 * résout un code vers son intitulé relirait et réanalyserait tout le contenu -
 * catalogue pharmaceutique compris - soit des dizaines de fois par rendu.
 *
 * Elle est tenue à jour par `enregistrerTout`, seul point d'écriture. Un
 * second onglet ne la verrait pas changer, ce qui est sans conséquence tant
 * que les données vivent dans le navigateur.
 */
let cache = null

function chargerTout() {
  if (cache) return cache
  // Les jeux des versions précédentes - démonstration comprise - sont effacés
  // du poste : ils ne seraient plus jamais relus.
  try {
    Object.keys(localStorage)
      .filter((cle) => cle.startsWith(PREFIXE_STOCKAGE) && cle !== CLE_STOCKAGE)
      .forEach((cle) => localStorage.removeItem(cle))
  } catch {
    // stockage indisponible : rien à effacer
  }
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (brut) {
      cache = JSON.parse(brut)
      return cache
    }
  } catch {
    // stockage illisible : on repart du jeu initial
  }
  const initial = {}
  Object.entries(DONNEES_INITIALES).forEach(([cle, lignes]) => {
    // `actif` d'abord, pour qu'une ligne qui le déclare - une convention
    // dénoncée, par exemple - garde sa valeur au lieu d'être réactivée.
    initial[cle] = lignes.map((l) => ({ actif: true, ...l, id: nouvelId() }))
  })
  enregistrerTout(initial)
  return initial
}

function enregistrerTout(tout) {
  cache = tout
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(tout))
  } catch {
    // quota dépassé ou mode privé : on continue en mémoire
  }
}

/**
 * Lecture synchrone d'un référentiel.
 *
 * Les listes déroulantes en cascade - Direction, puis Département, puis
 * Service - se calculent pendant le rendu et ne peuvent donc pas attendre une
 * promesse. C'est le seul cas : partout ailleurs, on passe par `listerEntrees`.
 */
export function listerEntreesSync(cleReferentiel) {
  // Référentiels en base : lus dans le store préchargé. Les autres restent en
  // localStorage, dont la lecture est déjà synchrone.
  if (servrParApi(cleReferentiel)) return magasin[cleReferentiel] || []
  return chargerTout()[cleReferentiel] || []
}

/** Petite latence pour que les états de chargement soient réalistes. */
const differer = (valeur) => new Promise((resolve) => setTimeout(() => resolve(valeur), 120))

export async function listerEntrees(cleReferentiel) {
  if (servrParApi(cleReferentiel)) {
    // On rafraîchit le store au passage : l'écran affiche des données fraîches
    // et les lectures synchrones profitent de la même mise à jour.
    magasin[cleReferentiel] = await request(`${ENDPOINTS_API[cleReferentiel]}/`)
    return [...magasin[cleReferentiel]]
  }
  const tout = chargerTout()
  return differer([...(tout[cleReferentiel] || [])])
}

/**
 * État compact d'un référentiel servi par l'API : `{ nombre,
 * dernier_changement }`. Deux valeurs qui bougent dès qu'une fiche est créée,
 * modifiée ou supprimée - de quoi savoir s'il faut recharger la liste sans la
 * rapatrier. Voir l'écoute de fond (views/donnees-de-base/ecouteChangements.js)
 * et l'action `etat` du socle des référentiels côté backend.
 */
export async function etatReferentiel(cleReferentiel) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  return request(`${ENDPOINTS_API[cleReferentiel]}/etat/`)
}

/** Un référentiel dont l'état peut s'interroger : ceux que sert l'API. */
export const ecoutable = (cleReferentiel) => servrParApi(cleReferentiel)

export async function creerEntree(cleReferentiel, valeurs) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/`, {
      method: 'POST',
      body: JSON.stringify(valeurs),
    })
    magasin[cleReferentiel] = [...(magasin[cleReferentiel] || []), entree]
    return entree
  }
  const tout = chargerTout()
  const entree = { ...valeurs, id: nouvelId(), actif: true }
  tout[cleReferentiel] = [...(tout[cleReferentiel] || []), entree]
  enregistrerTout(tout)
  return differer(entree)
}

export async function modifierEntree(cleReferentiel, id, valeurs) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(valeurs),
    })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      e.id === entree.id ? entree : e,
    )
    return entree
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    e.id === id ? { ...e, ...valeurs } : e,
  )
  enregistrerTout(tout)
  return differer(tout[cleReferentiel].find((e) => e.id === id))
}

/**
 * Applique les mêmes champs à plusieurs entrées d'un coup - exclure une
 * sélection de médicaments, en désactiver un lot. Un seul enregistrement du
 * stockage, donc pas d'état intermédiaire visible.
 */
export async function modifierEnLot(cleReferentiel, ids, champs) {
  if (servrParApi(cleReferentiel)) {
    const { modifies } = await request(`${ENDPOINTS_API[cleReferentiel]}/modifier-en-lot/`, {
      method: 'POST',
      body: JSON.stringify({ ids, champs }),
    })
    // Le backend ne renvoie qu'un compte : on applique les mêmes champs aux
    // entrées visées du store pour le garder aligné sur la base.
    const cibles = new Set(ids)
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      cibles.has(e.id) ? { ...e, ...champs } : e,
    )
    return modifies
  }
  const tout = chargerTout()
  const cibles = new Set(ids)
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    cibles.has(e.id) ? { ...e, ...champs } : e,
  )
  enregistrerTout(tout)
  return differer(cibles.size)
}

/**
 * Désactive (ou réactive) une entrée.
 * On ne supprime jamais : les dossiers déjà saisis continuent de référencer
 * ce code, et un historique amputé de ses libellés devient illisible.
 */
export async function basculerActivation(cleReferentiel, id) {
  if (servrParApi(cleReferentiel)) {
    const entree = await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/basculer-activation/`, {
      method: 'POST',
    })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).map((e) =>
      e.id === entree.id ? entree : e,
    )
    return entree
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).map((e) =>
    e.id === id ? { ...e, actif: !e.actif } : e,
  )
  enregistrerTout(tout)
  return differer(tout[cleReferentiel].find((e) => e.id === id))
}

/**
 * Supprime définitivement une entrée.
 * Contrairement à la désactivation, la ligne disparaît : à réserver aux codes
 * jamais référencés ailleurs, car un dossier qui pointe vers un code supprimé
 * n'affichera plus son intitulé.
 */
export async function supprimerEntree(cleReferentiel, id) {
  if (servrParApi(cleReferentiel)) {
    await request(`${ENDPOINTS_API[cleReferentiel]}/${id}/`, { method: 'DELETE' })
    magasin[cleReferentiel] = (magasin[cleReferentiel] || []).filter((e) => e.id !== id)
    return
  }
  const tout = chargerTout()
  tout[cleReferentiel] = (tout[cleReferentiel] || []).filter((e) => e.id !== id)
  enregistrerTout(tout)
  return differer(undefined)
}

/**
 * Déclenche une action métier sur une entrée - une route dédiée du backend,
 * au-delà de la simple saisie : valider une demande d'agrément, par exemple.
 * Renvoie la réponse du serveur.
 *
 * Réservée aux référentiels servis par l'API : une action métier n'a pas
 * d'équivalent dans le stockage du navigateur.
 */
export async function executerAction(cleReferentiel, id, action) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  return request(`${ENDPOINTS_API[cleReferentiel]}/${id}/${action}/`, { method: 'POST' })
}

/**
 * Numéro que le serveur propose pour la prochaine entrée d'un référentiel dont
 * la série dépasse ce que l'écran voit - une demande d'agrément prend la suite
 * des fournisseurs et des demandes déjà validées.
 */
export async function prochainNumero(cleReferentiel) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  const { code } = await request(`${ENDPOINTS_API[cleReferentiel]}/prochain-numero/`)
  return code
}

/**
 * Importe un lot de lignes dans un référentiel servi par l'API : chaque ligne
 * met à jour la fiche dont elle porte le numéro, ou en crée une. Le serveur
 * valide tout avant d'écrire quoi que ce soit - une seule ligne en erreur et
 * rien n'est enregistré.
 *
 * `simulation` : le serveur valide et compte sans rien écrire, pour annoncer
 * le bilan avant de demander confirmation.
 */
export async function importerEntrees(cleReferentiel, lignes, { simulation = false } = {}) {
  if (!servrParApi(cleReferentiel)) {
    throw new Error(`« ${cleReferentiel} » n'est pas servi par l'API`)
  }
  return request(`${ENDPOINTS_API[cleReferentiel]}/importer/`, {
    method: 'POST',
    body: JSON.stringify({ lignes, simulation }),
  })
}
