/**
 * Raccourci « Ajout Article » de la barre des bons d'achats (capture 79).
 *
 * On compose une commande, l'article n'est pas au catalogue : on le crée sans
 * quitter l'écran. L'idée vient de l'application d'origine, qui posait ce
 * bouton juste à côté de « Créer un bon d'Achat », et elle mérite d'être
 * reprise - aller jusqu'à Données de Base → Articles Achat pour une cartouche
 * d'encre, puis revenir, c'est perdre le fil de la commande.
 *
 * La fiche créée est exactement celle du référentiel (même endpoint, mêmes
 * règles) : ce raccourci n'ouvre pas une seconde porte, il raccourcit
 * celle-ci. Le code suit la numérotation du référentiel, « ART0025 ».
 */

import React, { useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'

import { creerEntree } from '../../services/referentiels'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { actifs } from '../documents/commun'
import { COMPTES_ACHAT } from '../donnees-de-base/config'

/** Prochain code du catalogue : « ART » + le rang suivant sur quatre chiffres. */
const prochainCode = () => {
  const dernier = actifs('articles-achat')
    .map((a) => Number(String(a.code).replace(/^ART/, '')) || 0)
    .reduce((max, n) => Math.max(max, n), 0)
  return `ART${String(dernier + 1).padStart(4, '0')}`
}

const ArticleAchatModal = ({ visible, onFermer, onCree }) => {
  const [libelle, setLibelle] = useState('')
  const [prixUnitaire, setPrixUnitaire] = useState('0')
  const [compte, setCompte] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const code = prochainCode()

  const enregistrer = async () => {
    if (!libelle.trim()) {
      toast.info('Donnez une désignation à l’article.')
      return
    }
    try {
      setEnvoi(true)
      const article = await creerEntree('articles-achat', {
        code,
        libelle: libelle.trim(),
        prixUnitaire: Number.parseInt(prixUnitaire, 10) || 0,
        compte,
      })
      toast.success(`Article ${article?.code || code} ajouté`)
      setLibelle('')
      setPrixUnitaire('0')
      setCompte('')
      onCree?.(article)
      onFermer()
    } catch (e) {
      toast.error(`Ajout impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onFermer} alignment="center" className="ba-article-modal">
      <CModalHeader>
        <CModalTitle>Ajout Article</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="ddb-groupe">
          <label>Code</label>
          <input className="ddb-champ" value={code} readOnly disabled />
        </div>
        <div className="ddb-groupe">
          <label>
            Designation de l’article<span className="ba-requis"> *</span>
          </label>
          <input
            className="ddb-champ"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            autoComplete="off"
            // L'article se saisit dès l'ouverture : c'est le seul champ qui
            // demande vraiment quelque chose.
            autoFocus
          />
        </div>
        <div className="ddb-groupe">
          <label>Prix unitaire</label>
          <input
            className="ddb-champ text-end"
            value={prixUnitaire}
            onChange={(e) => setPrixUnitaire(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <div className="ddb-groupe">
          <label>Compte rattaché</label>
          <select
            className="ddb-champ ddb-champ-liste"
            value={compte}
            onChange={(e) => setCompte(e.target.value)}
          >
            <option value="">Aucun</option>
            {COMPTES_ACHAT.map((c) => (
              <option key={c.valeur} value={c.valeur}>
                {c.valeur} - {c.libelle}
              </option>
            ))}
          </select>
        </div>

        <div className="ba-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={enregistrer}
            disabled={envoi}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Enregistrer
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default ArticleAchatModal
