/**
 * Page « Traitements → Retenues Frais Médicaux » (captures 86 à 91).
 *
 * **Le recouvrement de ce que l'IPM a avancé.** Quand un participant va chez
 * le médecin, l'IPM règle le prestataire en entier, puis porte au débit du
 * compte 411 de l'agent la part qui lui revient - le ticket modérateur. Cette
 * dette ne se paie pas au guichet : elle se prélève sur le salaire. Cette
 * page est la courroie entre l'IPM et la paie, et la seule du module qui
 * travaille avec un logiciel extérieur : **Sage**.
 *
 * Le circuit est contraignant, et chacun de ses trois temps passe par un
 * modal - c'est l'original qui en décide ainsi, et il a raison : chacun de
 * ces gestes engage quelque chose qu'on ne défait pas facilement.
 *
 *   1. **Appel Retenues** (capture 86) photographie la dette de chaque agent.
 *      Tant qu'il n'a pas été fait, la table est vide et l'import n'a rien à
 *      remplir.
 *   2. **Importer Retenues** (capture 87) ouvre le fichier de la paie et en
 *      montre le **total**, que l'agent compare à la règle sur son livre de
 *      paie imprimé. C'est le seul contrôle de toute la chaîne.
 *   3. **Comptabiliser** (capture 88) montre les écritures, où l'on vérifie
 *      que débit égale crédit, puis pose la pièce au journal RP.
 *   4. **Export Excel** (capture 89) renvoie à la paie la dette restante. La
 *      boucle se referme, et le mois suivant repart de là.
 *
 * Deux faits commandent tout le reste, et ils viennent de la production
 * (20 136 lignes, 144 campagnes, docs/lamps/retenues-frais-medicaux.md) :
 *
 *   - **L'IPM ne calcule pas la retenue.** Sa colonne « Retenue IPM » vaut
 *     `min(solde, 35 000)` et ne part jamais en comptabilité : sur les 142
 *     pièces réelles, le montant comptabilisé est 142 fois celui de la paie.
 *     On garde la proposition pour rester identique à LAMPS, mais la colonne
 *     qui compte est la seconde.
 *   - **Un prélèvement supérieur à la dette est signalé, jamais bloqué**
 *     (décision du métier, 2026-11-05). Le montant est déjà retenu sur le
 *     bulletin ; le refuser ne le rendrait à personne et ferait diverger
 *     notre comptabilité de celle de Sage. LAMPS n'en disait rien du tout, et
 *     la production porte 310 cas pour 8 563 422 F.
 *
 * Comme les Cotisations, la page ne passe pas par <Referentiel /> : une
 * campagne n'est pas une fiche, et ses deux niveaux - la campagne, puis ses
 * lignes nominatives - ne partagent ni colonnes ni boutons.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CCard, CCardBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCalculator,
  cilChevronLeft,
  cilChevronRight,
  cilCloudDownload,
  cilLoopCircular,
  cilSpreadsheet,
  cilWarning,
} from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import '../donnees-de-base/donnees-de-base.scss'
import '../comptabilite/journal-central.scss'
import './retenues.scss'
import AppelRetenuesModal from './AppelRetenuesModal'
import ImporterRetenuesModal from './ImporterRetenuesModal'
import ComptabiliserRetenuesModal from './ComptabiliserRetenuesModal'
import { codeCampagne, exporterSoldes, lireRetenuesExcel, rapprocher } from './retenuesExcel'

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

const montant = (valeur) =>
  valeur === null || valeur === undefined ? '' : Number(valeur).toLocaleString('fr-FR')

/**
 * Les sept colonnes de l'original, dans son ordre (capture 86).
 *
 * `Participant` est **une** colonne, pas deux : la table d'origine stocke
 * « OUSMANE FALL » d'un seul tenant, et l'écran l'affiche ainsi. Et les trois
 * colonnes de montant se suivent, ce qui est tout l'intérêt : c'est en lisant
 * Solde, Retenue IPM et Retenue Paie côte à côte qu'on voit que la paie ne
 * suit pas la proposition - 5,5 % du temps, dit la production.
 */
