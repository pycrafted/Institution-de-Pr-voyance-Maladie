/**
 * Page « Interrogation Compte » - menu Comptabilité (captures 74 à 78).
 *
 * Le **grand livre par compte** et l'**extrait de compte d'un tiers** : deux
 * écrans que nous cherchions séparément, et qui n'en font qu'un. Six onglets,
 * un par famille de comptes, et le compte n'est jamais saisi - il est déduit
 * du référentiel choisi. Choisir la spécialité « 400000 - GENERALISTES »,
 * c'est choisir le compte 400000.
 *
 * Comme le Journal Central, dont elle est la variante, la page ne passe pas
 * par <Referentiel /> : tout se filtre et se pagine côté serveur, et le
 * bandeau est une agrégation sur toute la période, jamais la somme des lignes
 * affichées.
 *
 * Ce qui lui est propre, et qui vient directement des captures :
 *
 *   - **La sélection à cases et son « Solde sélection »**, à droite du bandeau
 *     noir. C'est la mécanique du lettrage : on coche une facture et son
 *     règlement, le solde de la sélection tombe à zéro, le lot est lettrable.
 *   - **Le Lettrage, et donc les cases, n'existent que là où il y a un tiers.**
 *     Lettrer, c'est apparier un débit et un crédit sur un même tiers ; sur une
 *     charge ou une banque, il n'y a rien à apparier - l'original n'y montre
 *     ni cases ni bouton.
 *   - **Deux colonnes de plus sur les Charges Techniques** : Frais réel et
 *     Frais exclus, et cet onglet seul laisse tomber « Cpte. Tiers ».
 *   - **Deux flèches ‹ › rouges** collées au sélecteur de tiers, pour passer
 *     au suivant sans rouvrir la liste. Pour qui déroule 412 prestataires
 *     l'un après l'autre, c'est l'essentiel de l'ergonomie de l'écran.
 *   - **Export Excel et Imprimer Extrait pâlissent** quand il n'y a rien à
 *     produire, pendant que Lettrage reste actif. C'est ce que fait l'original
 *     (capture 75), et c'est juste : les deux premiers n'ont rien à écrire.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import BoutonExport from '../../components/BoutonExport'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilChevronBottom, cilLink, cilPrint } from '@coreui/icons'

import { request, telecharger } from '../../services/api'
import { listerEntrees } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { ouvrirApercu } from '../../services/apercu'
import '../donnees-de-base/donnees-de-base.scss'
import './journal-central.scss'
import './interrogation-comptes.scss'

/** Montant à la française, avec l'espace des milliers. */
const montant = (valeur) =>
  valeur === null || valeur === undefined ? '' : Number(valeur).toLocaleString('fr-FR')

/**
 * Une case à zéro reste **vide** : une écriture porte un débit OU un crédit,
 * et écrire « 0 » dans l'autre colonne double le bruit sans rien apprendre.
 * C'est ce que fait l'original, dont les cellules inutilisées sont blanches.
 */
const cellule = (valeur) => (Number(valeur) === 0 ? '' : montant(valeur))

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

/** « 1 janv. 2026 » : le format de cet écran (le Journal Central abrège plus). */
const dateLongue = (iso) => {
  if (!iso) return ''
  const [a, m, j] = iso.split('-')
  return `${Number(j)} ${ABREGES[Number(m) - 1]} ${a}`
}

/** « janv.-2026 » : la colonne « Mois trait. » montre un mois, pas une date. */
const moisAbrege = (iso) => {
  if (!iso) return ''
  const [a, m] = iso.split('-')
  return `${ABREGES[Number(m) - 1]}-${a}`
}

/**
 * Les six onglets, dans l'ordre de l'original, et ce que chacun montre.
 *
 * `selecteur` : le premier sélecteur, celui qui tient la ligne du haut.
 *   - `societe`   : la société, qui vaut aussi choix du compte (411+soc, 463+soc)
 *   - `compte`    : un compte de la famille, ou tous
 *   - `specialite`: le compte de la spécialité, puis le fournisseur en second
 * `tiers` : l'onglet porte-t-il un tiers ? Alors cases à cocher et Lettrage.
 * `societeEnFiltre` : la société descend-elle dans la seconde ligne ?
 */
