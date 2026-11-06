/**
 * Modal « Cotisations société » de l'écran Cotisations (capture 82).
 *
 * Cinq champs, et chacun porte une décision :
 *
 *   - **Societe** : l'adhérent. Son compte 463 est porté par sa fiche, jamais
 *     calculé - c'est la règle de tout ce module, le référentiel porte son
 *     compte.
 *   - **Type de cotisation** : un **journal** (`type = 'COTISATION'`), pas un
 *     référentiel de plus. Son compte de rattachement donne le 701 à créditer,
 *     et on l'affiche sous le sélecteur : choisir un type, c'est choisir un
 *     compte de produit, autant que cela se voie.
 *   - **Date** : la date de la pièce.
 *   - **Mtt. cotisation** : ce que chaque cotisant devra. **Le champ ouvre à
 *     vide.** L'original y proposait 5 000, une valeur codée en dur par son
 *     auteur et sans règle derrière ; les 18 appels morts de LAMPS sont tous
 *     à 5 000 F par tête, validés sans qu'on y touche. Consigne du métier du
 *     2026-11-03. C'est la seule entorse volontaire de cet écran à la règle
 *     « tout identique à LAMPS » (docs/lamps/cotisations.md §4.1-3 et §9).
 *   - **Date Traitement** : grisée, déduite de la Date, toujours au mois.
 *     C'est l'axe sur lequel la comptabilité range la pièce, et il ne se
 *     saisit pas : l'appel d'août appartient à août, quel que soit le jour où
 *     on le comptabilise.
 *
 * Valider crée l'appel **et le déroule** : l'en-tête sans ses lignes n'a aucun
 * sens, et l'original ne laisse pas non plus d'appel vide derrière lui.
 */

import React, { useMemo, useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'

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

/** « nov.-2026 » : ce qu'affiche le champ grisé, déduit de la date de pièce. */
const periodeDe = (iso) => {
  if (!iso) return ''
  const [a, m] = iso.split('-')
  return `${MOIS_ABREGES[Number(m) - 1]}-${a}`
}

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/**
 * Le parent remonte ce modal à chaque ouverture (par sa clé) : l'état part
 * donc toujours à neuf, sans effet de remise à zéro. Rouvrir sur la saisie
 * précédente ferait appeler deux fois le même mois sans qu'on s'en aperçoive.
 */
const CotisationModal = ({ visible, references, onFermer, onCree }) => {
  const [societe, setSociete] = useState('')
  const [journal, setJournal] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [montant, setMontant] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const societes = useMemo(() => references?.societes || [], [references])
  const types = useMemo(() => references?.types || [], [references])

  // Le compte de produit du type choisi : on le montre plutôt que de laisser
  // deviner où la cotisation va se loger.
  const compteProduit = useMemo(
    () => types.find((t) => t.code === journal)?.compte || '',
    [types, journal],
  )
  const compteSociete = useMemo(
    () => societes.find((s) => s.code === societe)?.compte || '',
    [societes, societe],
  )

  const complet = societe && journal && date && Number(montant) > 0

  const valider = async () => {
    if (!complet) {
      toast.info('Société, type, date et montant sont nécessaires.')
      return
    }
    const [annee, mois] = date.split('-')
    setEnvoi(true)
    try {
      const appel = await request('/cotisations/', {
        method: 'POST',
        body: JSON.stringify({
          societe,
          journal,
          annee: Number(annee),
          mois: Number(mois),
          datePiece: date,
          montantUnitaire: Number(montant),
        }),
      })
      toast.success(
        `Appel ${appel.code} créé : ${appel.cotisants} cotisant(s), ` +
          `${Number(appel.total).toLocaleString('fr-FR')} F.`,
      )
      onCree?.(appel)
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onFermer} alignment="center" className="cot-modal">
      <CModalHeader>
        <CModalTitle>Cotisations société</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="ddb-groupe">
          <label className="ddb-etiquette" htmlFor="cot-societe">
            Societe<span className="cot-requis"> *</span>
          </label>
          <select
            id="cot-societe"
            className="ddb-champ ddb-champ-liste"
            value={societe}
            onChange={(e) => setSociete(e.target.value)}
          >
            <option value="">Choisir une société</option>
            {societes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.intitule}
              </option>
            ))}
          </select>
          {compteSociete && <p className="cot-aide">Compte débité : {compteSociete}</p>}
        </div>

        <div className="ddb-groupe">
          <label className="ddb-etiquette" htmlFor="cot-type">
            Type de cotisation<span className="cot-requis"> *</span>
          </label>
          <select
            id="cot-type"
            className="ddb-champ ddb-champ-liste"
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
          >
            <option value="">Choisir un type</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.intitule}
              </option>
            ))}
          </select>
          {compteProduit && <p className="cot-aide">Compte crédité : {compteProduit}</p>}
        </div>

        <div className="cot-ligne">
          <div className="ddb-groupe">
            <label className="ddb-etiquette" htmlFor="cot-date">
              Date<span className="cot-requis"> *</span>
            </label>
            <input
              id="cot-date"
              type="date"
              className="ddb-champ"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="ddb-groupe">
            {/* Pas de valeur de référence entre parenthèses, contrairement à
                l'original : il n'y en a aucune à proposer. */}
            <label className="ddb-etiquette" htmlFor="cot-montant">
              Mtt. cotisation<span className="cot-requis"> *</span>
            </label>
            <input
              id="cot-montant"
              type="number"
              min="1"
              className="ddb-champ text-end"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </div>
        </div>

        <div className="ddb-groupe">
          <label className="ddb-etiquette" htmlFor="cot-trait">
            Date Traitement
          </label>
          <input id="cot-trait" className="ddb-champ" value={periodeDe(date)} readOnly disabled />
          <p className="cot-aide">
            Le mois auquel la cotisation se rapporte. Déduit de la date, il ne se saisit pas.
          </p>
        </div>

        {/* Fermer en noir, Valider en rouge : les deux couleurs de la
            capture 82. */}
        <div className="cot-actions">
          <button type="button" className="cot-bouton cot-bouton-encre" onClick={onFermer}>
            Fermer
          </button>
          <button
            type="button"
            className="cot-bouton cot-bouton-rouge ms-2"
            onClick={valider}
            disabled={!complet || envoi}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Valider
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default CotisationModal
