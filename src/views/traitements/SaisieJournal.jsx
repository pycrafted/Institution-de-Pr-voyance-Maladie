/**
 * Page « Traitements → Saisie Journal » (captures 84 et 85).
 *
 * **L'écriture comptable à la main.** C'est le seul écran de l'application où
 * un comptable pose lui-même un débit et un crédit, sans qu'une facture, un
 * règlement ou un appel de cotisation les lui dictent. Tous les autres écrans
 * arrivent au grand livre par un document ; celui-ci n'en a pas, il a un
 * libellé qu'on tape.
 *
 * Il sert, et tous les mois : le journal **OD** porte **6 923 écritures** en
 * production, et un tiers d'entre elles sont des **forfaits maternité** et des
 * **aides décès** - des prestations versées sans facture de fournisseur, donc
 * hors du circuit normal. Le reste se range en trois familles : frais
 * bancaires, annulations, et mouvements entre sociétés.
 *
 * Deux choses le distinguent du Journal Central, qui montre les mêmes
 * écritures :
 *
 *   - le Journal Central est en **lecture seule** et couvre tous les
 *     journaux ; ici on **écrit**, et le périmètre est celui qu'on saisit ;
 *   - la colonne **Etat** et le bouton **Comptabiliser**. Une pièce naît
 *     « Saisie » et devient « Comptabilisée ». Le dump de LAMPS ne garde
 *     aucune écriture en attente (`datecompta` servie sur les 396 873), donc
 *     cette lecture est une hypothèse de travail - la plus simple.
 *
 * La sélection ligne à ligne **désigne, elle ne découpe pas** : la
 * comptabilisation porte sur la pièce entière, comme aux Cotisations. Une
 * pièce à moitié comptabilisée serait un grand livre faux.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import BoutonExport from '../../components/BoutonExport'
import { CCard, CCardBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCalculator, cilLoopCircular, cilPrint, cilSpreadsheet } from '@coreui/icons'

import { request, telecharger } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { ouvrirApercu } from '../../services/apercu'
import '../donnees-de-base/donnees-de-base.scss'
import '../comptabilite/journal-central.scss'
import './cotisations.scss'
import './saisie-journal.scss'
import SaisieJournalModal from './SaisieJournalModal'

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

const TAILLES = [25, 50, 100, 200]

const montant = (valeur) =>
  valeur === null || valeur === undefined || valeur === 0
    ? ''
    : Number(valeur).toLocaleString('fr-FR')

const dateCourte = (iso) => {
  if (!iso) return ''
  const [a, m, j] = String(iso).slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}

const moisAbrege = (iso) => {
  if (!iso) return ''
  const [a, m] = String(iso).slice(0, 7).split('-')
  return `${ABREGES[Number(m) - 1]}-${a}`
}

/** Les treize colonnes de la capture 84, dans son ordre à elle. */
const COLONNES = [
  { cle: 'cJl', libelle: 'C.JL' },
  { cle: 'datePiece', libelle: 'Date pièce', rendu: (e) => dateCourte(e.datePiece) },
  { cle: 'numPiece', libelle: 'N° pièce' },
  { cle: 'dateSaisie', libelle: 'Date saisie', rendu: (e) => dateCourte(e.dateSaisie) },
  { cle: 'moisTrait', libelle: 'Mois trait', rendu: (e) => moisAbrege(e.moisTrait) },
  { cle: 'compteGen', libelle: 'Cpte. Gen.' },
  { cle: 'compteTiers', libelle: 'Cpte. Tiers' },
  { cle: 'codeSoc', libelle: 'Code soc.' },
  { cle: 'libelle', libelle: 'Libellé' },
  { cle: 'debit', libelle: 'Débit', nombre: true, rendu: (e) => montant(e.debit) },
  { cle: 'credit', libelle: 'Crédit', nombre: true, rendu: (e) => montant(e.credit) },
]