const ONGLETS = [
  {
    cle: 'participants',
    libelle: 'Participants',
    titre: 'Intérrogation Comptes Participants',
    selecteur: 'societe',
    etiquetteSelecteur: 'Société',
    videSelecteur: 'Toutes les sociétés',
    // Le second sélecteur s'appelle « Adhérent » dans l'original, bien qu'il
    // porte un participant (« 01-0302 - MAMADOU SEYDOU SARR »). On garde son
    // libellé : notre IPM refait le design, pas le vocabulaire.
    etiquetteTiers: 'Adhérent',
    tiers: true,
    societeEnFiltre: false,
  },
  {
    cle: 'fournisseurs',
    libelle: 'Fournisseurs de soins',
    titre: 'Intérrogation Comptes Fournisseurs de Soins',
    selecteur: 'specialite',
    etiquetteSelecteur: 'Spécialité',
    videSelecteur: 'Toutes les spécialités',
    etiquetteTiers: 'Fournisseur',
    tiers: true,
    societeEnFiltre: true,
  },
  {
    cle: 'adherents',
    libelle: 'Adhérents',
    titre: 'Intérrogation Comptes Adhérents',
    selecteur: 'societe',
    etiquetteSelecteur: 'Société',
    videSelecteur: 'Toutes les sociétés',
    tiers: true,
    societeEnFiltre: false,
  },
  {
    cle: 'charges',
    libelle: 'Charges techniques',
    titre: 'Intérrogation Comptes Charges Techniques',
    selecteur: 'compte',
    etiquetteSelecteur: 'Compte',
    videSelecteur: 'Tous les comptes',
    tiers: false,
    societeEnFiltre: true,
    // L'écriture porte sa liquidation : c'est le seul onglet qui l'affiche,
    // et le seul qui laisse tomber « Cpte. Tiers » pour lui faire de la place.
    liquidation: true,
  },
  {
    cle: 'banques',
    libelle: 'Banques',
    titre: 'Intérrogation Comptes Banques',
    selecteur: 'compte',
    etiquetteSelecteur: 'Compte',
    videSelecteur: 'Toutes les banques',
    tiers: false,
    societeEnFiltre: true,
  },
  {
    cle: 'autres',
    libelle: 'Autres',
    titre: 'Intérrogation Comptes Autres',
    selecteur: 'compte',
    etiquetteSelecteur: 'Compte',
    videSelecteur: 'Tous les comptes',
    tiers: false,
    societeEnFiltre: true,
  },
]

/** Les colonnes, dans l'ordre de l'original. */
const COLONNES_BASE = [
  { cle: 'codeSoc', libelle: 'Code Soc.', largeur: '70px' },
  // Le code journal en pastille : deux ou trois lettres noyées dans une
  // colonne de chiffres se cherchent ; encadrées, elles se trouvent.
  {
    cle: 'cJl',
    libelle: 'C.JL',
    largeur: '72px',
    rendu: (e) => (e.cJl ? <span className="ic-badge-journal">{e.cJl}</span> : ''),
  },
  { cle: 'dCompta', libelle: 'Date Compta', largeur: '100px', rendu: (e) => dateLongue(e.dCompta) },
  {
    cle: 'moisTrait',
    libelle: 'Mois trait.',
    largeur: '92px',
    rendu: (e) => moisAbrege(e.moisTrait),
  },
  { cle: 'numPiece', libelle: 'N° pièce', largeur: '100px' },
  { cle: 'numFactIpm', libelle: 'N° Fact.', largeur: '82px' },
  { cle: 'compteGen', libelle: 'Cpte. Gen.', largeur: '88px', classe: 'jc-compte' },
  { cle: 'compteTiers', libelle: 'Cpte. Tiers', largeur: '96px' },
  { cle: 'libelle', libelle: 'Libellé', largeur: 'auto' },
  {
    cle: 'debit',
    libelle: 'Débit',
    largeur: '100px',
    aligne: true,
    rendu: (e) => cellule(e.debit),
  },
  {
    cle: 'credit',
    libelle: 'Crédit',
    largeur: '100px',
    aligne: true,
    rendu: (e) => cellule(e.credit),
  },
]

