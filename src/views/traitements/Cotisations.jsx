/**
 * Page « Traitements → Cotisations » (captures 81 à 83).
 *
 * **La recette de l'IPM.** Tout le reste du module dépense - bons, factures,
 * remboursements, règlements. Cet écran est le seul qui crée du produit : il
 * appelle chaque mois, auprès des sociétés adhérentes et de leurs salariés,
 * les cotisations qui financent les remboursements. C'est la contrepartie
 * exacte des charges techniques du 602 : le produit 701.
 *
 * Deux onglets, qui sont un avant et un après :
 *
 *   - **Saisie cotisations** travaille **à la pièce comptable**. Un appel =
 *     une ligne, ses deux mouvements, son état. Les onze colonnes sont celles
 *     du grand livre, et le bandeau « Solde débit / Solde crédit » porte deux
 *     fois le même nombre - une cotisation est équilibrée par construction.
 *     C'est de là qu'on comptabilise.
 *   - **Appels cotisations** travaille **au cotisant**. La liste nominative,
 *     avec devant chaque nom le montant dû, son en-tête « 219 Cotisants -
 *     Total Cotisé: 394 200 », son export et son import.
 *
 * Ce que la page ne fait pas, et c'est voulu : **elle ne descend pas le détail
 * nominatif en comptabilité**. Les 219 lignes d'un appel réel donnent deux
 * écritures, pas 219, parce que l'adhérent est un compte collectif. Le détail
 * vit dans l'appel (docs/lamps/cotisations.md §2).
 *
 * Comme le Journal Central et l'Interrogation Compte, la page ne passe pas par
 * <Referentiel /> : un appel n'est pas une fiche, et ses deux onglets ne
 * partagent ni colonnes ni boutons.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BoutonExport from '../../components/BoutonExport'
import { CCard, CCardBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCalculator,
  cilCloudDownload,
  cilCloudUpload,
  cilPrint,
  cilSpreadsheet,
  cilTrash,
} from '@coreui/icons'

import { request, telecharger } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { ouvrirApercu } from '../../services/apercu'
import '../donnees-de-base/donnees-de-base.scss'
import '../comptabilite/journal-central.scss'
import './cotisations.scss'
import CotisationModal from './CotisationModal'
import { codeAppel, exporterAppel, lireAppelExcel, rapprocher } from './cotisationsExcel'

const MOIS = [
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

const montant = (valeur) =>
  valeur === null || valeur === undefined ? '' : Number(valeur).toLocaleString('fr-FR')

const dateCourte = (iso) => {
  if (!iso) return ''
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

const moisAbrege = (iso) => {
  if (!iso) return ''
  const [a, m] = iso.split('-')
  return `${ABREGES[Number(m) - 1]}-${a}`
}

/**
 * Les onze colonnes de l'onglet Saisie, dans l'ordre de l'original.
 *
 * `Mvts Débit` et `Mvts Crédit` portent le même nombre. L'original les montre
 * tout de même toutes les deux, et il a raison : c'est ce qui permet de voir
 * d'un coup d'oeil qu'aucune pièce ne boite, sans ouvrir le grand livre.
 */
const COLONNES_SAISIE = [
  { cle: 'cJl', libelle: 'C.JL' },
  { cle: 'datePiece', libelle: 'Date pièce', rendu: (a) => dateCourte(a.datePiece) },
  { cle: 'dateSaisie', libelle: 'Date saisie', rendu: (a) => dateCourte(a.dateSaisie) },
  { cle: 'numPiece', libelle: 'N° pièce' },
  { cle: 'compteGen', libelle: 'Cpte. Gen.' },
  { cle: 'moisTrait', libelle: 'Mois trait', rendu: (a) => moisAbrege(a.moisTrait) },
  { cle: 'libelle', libelle: 'Libellé' },
  { cle: 'societe', libelle: 'Société' },
  { cle: 'mvtDebit', libelle: 'Mvts Débit', nombre: true, rendu: (a) => montant(a.mvtDebit) },
  { cle: 'mvtCredit', libelle: 'Mvts Crédit', nombre: true, rendu: (a) => montant(a.mvtCredit) },
]

