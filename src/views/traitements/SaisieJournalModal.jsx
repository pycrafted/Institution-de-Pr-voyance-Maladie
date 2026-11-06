/**
 * Modal « Saisie Journal » (capture 85) - l'écriture comptable à la main.
 *
 * **C'est une saisie multi-lignes, et ce n'est pas un confort.** On remplit
 * une ligne, « Valider Saisie » la pose dans le tableau du bas, on recommence,
 * puis « Valider » enregistre la pièce entière. La production l'impose : sur
 * les 2 284 pièces OD, 1 707 ont deux lignes mais **474 en ont quatre** et la
 * plus grosse 66. Les pièces à quatre lignes sont les forfaits maternité, qui
 * constatent la charge puis la paient dans la même pièce :
 *
 *     Dr 602008 ACCOUCHEMENT-MATERNITE      75 000
 *     Cr 411001 participant 01-0994                  75 000
 *     Dr 411001 participant 01-0994         75 000
 *     Cr 521700 ECOBANK IPM FONCTIONNEMENT           75 000
 *
 * Quatre règles tenues ici, toutes relevées dans la base (§4 et §4bis de
 * `docs/lamps/saisie-journal.md`) :
 *
 *   - **une ligne porte un débit ou un crédit, jamais les deux, jamais zéro**
 *     des deux côtés (0 contre-exemple sur 6 923 lignes) ;
 *   - **le montant peut être négatif** : LAMPS annule en reposant la même
 *     écriture en négatif du même côté (458 des 519 « ANNULATION… »). Un
 *     `min=0` rendrait l'annulation impossible ;
 *   - **le compte tiers est obligatoire sur un 411 ou un 400, interdit
 *     ailleurs**, et son format diffère : `société-matricule` pour un
 *     participant, code nu pour un fournisseur ;
 *   - **la pièce doit s'équilibrer** : zéro déséquilibre sur les 2 152 pièces
 *     modernes. Le pied « Debit / Credit » de la capture est la condition de
 *     « Valider », pas une décoration.
 *
 * **Deux écarts assumés avec la capture**, et un seul est visible :
 *
 *   1. Les libellés `Mtt. Débit (0)` et `Mtt. Crédit (0)` perdent leur
 *      parenthèse. Elle note la valeur par défaut du champ - même notation que
 *      le `(5 000)` du modal des cotisations, que le métier a fait retirer le
 *      2026-11-03. Ici le défaut vaut 0, il est juste, mais le répéter à côté
 *      d'un champ qui affiche déjà 0 n'apprend rien.
 *   2. La colonne **Soc.** n'apparaît dans le tableau des lignes **que si la
 *      pièce en mêle plusieurs**. La capture n'en a pas, mais 52 pièces sur
 *      2 284 portent deux sociétés (un `TRANSFERT DE SOLDE` entre adhérents) :
 *      les construire à l'aveugle serait pire que d'ajouter une colonne qui ne
 *      se montre qu'au moment utile.
 */

import React, { useMemo, useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilTrash } from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'