const COLONNES_LIQUIDATION = [
  {
    cle: 'fraisReel',
    libelle: 'Frais réel',
    largeur: '100px',
    aligne: true,
    rendu: (e) => cellule(e.fraisReel),
  },
  {
    cle: 'fraisExclus',
    libelle: 'Frais exclus',
    largeur: '100px',
    aligne: true,
    rendu: (e) => cellule(e.fraisExclus),
  },
]

/** Les colonnes de l'onglet : sans « Cpte. Tiers » là où la liquidation s'affiche. */
const colonnesDe = (onglet) =>
  onglet.liquidation
    ? [...COLONNES_BASE.filter((c) => c.cle !== 'compteTiers'), ...COLONNES_LIQUIDATION]
    : COLONNES_BASE

const TAILLES = [25, 50, 100, 200]
const MOIS_COMPLETS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

/** Le 1er janvier et le 31 décembre de l'exercice : la période par défaut. */
const debutExercice = (annee) => `${annee}-01-01`
const finExercice = (annee) => `${annee}-12-31`

/** « 1 janv. 2026 - 31 déc. 2026 », tel que l'original résume sa période. */
const resumePeriode = (du, au) =>
  du || au ? `${dateLongue(du) || '…'} - ${dateLongue(au) || '…'}` : 'Toutes les dates'