const COLONNES = [
  { cle: 'matricule', libelle: 'Matricule' },
  { cle: 'participantNom', libelle: 'Participant' },
  { cle: 'codeSoc', libelle: 'Code Soc' },
  { cle: 'solde', libelle: 'Solde', nombre: true, rendu: (l) => montant(l.solde) },
  { cle: 'retenueIpm', libelle: 'Retenue IPM', nombre: true, rendu: (l) => montant(l.retenueIpm) },
  {
    cle: 'retenuePaie',
    libelle: 'Retenue Paie',
    nombre: true,
    rendu: (l) => montant(l.retenuePaie),
  },
]

/** Les trois boutons de filtre de l'original, dans son ordre. */
const FILTRES = [
  ['tout', 'Voir tout'],
  ['anomalies', 'Anomalies'],
  ['normales', 'Normales'],
]

const PAR_PAGE = [15, 30, 50, 100]

const Retenues = () => {
  const [references, setReferences] = useState({ societes: [], plafond: 35000, journal: 'RP' })
  // L'écran s'ouvre sur le mois en cours, comme l'original. `new Date()` est
  // lu dans l'initialiseur paresseux de chaque état, et non dans le corps du
  // rendu : une horloge appelée à chaque rendu rend le composant impur.
  const [annee, setAnnee] = useState(() => String(new Date().getFullYear()))
  const [mois, setMois] = useState(() => String(new Date().getMonth() + 1))
  const [annees, setAnnees] = useState(() => [new Date().getFullYear()])
  const [societe, setSociete] = useState('')
  const [filtre, setFiltre] = useState('tout')

  const [detail, setDetail] = useState(null)
  // **Toutes** les lignes de la campagne, jamais filtrées. Le serveur sait
  // filtrer, mais la page lui demande tout : l'import et l'export travaillent
  // sur la campagne entière, et un écran réglé sur « Anomalies » ne doit pas
  // amputer le fichier qui part à la paie. Le tri des trois boutons se fait
  // donc ici, sur une liste qu'on a déjà.
  const [toutes, setToutes] = useState([])
  const [coches, setCoches] = useState([])
  const [chargement, setChargement] = useState(false)

  // Pagination, comme l'original : 15 lignes par page par défaut, et le
  // compteur « 1 - 15 / 179 » en pied de tableau.
  const [page, setPage] = useState(1)
  const [parPage, setParPage] = useState(15)

  const [appelOuvert, setAppelOuvert] = useState(false)
  const [importOuvert, setImportOuvert] = useState(false)
  const [lecture, setLecture] = useState(null)
  const [apercuOuvert, setApercuOuvert] = useState(false)
  const fichier = useRef(null)

  // --- Chargements ----------------------------------------------------------

  useEffect(() => {
    request('/retenues/references/')
      .then(setReferences)
      .catch((e) => toast.error(`Référentiels indisponibles : ${messageErreur(e)}`))
    request('/retenues/periodes/')
      .then((liste) => liste.length && setAnnees(liste))
      .catch(() => {})
  }, [])

  /**
   * L'écran n'affiche qu'une campagne à la fois : société et mois **forment
   * la clé**, et il n'y a donc rien à lister tant que la société n'est pas
   * choisie. C'est ce que fait l'original, dont l'en-tête nomme la campagne
   * unique qu'il montre.
   */
  const charger = useCallback(async () => {
    // Toute relecture repart sans sélection : les identifiants de lignes
    // changent d'une campagne à l'autre, et une case cochée sur la campagne
    // d'avant n'aurait plus de sens.
    setCoches([])
    if (!societe) {
      setDetail(null)
      setToutes([])
      return
    }
    try {
      setChargement(true)
      const requete = new URLSearchParams({ annee, mois, societe }).toString()
      const liste = await request(`/retenues/?${requete}`)
      const trouvees = Array.isArray(liste) ? liste : liste.resultats || []
      if (!trouvees.length) {
        setDetail(null)
        setToutes([])
        return
      }
      const complet = await request(`/retenues/${trouvees[0].id}/lignes/`)
      setDetail(complet)
      setToutes(complet.lignes || [])
    } catch (e) {
      toast.error(`Lecture impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [annee, mois, societe])

  useEffect(() => {
    // `charger` vide la sélection avant d'interroger le serveur : les
    // identifiants de lignes changent d'une campagne à l'autre, et une case
    // cochée sur la campagne d'avant n'aurait plus de sens. C'est un setState
    // dans l'effet, et c'est voulu - la règle vise les cascades de rendu, pas
    // la remise à zéro d'un état devenu faux.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  // Changer de filtre ou de campagne ramène à la première page : rester sur
  // la page 7 d'une liste qui n'en a plus que deux n'afficherait rien.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [filtre, societe, annee, mois, parPage])

  // --- Les actions, dans l'ordre du circuit ---------------------------------

  /**
   * 2. « Importer Retenues » : lire le fichier, **puis** ouvrir le modal.
   *
   * La lecture se fait ici, avant toute écriture, et deux refus tombent sans
   * que rien ne bouge : un fichier qui nomme une autre campagne - sa première
   * colonne porte le code, c'est son garde-fou - et un fichier dont aucune
   * ligne n'est exploitable. Ce qui passe ces deux portes s'affiche dans le
   * modal, avec son total, et n'est chargé qu'au clic sur Importer.
   */
  const choisirFichier = async (evenement) => {
    const choisi = evenement.target.files?.[0]
    evenement.target.value = ''
    if (!choisi || !detail?.campagne) return
    try {
      const lu = await lireRetenuesExcel(choisi)
      const attendu = detail.campagne.code || codeCampagne(societe, annee, mois)
      const etranger = lu.codes.find((code) => code !== attendu)
      if (etranger) {
        toast.error(
          `Ce fichier est celui de la campagne ${etranger}, pas de ${attendu}. ` +
            "Rien n'a été chargé.",
        )
        return
      }
      if (!lu.rangs.length) {
        toast.error('Le fichier ne porte aucune ligne.')
        return
      }
      // Le rapprochement se fait sur **toutes** les lignes de la campagne, pas
      // sur celles qu'un filtre laisse voir : le fichier de la paie ne connaît
      // pas nos filtres d'affichage.
      const rapproche = rapprocher(lu.rangs, toutes)
      if (!rapproche.lignes.length) {
        toast.error(
          `Aucun des ${rapproche.horsCampagne.length} matricules du fichier ` +
            "n'est de cette campagne.",
        )
        return
      }
      setLecture({
        ...rapproche,
        periode: `${MOIS[Number(mois) - 1]} ${annee}`,
        fichier: choisi.name,
      })
      setImportOuvert(true)
    } catch (e) {
      toast.error(`Lecture impossible : ${messageErreur(e)}`)
    }
  }

  /**
   * 4. « Export Excel » : le fichier qui repart vers la paie.
   *
   * Il porte le solde **restant** et la proposition qui va avec. Il s'exporte
   * normalement après la comptabilisation, pour que le solde tienne compte du
   * prélèvement du mois - mais rien ne l'interdit avant : l'agent peut
   * vouloir un état de contrôle.
   */
  const exporter = async () => {
    if (!toutes.length || !detail?.campagne) {
      toast.info('Rien à exporter.')
      return
    }
    try {
      const societeLibelle = references.societes.find((s) => s.code === societe)?.libelle
      const ecrites = await exporterSoldes(detail.campagne, toutes, { societeLibelle })
      toast.success(`${ecrites} ligne(s) exportée(s)`)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  const basculer = (id) =>
    setCoches((liste) => (liste.includes(id) ? liste.filter((n) => n !== id) : [...liste, id]))

  // La case d'en-tête prend **toutes** les lignes de la campagne, pas la page
  // seule : c'est ce que fait l'agent avant de comptabiliser, et découper la
  // sélection par page n'aurait aucun sens puisque la pièce couvre tout.
  const toutBasculer = () =>
    setCoches((liste) => (liste.length === lignes.length ? [] : lignes.map((l) => l.id)))

  /**
   * 3. « Comptabiliser » : ouvrir l'aperçu.
   *
   * La sélection commande le bouton, comme dans l'original - M. Sakho coche
   * tout avant de cliquer - mais elle ne découpe pas la pièce : **une pièce
   * comptable = une campagne**. Cocher trois lignes ne peut pas comptabiliser
   * trois lignes, et l'écran le dit au lieu de le taire.
   */
  const ouvrirApercu = () => {
    if (!detail?.campagne || !coches.length) return
    if (
      coches.length < lignes.length &&
      !window.confirm(
        'Une pièce comptable couvre la campagne entière : les ' +
          `${lignes.length} lignes seront comptabilisées, pas seulement les ` +
          `${coches.length} cochées. Continuer ?`,
      )
    ) {
      return
    }
    setApercuOuvert(true)
  }

  // --- Rendu ------------------------------------------------------------------

  const campagne = detail?.campagne
  const entete = detail?.entete
  const comptabilise = Boolean(campagne?.comptabilise)
  const anomalies = Number(entete?.anomalies || 0)
  const societeChoisie = useMemo(
    () => references.societes.find((s) => s.code === societe),
    [references.societes, societe],
  )

  // Les trois boutons de l'original, appliqués à la liste complète. Une
  // anomalie est une ligne où la paie a prélevé au-delà de la dette.
  const garde = { anomalies: (l) => l.excedent > 0, normales: (l) => !l.excedent }[filtre]
  const lignes = garde ? toutes.filter(garde) : toutes

  const pages = Math.max(1, Math.ceil(lignes.length / parPage))
  const pageSure = Math.min(page, pages)
  const visibles = useMemo(
    () => lignes.slice((pageSure - 1) * parPage, pageSure * parPage),
    [lignes, pageSure, parPage],
  )
  const premier = lignes.length ? (pageSure - 1) * parPage + 1 : 0
  const dernier = Math.min(pageSure * parPage, lignes.length)

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu rfm-page">
          <h2 className="jc-titre">Retenues Frais Médicaux</h2>

          {/* L'en-tête de l'original, mot pour mot : la période et la société
              nommée en entier, puis les deux totaux. « Total Retenue » reste à
              0 tant que le fichier de la paie n'est pas importé - c'est le
              témoin le plus direct de l'état d'avancement. */}
          <div className="rfm-entete">
            {campagne ? (
              <>
                <p className="rfm-entete-titre">
                  {MOIS[Number(mois) - 1]} {annee} - {entete.titre} ({entete.participants}{' '}
                  Participants)
                </p>
                <p className="rfm-entete-total">
                  Total Solde: {montant(entete.totalSolde)} - Total Retenue:{' '}
                  {montant(entete.totalPaie)}
                </p>
              </>
            ) : (
              <p className="rfm-entete-vide">
                {societe
                  ? `Aucune campagne pour ${societeChoisie?.intitule || societe} en ` +
                    `${MOIS[Number(mois) - 1]} ${annee}. ` +
                    '« Appel Retenues » photographie la dette de chaque participant.'
                  : 'Choisissez une société pour ouvrir sa campagne du mois.'}
              </p>
            )}
          </div>

          {/* Le signalement, et rien de plus : il informe, il n'interdit pas
              (décision du 2026-11-05). */}
          {anomalies > 0 && (
            <p className="rfm-alerte">
              <CIcon icon={cilWarning} className="rfm-icone" />
              {anomalies} prélèvement{anomalies > 1 ? 's' : ''} dépasse
              {anomalies > 1 ? 'nt' : ''} la dette du participant, pour {montant(entete.excedent)} F
              au total. La paie a déjà retenu ces montants sur les bulletins : ils partiront en
              comptabilité tels quels.
              {filtre !== 'anomalies' && (
                <button type="button" className="rfm-lien" onClick={() => setFiltre('anomalies')}>
                  Ne voir que celles-là
                </button>
              )}
            </p>
          )}

          <div className="rfm-barre">
            <select className="ddb-filtre" value={annee} onChange={(e) => setAnnee(e.target.value)}>
              {annees.map((an) => (
                <option key={an} value={an}>
                  {an}
                </option>
              ))}
            </select>
            <select className="ddb-filtre" value={mois} onChange={(e) => setMois(e.target.value)}>
              {MOIS.map((nom, index) => (
                <option key={nom} value={index + 1}>
                  {nom}
                </option>
              ))}
            </select>
            <select
              className="ddb-filtre rfm-large"
              value={societe}
              onChange={(e) => setSociete(e.target.value)}
            >
              <option value="">Société…</option>
              {references.societes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.intitule}
                </option>
              ))}
            </select>
          </div>

          <div className="rfm-barre rfm-barre-boutons">
            <button
              type="button"
              className="rfm-bouton"
              onClick={() => setAppelOuvert(true)}
              disabled={comptabilise}
              title={
                comptabilise
                  ? 'Campagne comptabilisée : elle ne peut plus être relancée.'
                  : 'Photographier la dette de chaque participant pour ce mois.'
              }
            >
              <CIcon icon={cilLoopCircular} className="rfm-icone" />
              Appel Retenues
            </button>
            <button
              type="button"
              className="rfm-bouton rfm-bouton-encre"
              onClick={ouvrirApercu}
              disabled={!campagne || comptabilise || !coches.length}
              title={
                comptabilise
                  ? 'Campagne déjà comptabilisée.'
                  : coches.length
                    ? 'Vérifier les écritures, puis les poser au journal RP.'
                    : 'Cochez au moins une ligne.'
              }
            >
              <CIcon icon={cilCalculator} className="rfm-icone" />
              Comptabiliser
            </button>
            <button
              type="button"
              className="rfm-bouton rfm-bouton-vert"
              onClick={exporter}
              disabled={!toutes.length}
              title="Le fichier des soldes qui repart vers la paie."
            >
              <CIcon icon={cilSpreadsheet} className="rfm-icone" />
              Export Excel
            </button>
            <button
              type="button"
              className="rfm-bouton rfm-bouton-bleu"
              onClick={() => fichier.current?.click()}
              disabled={!campagne || comptabilise}
              title={
                comptabilise
                  ? 'Campagne comptabilisée : ses montants sont figés.'
                  : campagne
                    ? 'Charger le fichier de la paie (rubrique 6600).'
                    : 'Faites d’abord l’appel : l’import n’aurait rien à remplir.'
              }
            >
              <CIcon icon={cilCloudDownload} className="rfm-icone" />
              Importer Retenues
            </button>
            <input
              ref={fichier}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="d-none"
              onChange={choisirFichier}
            />

            {/* Les trois filtres d'affichage de l'original, en segments. */}
            <div className="rfm-segments" role="group" aria-label="Filtrer les lignes">
              {FILTRES.map(([cle, libelle]) => (
                <button
                  key={cle}
                  type="button"
                  className={`rfm-segment${cle === filtre ? ' rfm-segment-actif' : ''}`}
                  onClick={() => setFiltre(cle)}
                >
                  {libelle}
                </button>
              ))}
            </div>

            <button type="button" className="rfm-bouton rfm-bouton-azur" onClick={charger}>
              <CIcon icon={cilLoopCircular} className="rfm-icone" />
              Actualiser
            </button>
          </div>

          <div className="tableau-conteneur rfm-tableau-cadre">
            <table className="table ddb-tableau rfm-tableau">
              <thead>
                <tr>
                  <th className="rfm-case">
                    <input
                      type="checkbox"
                      checked={lignes.length > 0 && coches.length === lignes.length}
                      onChange={toutBasculer}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  {COLONNES.map((c) => (
                    <th key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                      {c.libelle}
                    </th>
                  ))}
                  <th>Etat</th>
                </tr>
              </thead>
              <tbody>
                {chargement && (
                  <tr>
                    <td colSpan={COLONNES.length + 2} className="text-center py-4">
                      <CSpinner size="sm" />
                    </td>
                  </tr>
                )}
                {!chargement && !visibles.length && (
                  <tr>
                    <td colSpan={COLONNES.length + 2} className="rfm-vide">
                      {campagne
                        ? filtre === 'anomalies'
                          ? 'Aucun prélèvement ne dépasse la dette sur cette campagne.'
                          : filtre === 'normales'
                            ? 'Toutes les lignes de cette campagne sont des anomalies.'
                            : 'Aucun participant en dette sur cette campagne.'
                        : societe
                          ? 'Aucune campagne ouverte. Cliquez sur « Appel Retenues ».'
                          : 'Choisissez une société.'}
                    </td>
                  </tr>
                )}
                {!chargement &&
                  visibles.map((ligne) => (
                    <tr
                      key={ligne.id}
                      className={
                        [comptabilise ? 'rfm-fige' : '', ligne.excedent ? 'rfm-excede' : '']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <td className="rfm-case">
                        <input
                          type="checkbox"
                          checked={coches.includes(ligne.id)}
                          onChange={() => basculer(ligne.id)}
                          aria-label={`Sélectionner ${ligne.matricule}`}
                        />
                      </td>
                      {COLONNES.map((c) => (
                        <td key={c.cle} className={c.nombre ? 'text-end' : undefined}>
                          {c.rendu ? c.rendu(ligne) : (ligne[c.cle] ?? '')}
                          {/* L'écart se montre là où il naît, à côté du
                              montant qui le cause. */}
                          {c.cle === 'retenuePaie' && ligne.excedent > 0 && (
                            <span className="rfm-ecart" title="Prélevé au-delà de la dette">
                              +{montant(ligne.excedent)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td>
                        <span className={`rfm-badge${comptabilise ? ' rfm-badge-ok' : ''}`}>
                          {comptabilise ? 'Comptabilisé' : 'Non Comptabilisé'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Le pied de l'original : « Nombre par page 15 » et « 1 - 15 / 179 ». */}
          {lignes.length > 0 && (
            <div className="rfm-pagination">
              <label className="rfm-par-page">
                Nombre par page
                <select
                  className="ddb-filtre"
                  value={parPage}
                  onChange={(e) => setParPage(Number(e.target.value))}
                >
                  {PAR_PAGE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="rfm-compteur">
                {premier} - {dernier} / {lignes.length}
              </span>
              <button
                type="button"
                className="rfm-page-bouton"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSure <= 1}
                aria-label="Page précédente"
              >
                <CIcon icon={cilChevronLeft} className="rfm-icone" />
              </button>
              <button
                type="button"
                className="rfm-page-bouton"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={pageSure >= pages}
                aria-label="Page suivante"
              >
                <CIcon icon={cilChevronRight} className="rfm-icone" />
              </button>
            </div>
          )}
        </section>
      </CCardBody>

      {/* La clé remonte chaque modal à son ouverture : son état repart à neuf
          sans qu'il ait à s'en charger lui-même. */}
      <AppelRetenuesModal
        key={appelOuvert ? 'appel-ouvert' : 'appel-ferme'}
        visible={appelOuvert}
        references={references}
        annees={annees}
        defauts={{ societe, annee, mois }}
        dejaOuverte={Boolean(campagne)}
        onFermer={() => setAppelOuvert(false)}
        onAppele={(choix) => {
          setAppelOuvert(false)
          // L'appel peut porter sur un autre mois que celui affiché : on
          // bascule l'écran dessus plutôt que de laisser l'agent se demander
          // où est passée sa campagne.
          setSociete(choix.societe)
          setAnnee(choix.annee)
          setMois(choix.mois)
          charger()
        }}
      />

      <ImporterRetenuesModal
        key={importOuvert ? 'import-ouvert' : 'import-ferme'}
        visible={importOuvert}
        campagne={campagne}
        lecture={lecture}
        onFermer={() => setImportOuvert(false)}
        onImporte={() => {
          setImportOuvert(false)
          charger()
        }}
      />

      <ComptabiliserRetenuesModal
        key={apercuOuvert ? 'apercu-ouvert' : 'apercu-ferme'}
        visible={apercuOuvert}
        campagne={campagne}
        onFermer={() => setApercuOuvert(false)}
        onEnregistre={() => {
          setApercuOuvert(false)
          charger()
        }}
      />
    </CCard>
  )
}

export default Retenues