const MOIS_ABREGES = [
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

/** Les deux seules familles de comptes qui portent un tiers. */
const RACINE_PARTICIPANT = '411'
const RACINE_FOURNISSEUR = '400'

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/** « 2026-11 » → « nov.-2026 », ce qu'affiche le champ Date traitement. */
const periodeDe = (mois) => {
  if (!mois) return ''
  const [a, m] = mois.split('-')
  return `${MOIS_ABREGES[Number(m) - 1]}-${a}`
}

const montant = (valeur) => Number(valeur || 0).toLocaleString('fr-FR')

const dateCourte = (iso) => {
  if (!iso) return ''
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

/** Quelle liste de tiers déroule-t-on pour ce compte, et sous quel nom. */
const familleTiers = (compte) => {
  if ((compte || '').startsWith(RACINE_PARTICIPANT)) return 'participants'
  if ((compte || '').startsWith(RACINE_FOURNISSEUR)) return 'fournisseurs'
  return null
}

const LIGNE_VIDE = { compteGen: '', compteTiers: '', libelle: '', debit: '', credit: '' }

const SaisieJournalModal = ({ visible, references, journalParDefaut, onFermer, onCree }) => {
  // --- L'en-tête de la pièce ------------------------------------------------
  const [datePiece, setDatePiece] = useState(aujourdhui())
  const [dateTrait, setDateTrait] = useState(() => aujourdhui().slice(0, 7))
  const [societe, setSociete] = useState('')
  const [journal, setJournal] = useState(journalParDefaut || 'OD')
  const [numPiece, setNumPiece] = useState('')
  const [numCheque, setNumCheque] = useState('')

  // --- La ligne en cours, et celles déjà posées -----------------------------
  const [ligne, setLigne] = useState(LIGNE_VIDE)
  const [lignes, setLignes] = useState([])
  const [envoi, setEnvoi] = useState(false)

  const journaux = references?.journaux || []
  const societes = references?.societes || []
  const comptes = references?.comptes || []

  const famille = familleTiers(ligne.compteGen)
  /**
   * Les tiers déroulés pour le compte en cours.
   *
   * Un participant est **filtré sur la société choisie en haut** : son code
   * s'écrit `société-matricule`, et la production veut que ce préfixe soit
   * celui de l'écriture - 1 357 fois sur 1 367. Proposer les 675 participants
   * des quatre sociétés, c'est inviter les dix exceptions.
   *
   * Et c'est aussi ce qui rend possible une pièce à deux sociétés, comme le
   * `TRANSFERT DE SOLDE` de la production : on pose la ligne de la société
   * 02, on bascule le sélecteur du haut, on pose celle de la 01.
   *
   * Un fournisseur, lui, porte un code nu et n'appartient à aucune société :
   * sa liste ne se filtre pas.
   */
  const tiers = useMemo(() => {
    if (!famille) return []
    const liste = references?.[famille] || []
    if (famille !== 'participants' || !societe) return liste
    return liste.filter((t) => t.code.startsWith(`${societe}-`))
  }, [famille, references, societe])

  const totalDebit = lignes.reduce((n, l) => n + Number(l.debit || 0), 0)
  const totalCredit = lignes.reduce((n, l) => n + Number(l.credit || 0), 0)
  const equilibre = lignes.length >= 2 && totalDebit === totalCredit && totalDebit !== 0
  // La colonne Société ne se montre que si la pièce en mêle plusieurs.
  const plusieursSocietes = new Set(lignes.map((l) => l.societe)).size > 1

  const poser = (champ) => (e) => setLigne((l) => ({ ...l, [champ]: e.target.value }))

  /**
   * « Valider Saisie » : contrôle la ligne et la pose dans le tableau.
   *
   * Les mêmes refus que le serveur, mais tout de suite : une pièce de huit
   * lignes rejetée à la fin pour une faute commise à la deuxième est une
   * pièce à refaire en entier.
   */
  const validerSaisie = () => {
    const debit = Number(ligne.debit || 0)
    const credit = Number(ligne.credit || 0)
    if (!ligne.compteGen) {
      toast.info('Le compte général est obligatoire.')
      return
    }
    if (debit && credit) {
      toast.info('Une ligne porte un débit ou un crédit, jamais les deux.')
      return
    }
    if (!debit && !credit) {
      toast.info('Il manque le montant.')
      return
    }
    if (famille && !ligne.compteTiers) {
      const nom = famille === 'participants' ? 'participant' : 'fournisseur'
      toast.info(`Le compte ${ligne.compteGen} est un compte ${nom} : son tiers est obligatoire.`)
      return
    }
    if (!famille && ligne.compteTiers) {
      toast.info(`Le compte ${ligne.compteGen} ne prend pas de tiers.`)
      return
    }
    if (!ligne.libelle.trim()) {
      toast.info('Le libellé est obligatoire.')
      return
    }
    setLignes((liste) => [
      ...liste,
      {
        ...ligne,
        libelle: ligne.libelle.trim(),
        debit,
        credit,
        // La ligne emporte l'en-tête tel qu'il est à cet instant : c'est ce
        // qui permet à une pièce de mêler deux sociétés ou deux dates.
        societe,
        datePiece,
        numCheque,
      },
    ])
    // Le compte et le libellé restent : une pièce répète presque toujours le
    // même libellé sur toutes ses lignes (seules 151 pièces sur 2 284 en
    // portent plusieurs), et l'enchaînement est plus rapide ainsi.
    setLigne((l) => ({ ...LIGNE_VIDE, libelle: l.libelle }))
  }

  const retirer = (index) => setLignes((liste) => liste.filter((_, i) => i !== index))

  const valider = async () => {
    if (!equilibre) return
    setEnvoi(true)
    try {
      const resultat = await request('/saisie-journal/', {
        method: 'POST',
        body: JSON.stringify({
          journal,
          numPiece,
          datePiece,
          dateTrait: `${dateTrait}-01`,
          societe,
          numCheque,
          lignes,
        }),
      })
      toast.success(resultat.message)
      onCree?.(resultat)
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onFermer} size="xl" alignment="center" className="sj-modal">
      <CModalHeader>
        <CModalTitle>Saisie Journal</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {/* --- L'en-tête de la pièce ------------------------------------- */}
        <div className="sj-grille">
          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-trait">
              Date traitement<span className="cot-requis"> *</span>
            </label>
            {/* Le mois comptable. Grisé dans l'original, mais il porte une
                icône de calendrier, et la base lui donne raison : 1 008
                écritures OD sur 6 923 visent un autre mois que leur date de
                pièce. Il se choisit donc, au mois près. */}
            <input
              id="sj-trait"
              type="month"
              className="ddb-champ"
              value={dateTrait}
              onChange={(e) => setDateTrait(e.target.value)}
            />
            <p className="cot-aide">
              {periodeDe(dateTrait)} - le mois auquel la pièce se rattache.
            </p>
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-societe">
              Société<span className="cot-requis"> *</span>
            </label>
            <select
              id="sj-societe"
              className="ddb-champ ddb-champ-liste"
              value={societe}
              onChange={(e) => {
                // Le tiers déjà choisi appartient à l'ancienne société : le
                // garder poserait une ligne au préfixe faux.
                setSociete(e.target.value)
                setLigne((l) => ({ ...l, compteTiers: '' }))
              }}
            >
              <option value="">Choisir une société</option>
              {societes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.intitule}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sj-grille sj-grille-4">
          <div className="ddb-groupe sj-large">
            <label className="ddb-etiquette" htmlFor="sj-journal">
              Code Journal<span className="cot-requis"> *</span>
            </label>
            <select
              id="sj-journal"
              className="ddb-champ ddb-champ-liste"
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
            >
              {journaux.map((j) => (
                <option key={j.code} value={j.code}>
                  {j.intitule}
                </option>
              ))}
            </select>
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-numpiece">
              N° pièce
            </label>
            {/* Laissé vide, il est attribué : « OD » + six chiffres, le
                suivant du journal. C'est ce que fait l'original, dont le
                champ est vide sur la capture. */}
            <input
              id="sj-numpiece"
              className="ddb-champ"
              value={numPiece}
              placeholder="attribué"
              onChange={(e) => setNumPiece(e.target.value)}
            />
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-datepiece">
              Date Pièce<span className="cot-requis"> *</span>
            </label>
            <input
              id="sj-datepiece"
              type="date"
              className="ddb-champ"
              value={datePiece}
              onChange={(e) => setDatePiece(e.target.value)}
            />
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-cheque">
              N° chèque
            </label>
            <input
              id="sj-cheque"
              className="ddb-champ"
              value={numCheque}
              onChange={(e) => setNumCheque(e.target.value)}
            />
          </div>
        </div>

        {/* --- La ligne en cours ------------------------------------------ */}
        <div className="sj-grille">
          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-compte">
              Compte Général<span className="cot-requis"> *</span>
            </label>
            <select
              id="sj-compte"
              className="ddb-champ ddb-champ-liste"
              value={ligne.compteGen}
              onChange={(e) =>
                setLigne((l) => ({ ...l, compteGen: e.target.value, compteTiers: '' }))
              }
            >
              <option value="">Choisir un compte</option>
              {comptes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.intitule}
                </option>
              ))}
            </select>
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-tiers">
              Compte Tiers
            </label>
            <select
              id="sj-tiers"
              className="ddb-champ ddb-champ-liste"
              value={ligne.compteTiers}
              onChange={poser('compteTiers')}
              disabled={!famille}
            >
              <option value="">{famille ? 'Choisir un tiers' : 'Sans objet'}</option>
              {tiers.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.intitule}
                </option>
              ))}
            </select>
            {!famille && ligne.compteGen && (
              <p className="cot-aide">Ce compte ne prend pas de tiers.</p>
            )}
            {famille === 'participants' && !societe && (
              <p className="cot-aide">Choisissez d’abord la société : les tiers en dépendent.</p>
            )}
            {famille === 'participants' && societe && !tiers.length && (
              <p className="cot-aide">Aucun participant dans la société {societe}.</p>
            )}
          </div>
        </div>

        <div className="sj-grille sj-grille-ligne">
          <div className="ddb-groupe sj-large">
            <label className="ddb-etiquette" htmlFor="sj-libelle">
              Libellé<span className="cot-requis"> *</span>
            </label>
            <input
              id="sj-libelle"
              className="ddb-champ"
              value={ligne.libelle}
              onChange={poser('libelle')}
            />
          </div>

          <div className="ddb-groupe">
            {/* Pas de « (0) » entre parenthèses : c'est la notation de la
                valeur par défaut dans l'original, et le champ l'affiche
                déjà. Même décision qu'au modal des cotisations. */}
            <label className="ddb-etiquette" htmlFor="sj-debit">
              Mtt. Débit<span className="cot-requis"> *</span>
            </label>
            <input
              id="sj-debit"
              type="number"
              className="ddb-champ text-end"
              value={ligne.debit}
              placeholder="0"
              onChange={poser('debit')}
            />
          </div>

          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="sj-credit">
              Mtt. Crédit<span className="cot-requis"> *</span>
            </label>
            <input
              id="sj-credit"
              type="number"
              className="ddb-champ text-end"
              value={ligne.credit}
              placeholder="0"
              onChange={poser('credit')}
            />
          </div>

          <div className="sj-poser">
            <button type="button" className="cot-bouton cot-bouton-rouge" onClick={validerSaisie}>
              Valider Saisie
            </button>
          </div>
        </div>

        {/* --- Les lignes déjà posées ------------------------------------- */}
        <div className="tableau-conteneur sj-lignes">
          <table className="table ddb-tableau tableau-dense cot-tableau">
            <thead>
              <tr>
                <th>N° Pièce</th>
                <th>Date pièce</th>
                <th>Cpte. Gen.</th>
                <th>Compte Tiers</th>
                {plusieursSocietes && <th>Soc.</th>}
                <th>N° Chèque</th>
                <th>Libellé</th>
                <th className="text-end">Débit</th>
                <th className="text-end">Crédit</th>
                <th aria-label="Retirer" />
              </tr>
            </thead>
            <tbody>
              {!lignes.length && (
                <tr>
                  <td colSpan={plusieursSocietes ? 10 : 9} className="cot-vide">
                    Aucune ligne. Remplissez la ligne ci-dessus, puis « Valider Saisie ».
                  </td>
                </tr>
              )}
              {lignes.map((l, i) => (
                <tr key={`${l.compteGen}-${i}`}>
                  <td>{numPiece}</td>
                  <td>{dateCourte(l.datePiece)}</td>
                  <td>{l.compteGen}</td>
                  <td>{l.compteTiers}</td>
                  {plusieursSocietes && <td>{l.societe}</td>}
                  <td>{l.numCheque}</td>
                  <td>{l.libelle}</td>
                  <td className="text-end">{l.debit ? montant(l.debit) : ''}</td>
                  <td className="text-end">{l.credit ? montant(l.credit) : ''}</td>
                  <td className="sj-retirer">
                    <button
                      type="button"
                      onClick={() => retirer(i)}
                      aria-label={`Retirer la ligne ${i + 1}`}
                    >
                      <CIcon icon={cilTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- Le pied : les deux totaux, puis les deux boutons ----------- */}
        <div className="sj-pied">
          <span className={`sj-totaux${equilibre ? ' sj-equilibre' : ''}`}>
            Debit: {montant(totalDebit)} - Credit: {montant(totalCredit)}
            {lignes.length > 0 && !equilibre && (
              <em className="sj-ecart"> écart {montant(Math.abs(totalDebit - totalCredit))}</em>
            )}
          </span>
          <span>
            <button type="button" className="cot-bouton cot-bouton-encre" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="cot-bouton cot-bouton-rouge ms-2"
              onClick={valider}
              disabled={!equilibre || envoi}
              title={
                equilibre
                  ? 'Enregistrer la pièce'
                  : 'Une pièce s’enregistre équilibrée, et porte au moins deux lignes.'
              }
            >
              {envoi && <CSpinner size="sm" className="me-2" />}
              Valider
            </button>
          </span>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default SaisieJournalModal