const SaisieJournal = () => {
  const [references, setReferences] = useState({ journaux: [], societes: [], comptes: [] })
  const [exercices, setExercices] = useState(() => [new Date().getFullYear()])

  const [exercice, setExercice] = useState(() => String(new Date().getFullYear()))
  const [mois, setMois] = useState(() => String(new Date().getMonth() + 1))
  const [journal, setJournal] = useState('TOUS')
  const [recherche, setRecherche] = useState('')

  const [ecritures, setEcritures] = useState([])
  const [totaux, setTotaux] = useState({ debit: 0, credit: 0, solde: 0 })
  const [coches, setCoches] = useState([])
  const [chargement, setChargement] = useState(false)
  const [modalOuvert, setModalOuvert] = useState(false)

  const [page, setPage] = useState(1)
  const [taille, setTaille] = useState(50)
  const [nombre, setNombre] = useState(0)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    request('/saisie-journal/references/')
      .then(setReferences)
      .catch((e) => toast.error(`Référentiels indisponibles : ${messageErreur(e)}`))
    request('/saisie-journal/exercices/')
      .then((liste) => liste.length && setExercices(liste))
      .catch(() => {})
  }, [])

  const parametres = useCallback(
    () =>
      new URLSearchParams({
        exercice,
        mois,
        journal,
        ...(recherche ? { recherche } : {}),
      }).toString(),
    [exercice, mois, journal, recherche],
  )

  const charger = useCallback(async () => {
    try {
      setChargement(true)
      const base = parametres()
      const [liste, soldes] = await Promise.all([
        request(`/saisie-journal/?${base}&page=${page}&taille=${taille}`),
        request(`/saisie-journal/totaux/?${base}`),
      ])
      setEcritures(liste.resultats || [])
      setNombre(liste.nombre || 0)
      setPages(liste.pages || 1)
      setTotaux(soldes)
      setCoches([])
    } catch (e) {
      toast.error(`Lecture impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [parametres, page, taille])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  // Changer un filtre remet à la première page : rester en page 7 d'un
  // périmètre qui n'en a plus que deux afficherait un tableau vide.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [exercice, mois, journal, recherche, taille])

  // --- Sélection ------------------------------------------------------------

  const basculer = (id) =>
    setCoches((liste) => (liste.includes(id) ? liste.filter((n) => n !== id) : [...liste, id]))

  const toutBasculer = () =>
    setCoches((liste) => (liste.length === ecritures.length ? [] : ecritures.map((e) => e.id)))

  /**
   * Les pièces que la sélection désigne, et le nombre de lignes qu'elles
   * portent en tout. L'écart entre les deux est ce qu'il faut annoncer avant
   * de comptabiliser : cocher trois lignes d'une pièce qui en a huit
   * comptabilise les huit.
   */
  const portee = useMemo(() => {
    const choisies = ecritures.filter((e) => coches.includes(e.id))
    const pieces = new Set(choisies.map((e) => e.numPiece).filter(Boolean))
    const lignes = ecritures.filter((e) => pieces.has(e.numPiece)).length
    return { pieces: [...pieces], lignes }
  }, [ecritures, coches])

  // --- Actions --------------------------------------------------------------

  const comptabiliser = async () => {
    if (!coches.length) return
    if (
      portee.lignes > coches.length &&
      !window.confirm(
        'La comptabilisation porte sur la pièce entière : ' +
          `${portee.pieces.length} pièce(s), ${portee.lignes} ligne(s) au total, ` +
          `et non les ${coches.length} ligne(s) cochée(s). Continuer ?`,
      )
    ) {
      return
    }
    try {
      const resultat = await request('/saisie-journal/comptabiliser/', {
        method: 'POST',
        body: JSON.stringify({ ecritures: coches }),
      })
      toast.success(resultat.message)
      if (resultat.refusees?.length) {
        toast.error(`Déséquilibrée(s), donc refusée(s) : ${resultat.refusees.join(', ')}`)
      }
      charger()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const exporter = async () => {
    if (!ecritures.length) {
      toast.info('Rien à exporter.')
      return
    }
    try {
      const { utils, writeFile } = await import('xlsx')
      const feuille = utils.json_to_sheet(
        ecritures.map((e) => ({
          'C.JL': e.cJl,
          'Date pièce': dateCourte(e.datePiece),
          'N° pièce': e.numPiece,
          'Date saisie': dateCourte(e.dateSaisie),
          'Mois trait': moisAbrege(e.moisTrait),
          'Cpte. Gen.': e.compteGen,
          'Cpte. Tiers': e.compteTiers,
          'Code soc.': e.codeSoc,
          Libellé: e.libelle,
          Débit: Number(e.debit || 0),
          Crédit: Number(e.credit || 0),
          Etat: e.etat,
        })),
      )
      const classeur = utils.book_new()
      utils.book_append_sheet(classeur, feuille, 'Saisie Journal')
      writeFile(classeur, `saisie-journal ${MOIS[Number(mois) - 1]} ${exercice}.xlsx`)
      toast.success(`${ecritures.length} ligne(s) exportée(s)`)
    } catch (e) {
      toast.error(`Export impossible : ${messageErreur(e)}`)
    }
  }

  const imprimer = () =>
    ouvrirApercu({
      titre: `Saisie Journal ${MOIS[Number(mois) - 1]} ${exercice}`,
      nomFichier: `saisie-journal-${exercice}-${mois}`,
      charger: () => telecharger(`/saisie-journal/etat/?${parametres()}`),
    })

  // --- Rendu ----------------------------------------------------------------

  const rienDeCoche = coches.length === 0

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu cot-page sj-page">
          <h2 className="jc-titre">Saisie Journal</h2>

          {/* Les deux soldes, l'un sous l'autre comme dans l'original. Tant
              qu'ils sont égaux, la période tient. */}
          <p className="sj-soldes">
            <span>
              Solde débit: <strong>{Number(totaux.debit || 0).toLocaleString('fr-FR')}</strong>
            </span>
            <span>
              Solde crédit: <strong>{Number(totaux.credit || 0).toLocaleString('fr-FR')}</strong>
            </span>
          </p>

          <div className="cot-barre sj-barre">
            <label className="ddb-recherche-flottante cot-recherche">
              <span className="ddb-recherche-libelle">Rechercher…</span>
              <input
                className="ddb-recherche-champ"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </label>

            {/* Les trois listes sont surmontées de leur étiquette, comme dans
                l'original : sans son titre, « - - - Tous - - - » ne dirait
                pas de quoi il parle. */}
            <label className="jc-filtre-groupe jc-etroit">
              <span className="jc-filtre-etiquette">Exercice</span>
              <select
                className="ddb-filtre"
                value={exercice}
                onChange={(e) => setExercice(e.target.value)}
              >
                {exercices.map((an) => (
                  <option key={an} value={an}>
                    {an}
                  </option>
                ))}
              </select>
            </label>

            <label className="jc-filtre-groupe">
              <span className="jc-filtre-etiquette">Mois</span>
              <select className="ddb-filtre" value={mois} onChange={(e) => setMois(e.target.value)}>
                {MOIS.map((nom, index) => (
                  <option key={nom} value={index + 1}>
                    {nom}
                  </option>
                ))}
              </select>
            </label>

            <label className="jc-filtre-groupe jc-large">
              <span className="jc-filtre-etiquette">Journal</span>
              <select
                className="ddb-filtre"
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
              >
                <option value="TOUS">- - - Tous - - -</option>
                {references.journaux.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.intitule}
                  </option>
                ))}
              </select>
            </label>

            <div className="cot-boutons sj-boutons">
              <button
                type="button"
                className="cot-bouton cot-bouton-rouge"
                onClick={() => setModalOuvert(true)}
              >
                Saisir +
              </button>
              <BoutonExport onClick={exporter} />
              <button
                type="button"
                className="cot-bouton cot-bouton-encre"
                onClick={comptabiliser}
                disabled={rienDeCoche}
                title={
                  rienDeCoche
                    ? 'Cochez au moins une ligne.'
                    : `Comptabiliser ${portee.pieces.length} pièce(s), ${portee.lignes} ligne(s).`
                }
              >
                <CIcon icon={cilCalculator} className="cot-icone" />
                Comptabiliser
              </button>
              <button type="button" className="cot-bouton cot-bouton-encre" onClick={imprimer}>
                <CIcon icon={cilPrint} className="cot-icone" />
                Imprimer
              </button>
              <button type="button" className="cot-bouton cot-bouton-azur" onClick={charger}>
                <CIcon icon={cilLoopCircular} className="cot-icone" />
                Actualiser
              </button>
            </div>
          </div>

          <div className="tableau-conteneur cot-tableau-cadre">
            <table className="table ddb-tableau tableau-dense cot-tableau">
              <thead>
                <tr>
                  <th className="cot-case">
                    <input
                      type="checkbox"
                      checked={ecritures.length > 0 && coches.length === ecritures.length}
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
                {!chargement && !ecritures.length && (
                  <tr>
                    <td colSpan={COLONNES.length + 2} className="cot-vide">
                      Aucune écriture pour {MOIS[Number(mois) - 1]} {exercice}.
                    </td>
                  </tr>
                )}
                {!chargement &&
                  ecritures.map((e) => {
                    const comptabilisee = e.etat === 'Comptabilisé'
                    return (
                      <tr key={e.id} className={comptabilisee ? 'cot-fige' : undefined}>
                        <td className="cot-case">
                          <input
                            type="checkbox"
                            checked={coches.includes(e.id)}
                            onChange={() => basculer(e.id)}
                            aria-label={`Sélectionner la ligne ${e.numPiece}`}
                          />
                        </td>
                        {COLONNES.map((c) => (
                          <td
                            key={c.cle}
                            className={[
                              c.nombre ? 'text-end' : null,
                              c.nombre && Number(e[c.cle]) < 0 ? 'jc-negatif' : null,
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {c.rendu ? c.rendu(e) : (e[c.cle] ?? '')}
                          </td>
                        ))}
                        <td>
                          <span className={`cot-badge${comptabilisee ? ' cot-badge-ok' : ''}`}>
                            {e.etat}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <footer className="ddb-pagination jc-pagination">
            <label className="jc-taille">
              Nombre par page
              <select
                className="ddb-filtre"
                value={taille}
                onChange={(e) => setTaille(Number(e.target.value))}
              >
                {TAILLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <span className="jc-position">
              {nombre === 0
                ? '0 - 0 / 0'
                : `${(page - 1) * taille + 1} - ${Math.min(page * taille, nombre)} / ${nombre.toLocaleString('fr-FR')}`}
            </span>
            <span className="jc-fleches">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                aria-label="Première page"
              >
                |&lt;
              </button>
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                aria-label="Page précédente"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= pages}
                aria-label="Page suivante"
              >
                &gt;
              </button>
              <button
                type="button"
                onClick={() => setPage(pages)}
                disabled={page >= pages}
                aria-label="Dernière page"
              >
                &gt;|
              </button>
            </span>
          </footer>
        </section>
      </CCardBody>

      {/* La clé remonte le modal à chaque ouverture : une pièce commencée puis
          abandonnée ne doit pas réapparaître dans la suivante. */}
      <SaisieJournalModal
        key={modalOuvert ? 'ouvert' : 'ferme'}
        visible={modalOuvert}
        references={references}
        journalParDefaut={journal !== 'TOUS' ? journal : 'OD'}
        onFermer={() => setModalOuvert(false)}
        onCree={charger}
      />
    </CCard>
  )
}

export default SaisieJournal