const InterrogationComptes = () => {
  const annee = new Date().getFullYear()

  const [cleOnglet, setCleOnglet] = useState('participants')
  const onglet = ONGLETS.find((o) => o.cle === cleOnglet) || ONGLETS[0]
  const colonnes = useMemo(() => colonnesDe(onglet), [onglet])

  // Filtres communs aux six onglets.
  const [exercice, setExercice] = useState(String(annee))
  const [du, setDu] = useState(debutExercice(annee))
  const [au, setAu] = useState(finExercice(annee))
  const [periodeOuverte, setPeriodeOuverte] = useState(false)
  const [journal, setJournal] = useState('ALL')
  const [societe, setSociete] = useState('')
  // Sélecteurs propres à l'onglet.
  const [compte, setCompte] = useState('')
  const [tiers, setTiers] = useState('')
  const [recherche, setRecherche] = useState('')
  const [termeDiffere, setTermeDiffere] = useState('')

  const [taille, setTaille] = useState(50)
  const [page, setPage] = useState(1)

  const [ecritures, setEcritures] = useState([])
  const [totaux, setTotaux] = useState(null)
  const [nombre, setNombre] = useState(0)
  const [pages, setPages] = useState(1)
  const [chargement, setChargement] = useState(true)
  const [coches, setCoches] = useState([])

  // Référentiels des sélecteurs.
  const [adherents, setAdherents] = useState([])
  const [journaux, setJournaux] = useState([])
  const [specialites, setSpecialites] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [participants, setParticipants] = useState([])
  const [exercices, setExercices] = useState([annee])
  // Comptes et tiers réellement mouvementés, demandés au serveur.
  const [comptes, setComptes] = useState([])
  const [listeTiers, setListeTiers] = useState([])

  useEffect(() => {
    const minuteur = setTimeout(() => {
      setTermeDiffere(recherche)
      setPage(1)
    }, 400)
    return () => clearTimeout(minuteur)
  }, [recherche])

  // Les référentiels, chargés une fois. Les participants servent à nommer les
  // tiers « 01-0302 » ; les spécialités, à proposer leur compte.
  useEffect(() => {
    let vivant = true
    const charger = async () => {
      try {
        const [societes, listeJournaux, listeSpecialites, listeFrs, listeParts, listeExercices] =
          await Promise.all([
            listerEntrees('adherents'),
            listerEntrees('journaux-comptables'),
            listerEntrees('specialites'),
            listerEntrees('fournisseurs-de-soins'),
            listerEntrees('participants'),
            request('/journal-central/exercices/'),
          ])
        if (!vivant) return
        setAdherents(societes.filter((a) => a.actif !== false))
        setJournaux(listeJournaux)
        setSpecialites(listeSpecialites)
        setFournisseurs(listeFrs)
        setParticipants(listeParts)
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
      onglet: cleOnglet,
      exercice,
      du,
      au,
      journal,
      societe,
      compte,
      tiers,
      recherche: termeDiffere,
    }),
    [cleOnglet, exercice, du, au, journal, societe, compte, tiers, termeDiffere],
  )

  const requeteDe = useCallback(
    (extra = {}) =>
      new URLSearchParams(
        Object.entries({ ...parametres, ...extra }).filter(
          ([, v]) => v !== '' && v !== undefined && v !== null,
        ),
      ),
    [parametres],
  )

  const charger = useCallback(async () => {
    try {
      setChargement(true)
      const [liste, bandeau] = await Promise.all([
        request(`/interrogation-comptes/?${requeteDe({ page, taille })}`),
        request(`/interrogation-comptes/totaux/?${requeteDe()}`),
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
  }, [requeteDe, page, taille])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  // Les comptes et les tiers mouvementés de l'onglet : ils changent avec
  // l'onglet, le compte choisi et la société.
  useEffect(() => {
    let vivant = true
    const requete = new URLSearchParams({ onglet: cleOnglet })
    if (societe) requete.set('societe', societe)
    const requeteTiers = new URLSearchParams(requete)
    if (compte) requeteTiers.set('compte', compte)
    Promise.all([
      request(`/interrogation-comptes/comptes/?${requete}`),
      onglet.tiers ? request(`/interrogation-comptes/tiers/?${requeteTiers}`) : Promise.resolve([]),
    ])
      .then(([listeComptes, tiersMouvementes]) => {
        if (!vivant) return
        setComptes(listeComptes)
        setListeTiers(tiersMouvementes)
      })
      // Les sélecteurs sont une commodité : leur absence ne doit pas masquer
      // la liste, qui, elle, est bien arrivée.
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [cleOnglet, societe, compte, onglet.tiers])

  /** Change d'onglet : on repart propre, les sélecteurs n'ayant plus de sens. */
  const changerOnglet = (cle) => {
    setCleOnglet(cle)
    setCompte('')
    setTiers('')
    setCoches([])
    setPage(1)
  }

  const changerFiltre = (poser) => (valeur) => {
    poser(valeur)
    setCoches([])
    setPage(1)
  }

  const changerExercice = (valeur) => {
    setExercice(valeur)
    // La période suit l'exercice : la laisser sur l'année précédente ferait
    // un écran qui annonce 2026 et ne montre rien.
    if (/^\d{4}$/.test(valeur)) {
      setDu(debutExercice(valeur))
      setAu(finExercice(valeur))
    }
    setCoches([])
    setPage(1)
  }

  /**
   * Remet les filtres à leur état d'ouverture : l'exercice en cours, toute
   * l'année, toutes les écritures, aucun tiers choisi. L'onglet, lui, ne
   * bouge pas - on réinitialise une recherche, pas la famille de comptes
   * qu'on est venu consulter.
   */
  const reinitialiser = () => {
    setExercice(String(annee))
    setDu(debutExercice(annee))
    setAu(finExercice(annee))
    setJournal('ALL')
    setSociete('')
    setCompte('')
    setTiers('')
    setRecherche('')
    setCoches([])
    setPage(1)
  }

  // --- Les sélecteurs de l'onglet -----------------------------------------

  /** Intitulé d'un compte : le plan comptable, et le référentiel qui le porte. */
  const nommerCompte = (code, libelle) => {
    if (libelle) return `${code} - ${libelle}`
    const specialite = specialites.find((s) => s.compte === code)
    if (specialite) return `${code} - ${specialite.libelle}`
    const adherent = adherents.find((a) => `463${a.code}` === code)
    if (adherent) return `${code} - ${adherent.libelle}`
    return code
  }

  /** Nom d'un tiers : « 01-0302 - MAMADOU SEYDOU SARR », « 0001 - DR … ». */
  const nommerTiers = (valeur) => {
    if (onglet.cle === 'fournisseurs') {
      const frs = fournisseurs.find((f) => f.code === valeur)
      return frs ? `${valeur} - ${frs.libelle}` : valeur
    }
    const [soc, matricule] = String(valeur).split('-')
    const participant = participants.find(
      (p) => p.matricule === (matricule || valeur) && (!soc || p.adherent === soc),
    )
    if (participant) {
      const nom = [participant.prenoms, participant.nom].filter(Boolean).join(' ')
      return nom ? `${valeur} - ${nom}` : valeur
    }
    return valeur
  }

  /** Les options du premier sélecteur, selon l'onglet. */
  const optionsSelecteur = () => {
    if (onglet.selecteur === 'societe') {
      return adherents.map((a) => ({ valeur: a.code, libelle: `${a.code} - ${a.libelle}` }))
    }
    if (onglet.selecteur === 'specialite') {
      // Les comptes 400xxx mouvementés, nommés par leur spécialité : c'est
      // ainsi que l'original les montre (« 400000 - GENERALISTES »).
      return comptes.map((c) => ({
        valeur: c.compte,
        libelle: nommerCompte(c.compte, c.libelle),
      }))
    }
    return comptes.map((c) => ({ valeur: c.compte, libelle: nommerCompte(c.compte, c.libelle) }))
  }

  const valeurSelecteur = onglet.selecteur === 'societe' ? societe : compte
  const poserSelecteur = onglet.selecteur === 'societe' ? setSociete : setCompte

  /**
   * Les deux flèches ‹ › : passer au tiers précédent / suivant sans rouvrir la
   * liste. Elles agissent sur le sélecteur qui porte le tiers quand il y en a
   * un, sur le premier sinon - c'est ce que fait l'original, dont les onglets
   * sans tiers les gardent à côté du sélecteur de compte.
   */
  const listeFleches = onglet.tiers
    ? listeTiers.map((t) => t.tiers)
    : optionsSelecteur().map((o) => o.valeur)
  const valeurFleches = onglet.tiers ? tiers : valeurSelecteur
  const poserFleches = onglet.tiers ? setTiers : poserSelecteur

  const deplacer = (pas) => {
    if (!listeFleches.length) return
    const index = listeFleches.indexOf(valeurFleches)
    // Rien de choisi : la flèche droite prend le premier, la gauche le dernier.
    const suivant =
      index === -1
        ? pas > 0
          ? 0
          : listeFleches.length - 1
        : Math.min(Math.max(index + pas, 0), listeFleches.length - 1)
    changerFiltre(poserFleches)(listeFleches[suivant])
  }

  // --- Sélection et lettrage ------------------------------------------------

  const basculerCoche = (id) =>
    setCoches((liste) => (liste.includes(id) ? liste.filter((i) => i !== id) : [...liste, id]))

  const toutCocher = () =>
    setCoches((liste) => (liste.length === ecritures.length ? [] : ecritures.map((e) => e.id)))

  /**
   * Le « Solde sélection » du bandeau : débit moins crédit des lignes cochées.
   * Calculé à l'écran, sur les lignes sous les yeux - c'est tout son intérêt :
   * il doit suivre la case qu'on vient de cocher, sans aller-retour.
   */
  const soldeSelection = ecritures
    .filter((e) => coches.includes(e.id))
    .reduce((somme, e) => somme + Number(e.debit || 0) - Number(e.credit || 0), 0)

  const lettrer = async (defaire = false) => {
    if (!coches.length) {
      toast.info('Cochez les écritures à lettrer.')
      return
    }
    try {
      await request(`/interrogation-comptes/${defaire ? 'delettrer' : 'lettrer'}/`, {
        method: 'POST',
        body: JSON.stringify({ ids: coches }),
      })
      toast.success(
        defaire
          ? `${coches.length} écriture(s) délettrée(s)`
          : `${coches.length} écriture(s) lettrée(s)`,
      )
      setCoches([])
      await charger()
    } catch (e) {
      toast.error(`Lettrage impossible : ${messageErreur(e)}`)
    }
  }

  // --- Export et impression -------------------------------------------------

  const riche = nombre > 0

  // Les lignes cochées et leur état de lettrage : le bouton unique s'oriente
  // d'après elles. On ne peut ni lettrer du déjà-lettré ni délettrer du
  // non-lettré, donc la sélection suffit à trancher. Cochées toutes lettrées
  // -> « Délettrer » ; sinon -> « Lettrage ».
  const cochees = ecritures.filter((e) => coches.includes(e.id))
  const cochesLettrees = cochees.length > 0 && cochees.every((e) => e.lettree)

  /**
   * L'export porte sur **tout le périmètre filtré**, pas sur la page affichée.
   * Un export qui ne rendrait que les cinquante lignes sous les yeux sans le
   * dire serait le même mensonge qu'un filtre qui ne filtre pas. Les pages
   * sont rapatriées par cinq cents, avec la même borne que l'extrait imprimé.
   */
  const exporter = async () => {
    if (!riche) {
      toast.info('Rien à exporter : la vue est vide.')
      return
    }
    try {
      const PLAFOND = 5000
      const lignes = []
      let numero = 1
      while (lignes.length < Math.min(nombre, PLAFOND)) {
        const lot = await request(
          `/interrogation-comptes/?${requeteDe({ page: numero, taille: 500 })}`,
        )
        lignes.push(...lot.resultats)
        if (numero >= lot.pages) break
        numero += 1
      }
      const entetes = colonnes.map((c) => c.libelle).join(';')
      const corps = lignes.map((e) =>
        colonnes.map((c) => (c.rendu ? c.rendu(e) : (e[c.cle] ?? ''))).join(';'),
      )
      const blob = new Blob([`﻿${[entetes, ...corps].join('\n')}`], {
        type: 'text/csv;charset=utf-8;',
      })
      const lien = document.createElement('a')
      lien.href = URL.createObjectURL(blob)
      lien.download = `interrogation-${cleOnglet}-${exercice}.csv`
      lien.click()
      URL.revokeObjectURL(lien.href)
      toast.success(`${lignes.length.toLocaleString('fr-FR')} écriture(s) exportée(s)`)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  const imprimerExtrait = () => {
    if (!riche) {
      toast.info('Rien à imprimer : la vue est vide.')
      return
    }
    const intitule = compte ? nommerCompte(compte, '').replace(`${compte} - `, '') : ''
    const requete = requeteDe({ intitule })
    const nom = compte || tiers || cleOnglet
    ouvrirApercu({
      titre: `Extrait de compte ${nom}`,
      nomFichier: `extrait-${nom}`,
      charger: () => telecharger(`/interrogation-comptes/extrait/?${requete}`),
    })
  }

  const nbColonnes = colonnes.length + (onglet.tiers ? 1 : 0)

  /**
   * Les numéros de page à montrer : une fenêtre de cinq centrée sur la page
   * courante, recalée aux bords. Les afficher tous est impossible ici - une
   * année de grand livre fait des milliers de pages.
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
        <section className="ddb-contenu jc-page ic-page">
          {/* Le chapeau : ce qu'est la page, et l'exercice qu'on regarde.
              L'exercice est sorti des filtres - il commande tout le reste et
              ne se change pas aussi souvent qu'une société ou un tiers. */}
          <header className="ic-chapeau">
            <h2 className="ic-titre">{onglet.titre}</h2>

            <label className="ic-exercice">
              <span className="ic-exercice-etiquette">Exercice</span>
              <select
                className="ddb-filtre"
                value={exercice}
                onChange={(e) => changerExercice(e.target.value)}
              >
                {exercices.map((an) => (
                  <option key={an} value={an}>
                    {an}
                  </option>
                ))}
                <option value="tous">Tous</option>
              </select>
            </label>
          </header>

          {/* Les six familles de comptes, en cartes. Le libellé seul : les
              icônes ont été retirées le 2026-11-24, aucune n'étant assez
              parlante pour mériter sa place au-dessus du mot. */}
          <nav className="ic-onglets" aria-label="Familles de comptes">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`ic-onglet${o.cle === cleOnglet ? ' ic-onglet-actif' : ''}`}
                onClick={() => changerOnglet(o.cle)}
                aria-current={o.cle === cleOnglet ? 'page' : undefined}
              >
                <span className="ic-onglet-libelle">{o.libelle}</span>
              </button>
            ))}
          </nav>

          {/* Les filtres. L'ordre va du plus large au plus fin : la période,
              le journal, la société, le sélecteur de l'onglet, et la recherche
              libre en dernier. Les flèches de navigation ont été retirées le
              2026-11-09. */}
          <div className="ic-panneau">
            <div className="ic-panneau-tete">
              <p className="ic-panneau-titre">Filtres</p>
              {/* Un lien, pas un bouton : remettre les filtres à zéro ne vaut
                  pas le poids visuel d'Exporter ou d'Imprimer. */}
              <button type="button" className="ic-lien" onClick={reinitialiser}>
                Réinitialiser
              </button>
            </div>

            <div className="ic-barre">
              {/* La période : résumée comme dans l'original, dépliée au clic. */}
              <div className="ic-champ ic-periode">
                <span className="ic-etiquette">Période</span>
                <button
                  type="button"
                  className="ic-periode-resume"
                  onClick={() => setPeriodeOuverte((ouverte) => !ouverte)}
                >
                  {resumePeriode(du, au)}
                  <CIcon icon={cilChevronBottom} className="ic-periode-chevron" />
                </button>
                {periodeOuverte && (
                  <div className="ic-periode-champs">
                    <input
                      type="date"
                      className="ddb-champ"
                      value={du}
                      onChange={(e) => changerFiltre(setDu)(e.target.value)}
                      aria-label="Du"
                    />
                    <input
                      type="date"
                      className="ddb-champ"
                      value={au}
                      onChange={(e) => changerFiltre(setAu)(e.target.value)}
                      aria-label="Au"
                    />
                  </div>
                )}
              </div>

              {/* « Type d'Ecriture » garde l'orthographe de l'original, sans
                  accent sur le E. */}
              <label className="ic-champ">
                <span className="ic-etiquette">Type d&apos;Ecriture</span>
                <select
                  className="ddb-filtre"
                  value={journal}
                  onChange={(e) => changerFiltre(setJournal)(e.target.value)}
                >
                  <option value="ALL">Toutes les Ecritures</option>
                  {journaux.map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.code} - {j.libelle}
                    </option>
                  ))}
                </select>
              </label>

              {onglet.societeEnFiltre && (
                <label className="ic-champ">
                  <span className="ic-etiquette">Société</span>
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
              )}

              <label className="ic-champ">
                <span className="ic-etiquette">{onglet.etiquetteSelecteur}</span>
                <select
                  className="ddb-filtre"
                  value={valeurSelecteur}
                  onChange={(e) => changerFiltre(poserSelecteur)(e.target.value)}
                >
                  <option value="">{onglet.videSelecteur}</option>
                  {optionsSelecteur().map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.libelle}
                    </option>
                  ))}
                </select>
              </label>

              {onglet.tiers && (
                <label className="ic-champ">
                  <span className="ic-etiquette">{onglet.etiquetteTiers || 'Tiers'}</span>
                  <select
                    className="ddb-filtre"
                    value={tiers}
                    onChange={(e) => changerFiltre(setTiers)(e.target.value)}
                  >
                    <option value="">Tous</option>
                    {listeTiers.map((t) => (
                      <option key={t.tiers} value={t.tiers}>
                        {nommerTiers(t.tiers)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="ic-champ">
                <span className="ic-etiquette">Recherche</span>
                <input
                  className="ddb-filtre"
                  placeholder="N° de pièce, libellé, compte…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </label>
            </div>

            {/* Le pied du panneau : les actions, poussées à droite. La
                recherche part toute seule à chaque frappe, aucun bouton ne la
                déclenche. Le compte des écritures trouvées a été retiré - la
                pagination le dit déjà, en bas. */}
            <div className="ic-panneau-pied">
              <div className="ic-panneau-actions">
                {/* Un seul bouton pour le lettrage : il s'oriente d'après les
                    lignes cochées - déjà lettrées, il délettre ; sinon, il
                    lettre. Il n'existe que là où il y a un tiers : sur une
                    charge ou une banque, il n'y a rien à apparier. */}
                {onglet.tiers && (
                  <button
                    type="button"
                    className="ic-btn ic-btn-sec"
                    onClick={() => lettrer(cochesLettrees)}
                    /* Pas de `disabled` : l'original laisse Lettrage actif même
                       sans ligne cochée, pendant qu'Export et Imprimer
                       pâlissent (capture 75). C'est de la logique, pas du
                       design : on garde celle de LAMPS. */
                    title={
                      cochesLettrees
                        ? 'Retirer le lettrage des écritures cochées'
                        : 'Apparier les écritures cochées'
                    }
                  >
                    <CIcon icon={cilLink} /> {cochesLettrees ? 'Délettrer' : 'Lettrage'}
                  </button>
                )}
                <BoutonExport onClick={exporter} disabled={!riche} />
                <button
                  type="button"
                  className="ic-btn ic-btn-primary"
                  onClick={imprimerExtrait}
                  disabled={!riche}
                >
                  <CIcon icon={cilPrint} /> Imprimer
                </button>
              </div>
            </div>
          </div>

          {/* Le bandeau de contrôle. Les totaux portent sur TOUTE la période
              filtrée, jamais sur les seules lignes affichées. */}
          <div className="ic-bandeau">
            <div className="ic-totaux">
              <div className="ic-total">
                <span className="ic-total-etiquette">Total débit</span>
                <span className="ic-total-valeur">
                  {montant(totaux?.debit ?? 0)} <span className="ic-devise">FCFA</span>
                </span>
              </div>
              <span className="ic-bandeau-filet" aria-hidden="true" />
              <div className="ic-total">
                <span className="ic-total-etiquette">Total crédit</span>
                <span className="ic-total-valeur">
                  {montant(totaux?.credit ?? 0)} <span className="ic-devise">FCFA</span>
                </span>
              </div>
              <span className="ic-bandeau-filet" aria-hidden="true" />
              <div className="ic-total">
                <span className="ic-total-etiquette">Solde général</span>
                <span className="ic-total-valeur ic-solde">
                  {montant(totaux?.solde ?? 0)} <span className="ic-devise">FCFA</span>
                </span>
              </div>
            </div>

            {/* Le solde de la sélection, cœur du lettrage : il tombe à zéro
                quand la facture et son règlement sont cochés ensemble. Il
                n'existe que là où le lettrage existe. */}
            {onglet.tiers && (
              <span className="ic-bandeau-selection">
                Solde sélectionné{' '}
                <strong>
                  {montant(soldeSelection)} <span className="ic-devise">FCFA</span>
                </strong>
              </span>
            )}
          </div>

          <div className="ddb-tableau-conteneur jc-tableau-conteneur">
            <table className="ddb-tableau tableau-dense jc-tableau ic-tableau">
              <thead>
                <tr>
                  {/* La case d'en-tête n'existe que là où le lettrage existe. */}
                  {onglet.tiers && (
                    <th className="ic-case">
                      <input
                        type="checkbox"
                        checked={coches.length > 0 && coches.length === ecritures.length}
                        onChange={toutCocher}
                        aria-label="Tout cocher"
                      />
                    </th>
                  )}
                  {colonnes.map((c) => (
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
                    <td colSpan={nbColonnes} className="jc-vide">
                      Chargement…
                    </td>
                  </tr>
                )}
                {!chargement && ecritures.length === 0 && (
                  <tr>
                    <td colSpan={nbColonnes} className="jc-vide">
                      Aucune écriture sur cette période.
                    </td>
                  </tr>
                )}
                {!chargement &&
                  ecritures.map((e) => (
                    <tr key={e.id} className={e.lettree ? 'ic-lettree' : undefined}>
                      {onglet.tiers && (
                        <td className="ic-case">
                          <input
                            type="checkbox"
                            checked={coches.includes(e.id)}
                            onChange={() => basculerCoche(e.id)}
                            aria-label={`Sélectionner la pièce ${e.numPiece}`}
                          />
                        </td>
                      )}
                      {colonnes.map((c) => {
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
                            {/* Le tiret ne va QUE sur les colonnes de
                                montants. Là, une case vide est un vrai
                                renseignement - l'écriture porte un débit OU un
                                crédit - et le blanc se lirait comme une
                                colonne sautée. Ailleurs (n° de chèque, compte
                                tiers, matricule), l'absence est le cas normal :
                                la remplir d'un tiret ajoutait jusqu'à quatre
                                marques par ligne pour ne rien dire. Tiret
                                simple, jamais le cadratin. */}
                            {valeur || (c.aligne ? <span className="ic-vide">-</span> : '')}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <footer className="ic-pagination">
            <div className="ic-pagination-outils">
              <label className="ic-pagination-taille">
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

              <nav className="ic-pages" aria-label="Pagination">
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
                {/* Une fenêtre de cinq numéros autour de la page courante :
                    au-delà, la liste des pages serait plus longue que le
                    tableau (243 000 écritures font 4 860 pages). */}
                {pagesVisibles.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={p === page ? 'ic-page-active' : undefined}
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
        </section>
      </CCardBody>
    </CCard>
  )
}

export default InterrogationComptes