const COLONNES_APPEL = [
  { cle: 'codeCotis', libelle: 'Code Cotis.' },
  { cle: 'matricule', libelle: 'Matricule' },
  { cle: 'codeSoc', libelle: 'Code soc' },
  { cle: 'prenoms', libelle: 'Prénom' },
  { cle: 'nom', libelle: 'Nom' },
  { cle: 'adresse', libelle: 'Adresse' },
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'montant', libelle: 'Cotisation Dûe', nombre: true, rendu: (l) => montant(l.montant) },
]

const Cotisations = () => {
  // L'écran ouvre sur **Appels**, et non sur Saisie comme l'original.
  //
  // Le métier l'a dit le 2026-11-03 : à l'IPM, l'onglet Saisie **ne sert
  // jamais**. Les neuf appels du mois se font tous par le fichier de la paie,
  // y compris les forfaitaires - le modèle qu'ils nous ont remis porte un
  // `C500`, qui est pourtant un forfait à 1 800. La base de production le
  // confirme en creux : certains appels forfaitaires mêlent des montants et
  // des zéros, ce qu'un formulaire, qui applique la même somme à tout le
  // monde, ne peut pas produire.
  //
  // L'onglet Saisie reste en place - c'est la vue comptable du mois, et
  // LAMPS l'a - mais il n'est plus la porte d'entrée.
  const [onglet, setOnglet] = useState('appels')
  const [references, setReferences] = useState({ societes: [], types: [] })

  // --- Onglet Saisie --------------------------------------------------------
  //
  // L'écran s'ouvre sur le mois en cours, comme l'original. `new Date()` est
  // lu dans l'initialiseur paresseux de chaque état, et non dans le corps du
  // rendu : une horloge appelée à chaque rendu rend le composant impur.
  const [annee, setAnnee] = useState(() => String(new Date().getFullYear()))
  const [mois, setMois] = useState(() => String(new Date().getMonth() + 1))
  const [annees, setAnnees] = useState(() => [new Date().getFullYear()])
  const [appels, setAppels] = useState([])
  const [totaux, setTotaux] = useState({ debit: 0, credit: 0 })
  const [coches, setCoches] = useState([])
  const [chargement, setChargement] = useState(false)
  const [modalOuvert, setModalOuvert] = useState(false)

  // --- Onglet Appels --------------------------------------------------------
  const [societeAppel, setSocieteAppel] = useState('')
  const [typeAppel, setTypeAppel] = useState('')
  const [anneeAppel, setAnneeAppel] = useState(() => String(new Date().getFullYear()))
  const [moisAppel, setMoisAppel] = useState(() => String(new Date().getMonth() + 1))
  const [recherche, setRecherche] = useState('')
  const [detail, setDetail] = useState(null)
  const [lignes, setLignes] = useState([])
  // La colonne de cases de l'original (capture 83) : l'onglet Appels a la
  // même en-tête à cocher que l'onglet Saisie, et le même couple de boutons
  // pâlis tant que rien n'est sélectionné.
  const [cochesAppel, setCochesAppel] = useState([])
  const [chargementAppel, setChargementAppel] = useState(false)
  const fichier = useRef(null)

  // --- Chargements ----------------------------------------------------------

  useEffect(() => {
    request('/cotisations/references/')
      .then(setReferences)
      .catch((e) => toast.error(`Référentiels indisponibles : ${messageErreur(e)}`))
    request('/cotisations/periodes/')
      .then((liste) => liste.length && setAnnees(liste))
      .catch(() => {})
  }, [])

  const chargerSaisie = useCallback(async () => {
    try {
      setChargement(true)
      const requete = new URLSearchParams({ annee, mois }).toString()
      const [liste, soldes] = await Promise.all([
        request(`/cotisations/?${requete}`),
        request(`/cotisations/totaux/?${requete}`),
      ])
      setAppels(Array.isArray(liste) ? liste : liste.resultats || [])
      setTotaux(soldes)
      setCoches([])
    } catch (e) {
      toast.error(`Lecture impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [annee, mois])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (onglet === 'saisie') chargerSaisie()
  }, [onglet, chargerSaisie])

  /**
   * L'onglet Appels n'affiche qu'un appel à la fois : société, mois et type
   * **forment la clé**, et il n'y a donc rien à lister tant que les quatre
   * sélecteurs ne sont pas posés. C'est ce que fait l'original, dont l'en-tête
   * nomme l'appel unique qu'il montre.
   */
  const chargerAppel = useCallback(async () => {
    // Toute relecture repart sans sélection : les identifiants de lignes
    // changent d'un appel à l'autre, et une case cochée sur l'appel d'avant
    // n'aurait plus de sens.
    setCochesAppel([])
    if (!societeAppel || !typeAppel) {
      setDetail(null)
      setLignes([])
      return
    }
    try {
      setChargementAppel(true)
      const requete = new URLSearchParams({
        annee: anneeAppel,
        mois: moisAppel,
        societe: societeAppel,
        journal: typeAppel,
      }).toString()
      const liste = await request(`/cotisations/?${requete}`)
      const trouves = Array.isArray(liste) ? liste : liste.resultats || []
      if (!trouves.length) {
        setDetail(null)
        setLignes([])
        return
      }
      const parametres = recherche ? `?recherche=${encodeURIComponent(recherche)}` : ''
      const complet = await request(`/cotisations/${trouves[0].id}/lignes/${parametres}`)
      setDetail(complet)
      setLignes(complet.lignes || [])
    } catch (e) {
      toast.error(`Lecture impossible : ${messageErreur(e)}`)
    } finally {
      setChargementAppel(false)
    }
  }, [societeAppel, typeAppel, anneeAppel, moisAppel, recherche])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (onglet === 'appels') chargerAppel()
  }, [onglet, chargerAppel])

  // --- Actions de l'onglet Saisie -------------------------------------------

  const basculer = (id) =>
    setCoches((liste) => (liste.includes(id) ? liste.filter((n) => n !== id) : [...liste, id]))

  const toutBasculer = () =>
    setCoches((liste) => (liste.length === appels.length ? [] : appels.map((a) => a.id)))

  const comptabiliser = async () => {
    try {
      const resultat = await request('/cotisations/comptabiliser/', {
        method: 'POST',
        body: JSON.stringify({ appels: coches }),
      })
      toast.success(resultat.message)
      if (resultat.refuses?.length) {
        toast.info(`Sans montant, donc refusé(s) : ${resultat.refuses.join(', ')}`)
      }
      chargerSaisie()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const supprimer = async () => {
    const cibles = appels.filter((a) => coches.includes(a.id))
    const bloques = cibles.filter((a) => a.comptabilise)
    if (bloques.length) {
      toast.info(
        `Comptabilisé(s), donc non supprimable(s) : ${bloques.map((a) => a.code).join(', ')}`,
      )
      return
    }
    if (
      !window.confirm(
        `Supprimer ${cibles.length} appel(s) et leurs lignes ? Cette action est définitive.`,
      )
    ) {
      return
    }
    try {
      await Promise.all(cibles.map((a) => request(`/cotisations/${a.id}/`, { method: 'DELETE' })))
      toast.success(`${cibles.length} appel(s) supprimé(s)`)
      chargerSaisie()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const imprimer = () =>
    ouvrirApercu({
      titre: `Cotisations ${MOIS[Number(mois) - 1]} ${annee}`,
      nomFichier: `cotisations-${annee}-${mois}`,
      charger: () => telecharger(`/cotisations/etat/?annee=${annee}&mois=${mois}`),
    })

  // --- Actions de l'onglet Appels -------------------------------------------

  const basculerLigne = (id) =>
    setCochesAppel((liste) => (liste.includes(id) ? liste.filter((n) => n !== id) : [...liste, id]))

  const toutBasculerLignes = () =>
    setCochesAppel((liste) => (liste.length === lignes.length ? [] : lignes.map((l) => l.id)))

  /**
   * Le bouton « Appel Cotisations » : dérouler la liste nominative.
   *
   * Il fait les deux choses que son nom promet, selon qu'un appel existe déjà
   * pour la société, le mois et le type choisis :
   *
   *   - **rien encore** : il crée l'appel et pose une ligne par cotisant, **à
   *     zéro**. Les montants viendront ensuite, de l'import pour une
   *     cotisation proportionnelle. Rien n'est proposé d'office, et un appel
   *     resté à zéro ne peut pas se comptabiliser : c'est ce qui empêche de
   *     reproduire les 18 appels morts de LAMPS, tous nés d'un montant par
   *     défaut validé sans qu'on y touche.
   *   - **un appel existe** : il le redéroule, pour tenir compte d'une
   *     embauche ou d'un départ depuis sa création.
   *
   * Un forfait, lui, se saisit depuis l'autre onglet : son modal demande le
   * montant, qui vaut alors pour tout le monde.
   */
  const appelerCotisations = async () => {
    if (!societeAppel || !typeAppel) return
    try {
      if (detail?.appel) {
        const resultat = await request(`/cotisations/${detail.appel.id}/appeler/`, {
          method: 'POST',
          body: JSON.stringify({}),
        })
        toast.success(resultat.message)
      } else {
        const appel = await request('/cotisations/', {
          method: 'POST',
          body: JSON.stringify({
            societe: societeAppel,
            journal: typeAppel,
            annee: Number(anneeAppel),
            mois: Number(moisAppel),
            datePiece: new Date().toISOString().slice(0, 10),
          }),
        })
        toast.success(
          `Appel ${appel.code} ouvert : ${appel.cotisants} cotisant(s). ` +
            'Portez les montants par Importer Cotisations.',
        )
      }
      chargerAppel()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  /**
   * L'export, et l'import qui lui répond, sont **la vraie mécanique des
   * cotisations proportionnelles** : quatre journaux sur neuf ont un montant
   * différent par tête, et il vient de la paie. Sans ce couple, un appel
   * C510 ou C920 ne peut pas être chargé. Ce n'est pas un confort.
   *
   * Le classeur est celui de l'IPM, à la colonne près (cotisationsExcel.js) :
   * on exporte dans la forme que la paie sait remplir, et on réimporte celle
   * qu'elle renvoie.
   */
  const exporter = async () => {
    if (!lignes.length) {
      toast.info('Rien à exporter.')
      return
    }
    try {
      const ecrites = await exporterAppel(detail.appel, lignes, {
        annee: anneeAppel,
        mois: moisAppel,
      })
      toast.success(`${ecrites} ligne(s) exportée(s)`)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Charge le fichier de la paie, **et ouvre l'appel s'il n'existe pas**.
   *
   * C'est le deuxième tour de la même leçon que « Appel Cotisations » : un
   * bouton pâli n'explique rien à qui le regarde. Le métier a redemandé le
   * 2026-11-03 pourquoi l'import ne s'ouvrait pas, alors que l'écran le
   * disait deux fois. On ne le dit plus, on le fait : avec une société et un
   * type choisis, déposer le fichier **crée l'appel puis le remplit**. C'est
   * d'ailleurs le fichier qui dit de quel appel il est - sa première colonne
   * porte le code.
   *
   * La lecture précède donc la création, et deux refus tombent **avant toute
   * écriture** : un fichier qui nomme un autre appel, et un fichier dont
   * aucune ligne n'est exploitable. Les matricules isolés, eux, sont
   * seulement signalés : un agent parti en cours de mois figure encore sur
   * l'état de la paie.
   */
  const importer = async (evenement) => {
    const choisi = evenement.target.files?.[0]
    evenement.target.value = ''
    if (!choisi || !societeAppel || !typeAppel) return
    try {
      const lu = await lireAppelExcel(choisi)
      const attendu =
        detail?.appel?.code || codeAppel(societeAppel, anneeAppel, moisAppel, typeAppel)
      const etranger = lu.codes.find((code) => code !== attendu)
      if (etranger) {
        toast.error(
          `Ce fichier est celui de l'appel ${etranger}, ` +
            `pas de ${attendu}. Rien n'a été chargé.`,
        )
        return
      }
      if (!lu.rangs.length) {
        toast.error('Le fichier ne porte aucune ligne.')
        return
      }

      // L'appel peut n'exister que dans ce fichier : on l'ouvre pour lui.
      let appel = detail?.appel
      let cotisants = lignes
      if (!appel) {
        appel = await request('/cotisations/', {
          method: 'POST',
          body: JSON.stringify({
            societe: societeAppel,
            journal: typeAppel,
            annee: Number(anneeAppel),
            mois: Number(moisAppel),
            datePiece: new Date().toISOString().slice(0, 10),
          }),
        })
        const complet = await request(`/cotisations/${appel.id}/lignes/`)
        cotisants = complet.lignes || []
        toast.info(`Appel ${appel.code} ouvert : ${appel.cotisants} cotisant(s).`)
      }

      const { lignes: charge, horsAppel } = rapprocher(lu.rangs, cotisants)
      if (!charge.length) {
        toast.error(`Aucun des ${horsAppel.length} matricules du fichier n'est de cet appel.`)
        chargerAppel()
        return
      }
      const resultat = await request(`/cotisations/${appel.id}/modifier-lignes/`, {
        method: 'POST',
        body: JSON.stringify({ lignes: charge }),
      })
      toast.success(resultat.message)
      if (horsAppel.length) {
        toast.info(`Hors de l'appel : ${horsAppel.slice(0, 8).join(', ')}`)
      }
      chargerAppel()
    } catch (e) {
      toast.error(`Import impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * Comptabiliser depuis l'onglet Appels.
   *
   * La sélection commande le bouton, comme dans l'original, mais elle ne
   * découpe pas la pièce : **une pièce comptable = un appel**. Les 219 lignes
   * d'un appel réel donnent deux écritures agrégées, jamais 219 (capture de
   * la pièce `01-2024-8-C910`). Cocher trois lignes ne peut donc pas
   * comptabiliser trois lignes - l'écran le dit au lieu de le taire.
   */
  const comptabiliserAppel = async () => {
    if (!detail?.appel || !cochesAppel.length) return
    if (
      cochesAppel.length < lignes.length &&
      !window.confirm(
        'Une pièce comptable couvre l’appel entier : les ' +
          `${lignes.length} lignes seront comptabilisées, pas seulement les ` +
          `${cochesAppel.length} cochées. Continuer ?`,
      )
    ) {
      return
    }
    try {
      const resultat = await request('/cotisations/comptabiliser/', {
        method: 'POST',
        body: JSON.stringify({ appels: [detail.appel.id] }),
      })
      toast.success(resultat.message)
      chargerAppel()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const supprimerAppel = async () => {
    if (!detail?.appel || detail.appel.comptabilise) return
    if (!window.confirm(`Supprimer l'appel ${detail.appel.code} et ses lignes ?`)) return
    try {
      await request(`/cotisations/${detail.appel.id}/`, { method: 'DELETE' })
      toast.success(`Appel ${detail.appel.code} supprimé`)
      chargerAppel()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  // --- Rendu ----------------------------------------------------------------

  const rienDeCoche = coches.length === 0
  const appelComptabilise = detail?.appel?.comptabilise

  const selecteurAnnee = (valeur, poser) => (
    <select className="ddb-filtre" value={valeur} onChange={(e) => poser(e.target.value)}>
      {annees.map((an) => (
        <option key={an} value={an}>
          {an}
        </option>
      ))}
    </select>
  )

  const selecteurMois = (valeur, poser) => (
    <select className="ddb-filtre" value={valeur} onChange={(e) => poser(e.target.value)}>
      {MOIS.map((nom, index) => (
        <option key={nom} value={index + 1}>
          {nom}
        </option>
      ))}
    </select>
  )

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu cot-page">
          <h2 className="jc-titre">Cotisations</h2>

          <nav className="cot-onglets" aria-label="Onglets des cotisations">
            {[
              ['saisie', 'Saisie cotisations'],
              ['appels', 'Appels cotisations'],
            ].map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                className={`cot-onglet${cle === onglet ? ' cot-onglet-actif' : ''}`}
                onClick={() => setOnglet(cle)}
              >
                {libelle}
              </button>
            ))}
          </nav>

          {onglet === 'saisie' ? (
            <>
              {/* Les deux soldes portent le même nombre : une cotisation est
                  équilibrée. Les montrer tous les deux donne le moyen de le
                  vérifier d'un coup d'oeil. */}
              <p className="cot-soldes">
                Solde débit : <strong>{montant(totaux.debit)}</strong>
                <span className="cot-separateur"> - </span>
                Solde crédit : <strong>{montant(totaux.credit)}</strong>
              </p>

              <div className="cot-barre">
                {selecteurAnnee(annee, setAnnee)}
                {selecteurMois(mois, setMois)}

                <div className="cot-boutons">
                  <button
                    type="button"
                    className="cot-bouton cot-bouton-danger"
                    onClick={supprimer}
                    disabled={rienDeCoche}
                  >
                    <CIcon icon={cilTrash} className="cot-icone" />
                    Supprimer
                  </button>
                  <button
                    type="button"
                    className="cot-bouton cot-bouton-rouge"
                    onClick={() => setModalOuvert(true)}
                  >
                    Nouvelle cotisation
                  </button>
                  <button
                    type="button"
                    className="cot-bouton cot-bouton-encre"
                    onClick={comptabiliser}
                    disabled={rienDeCoche}
                  >
                    <CIcon icon={cilCalculator} className="cot-icone" />
                    Comptabiliser
                  </button>
                  <button type="button" className="cot-bouton cot-bouton-encre" onClick={imprimer}>
                    <CIcon icon={cilPrint} className="cot-icone" />
                    Imprimer
                  </button>
                  {/* Pas de bouton « Actualiser » : la liste se recharge
                      d'elle-même à l'ouverture de l'onglet, et après chaque
                      action (saisie d'un appel, comptabilisation). */}
                </div>
              </div>

              <div className="tableau-conteneur cot-tableau-cadre">
                <table className="table ddb-tableau cot-tableau">
                  <thead>
                    <tr>
                      <th className="cot-case">
                        <input
                          type="checkbox"
                          checked={appels.length > 0 && coches.length === appels.length}
                          onChange={toutBasculer}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      {COLONNES_SAISIE.map((c) => (
                        <th key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                          {c.libelle}
                        </th>
                      ))}
                      <th>Comptabilisé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargement && (
                      <tr>
                        <td colSpan={COLONNES_SAISIE.length + 2} className="text-center py-4">
                          <CSpinner size="sm" />
                        </td>
                      </tr>
                    )}
                    {!chargement && !appels.length && (
                      <tr>
                        <td colSpan={COLONNES_SAISIE.length + 2} className="cot-vide">
                          Aucune cotisation pour {MOIS[Number(mois) - 1]} {annee}.
                        </td>
                      </tr>
                    )}
                    {!chargement &&
                      appels.map((appel) => (
                        <tr key={appel.id} className={appel.comptabilise ? 'cot-fige' : undefined}>
                          <td className="cot-case">
                            <input
                              type="checkbox"
                              checked={coches.includes(appel.id)}
                              onChange={() => basculer(appel.id)}
                              aria-label={`Sélectionner ${appel.code}`}
                            />
                          </td>
                          {COLONNES_SAISIE.map((c) => (
                            <td key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                              {c.rendu ? c.rendu(appel) : (appel[c.cle] ?? '')}
                            </td>
                          ))}
                          <td>
                            <span
                              className={`cot-badge${appel.comptabilise ? ' cot-badge-ok' : ''}`}
                            >
                              {appel.comptabilise ? 'Comptabilisé' : 'Ouvert'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {/* L'en-tête de l'original : la période, l'appel nommé en
                  entier, puis « 219 Cotisants - Total Cotisé: 394 200 ». */}
              <div className="cot-entete-appel">
                {detail ? (
                  <>
                    <p className="cot-entete-periode">
                      {MOIS[Number(moisAppel) - 1]} {anneeAppel}
                    </p>
                    <p className="cot-entete-titre">{detail.entete.titre}</p>
                    <p className="cot-entete-total">
                      {detail.entete.cotisants} Cotisants - Total Cotisé:{' '}
                      {montant(detail.entete.total)}
                    </p>
                  </>
                ) : (
                  <p className="cot-entete-vide">
                    {societeAppel && typeAppel
                      ? `Aucun appel ${typeAppel} pour cette société en ` +
                        `${MOIS[Number(moisAppel) - 1]} ${anneeAppel}. ` +
                        'Appel Cotisations déroule la liste des cotisants.'
                      : 'Choisissez une société et un type pour ouvrir son appel.'}
                  </p>
                )}
              </div>

              <div className="cot-barre">
                <label className="ddb-recherche-flottante cot-recherche">
                  <span className="ddb-recherche-libelle">Rechercher…</span>
                  <input
                    className="ddb-recherche-champ"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </label>
                {selecteurAnnee(anneeAppel, setAnneeAppel)}
                {selecteurMois(moisAppel, setMoisAppel)}
                <select
                  className="ddb-filtre cot-large"
                  value={societeAppel}
                  onChange={(e) => setSocieteAppel(e.target.value)}
                >
                  <option value="">Société…</option>
                  {references.societes.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.intitule}
                    </option>
                  ))}
                </select>
                <select
                  className="ddb-filtre cot-large"
                  value={typeAppel}
                  onChange={(e) => setTypeAppel(e.target.value)}
                >
                  <option value="">Type de cotisation…</option>
                  {references.types.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.intitule}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cot-barre cot-barre-boutons">
                <button
                  type="button"
                  className="cot-bouton"
                  onClick={appelerCotisations}
                  disabled={!societeAppel || !typeAppel || appelComptabilise}
                >
                  <CIcon icon={cilCloudUpload} className="cot-icone" />
                  Appel Cotisations
                </button>
                <button
                  type="button"
                  className="cot-bouton cot-bouton-danger"
                  onClick={supprimerAppel}
                  disabled={!detail || appelComptabilise}
                >
                  <CIcon icon={cilTrash} className="cot-icone" />
                  Supprimer
                </button>
                <button
                  type="button"
                  className="cot-bouton"
                  onClick={comptabiliserAppel}
                  disabled={!detail || appelComptabilise || !cochesAppel.length}
                  title={
                    appelComptabilise
                      ? 'Appel déjà comptabilisé.'
                      : cochesAppel.length
                        ? 'Comptabiliser cet appel : deux écritures, Dr société / Cr produit.'
                        : 'Cochez au moins une ligne.'
                  }
                >
                  <CIcon icon={cilCalculator} className="cot-icone" />
                  Comptabiliser
                </button>
                <BoutonExport onClick={exporter} disabled={!lignes.length} />
                {/* Pâli sur un appel comptabilisé : on peut encore l'exporter
                    pour contrôle, mais plus y réinjecter de montants. Hors ce
                    cas, il suffit d'une société et d'un type : si l'appel
                    n'existe pas, le fichier l'ouvre. */}
                <button
                  type="button"
                  className="cot-bouton cot-bouton-bleu"
                  onClick={() => fichier.current?.click()}
                  disabled={!societeAppel || !typeAppel || appelComptabilise}
                  title={
                    appelComptabilise
                      ? 'Appel comptabilisé : ses montants sont figés.'
                      : 'Charger le fichier de la paie (il ouvre l’appel au besoin).'
                  }
                >
                  <CIcon icon={cilCloudDownload} className="cot-icone" />
                  Importer Cotisations
                </button>
                <input
                  ref={fichier}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="d-none"
                  onChange={importer}
                />
                {/* Pas de bouton « Actualiser » : les lignes se rechargent
                    d'elles-mêmes à l'ouverture de l'onglet, et après chaque
                    action (appel, import, comptabilisation, suppression). */}
              </div>

              <div className="tableau-conteneur cot-tableau-cadre">
                <table className="table ddb-tableau cot-tableau">
                  <thead>
                    <tr>
                      <th className="cot-case">
                        <input
                          type="checkbox"
                          checked={lignes.length > 0 && cochesAppel.length === lignes.length}
                          onChange={toutBasculerLignes}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      {COLONNES_APPEL.map((c) => (
                        <th key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                          {c.libelle}
                        </th>
                      ))}
                      <th>Etat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargementAppel && (
                      <tr>
                        <td colSpan={COLONNES_APPEL.length + 2} className="text-center py-4">
                          <CSpinner size="sm" />
                        </td>
                      </tr>
                    )}
                    {!chargementAppel && !lignes.length && (
                      <tr>
                        <td colSpan={COLONNES_APPEL.length + 2} className="cot-vide">
                          {detail
                            ? 'Aucun cotisant sur cet appel.'
                            : societeAppel && typeAppel
                              ? 'Aucun appel ouvert. Cliquez sur « Appel Cotisations ».'
                              : 'Choisissez une société et un type.'}
                        </td>
                      </tr>
                    )}
                    {!chargementAppel &&
                      lignes.map((ligne) => (
                        <tr key={ligne.id}>
                          <td className="cot-case">
                            <input
                              type="checkbox"
                              checked={cochesAppel.includes(ligne.id)}
                              onChange={() => basculerLigne(ligne.id)}
                              aria-label={`Sélectionner ${ligne.matricule}`}
                            />
                          </td>
                          {COLONNES_APPEL.map((c) => (
                            <td key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                              {c.rendu ? c.rendu(ligne) : (ligne[c.cle] ?? '')}
                            </td>
                          ))}
                          <td>
                            <span
                              className={`cot-badge${appelComptabilise ? ' cot-badge-ok' : ''}`}
                            >
                              {appelComptabilise ? 'Comptabilisé' : 'Ouvert'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </CCardBody>

      {/* La clé remonte le modal à chaque ouverture : son état repart à
          neuf sans qu'il ait à s'en charger lui-même. */}
      <CotisationModal
        key={modalOuvert ? 'ouvert' : 'ferme'}
        visible={modalOuvert}
        references={references}
        onFermer={() => setModalOuvert(false)}
        onCree={chargerSaisie}
      />
    </CCard>
  )
}

export default Cotisations
