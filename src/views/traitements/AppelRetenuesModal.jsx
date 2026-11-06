/**
 * Modal « Appel Retenues des Frais Médicaux » (capture 86).
 *
 * Le premier geste du circuit, et celui qui le rend possible : il photographie
 * la dette de chaque participant de la société, pour le mois choisi. Tant
 * qu'il n'a pas été fait, la table est vide et l'import n'a rien à remplir -
 * c'est ce que M. Sakho a montré en direct, en filtrant octobre sur une liste
 * qui n'affichait rien.
 *
 * Trois champs, et ce sont les trois mêmes que les filtres de la page.
 * L'original les redemande ici plutôt que de reprendre ceux de l'écran, et on
 * fait pareil : l'appel crée une campagne et pose une écriture au bout du
 * circuit, il mérite qu'on redise sur quoi il porte. Les champs s'ouvrent
 * donc sur ce que la page affiche, et restent modifiables.
 *
 * Quand la campagne existe déjà, le modal le dit et son bouton **relance**
 * l'appel au lieu de l'ouvrir : utile quand des factures ont été
 * comptabilisées depuis, ou qu'un agent est arrivé. Relancer ne perd pas les
 * montants déjà importés.
 */

import React, { useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'

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

const AppelRetenuesModal = ({
  visible,
  references,
  annees,
  defauts,
  dejaOuverte,
  onFermer,
  onAppele,
}) => {
  const [societe, setSociete] = useState(defauts.societe || '')
  const [annee, setAnnee] = useState(defauts.annee)
  const [mois, setMois] = useState(defauts.mois)
  const [envoi, setEnvoi] = useState(false)

  // La campagne annoncée ne vaut que pour les valeurs d'origine du modal :
  // dès qu'on change de mois ou de société, on ne sait plus ce qui existe, et
  // c'est le serveur qui tranchera.
  const inchange = societe === defauts.societe && annee === defauts.annee && mois === defauts.mois
  const relance = Boolean(dejaOuverte) && inchange

  const valider = async () => {
    if (!societe) return
    setEnvoi(true)
    try {
      const resultat = await request('/retenues/appeler/', {
        method: 'POST',
        body: JSON.stringify({ societe, annee: Number(annee), mois: Number(mois) }),
      })
      toast.success(resultat.message)
      onAppele({ societe, annee, mois })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onFermer} alignment="center" className="rfm-modal">
      <CModalHeader>
        <CModalTitle>Appel Retenues des Frais Médicaux</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="ddb-groupe">
          <label>
            Société<span className="rfm-requis"> *</span>
          </label>
          <select
            className="ddb-champ ddb-champ-liste"
            value={societe}
            onChange={(e) => setSociete(e.target.value)}
          >
            <option value="">- selectionner -</option>
            {references.societes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.intitule}
              </option>
            ))}
          </select>
        </div>

        <div className="ddb-groupe">
          <label>Année</label>
          <select
            className="ddb-champ ddb-champ-liste"
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
          >
            {annees.map((an) => (
              <option key={an} value={an}>
                {an}
              </option>
            ))}
          </select>
        </div>

        <div className="ddb-groupe">
          <label>Mois</label>
          <select
            className="ddb-champ ddb-champ-liste"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
          >
            {MOIS.map((nom, index) => (
              <option key={nom} value={index + 1}>
                {nom}
              </option>
            ))}
          </select>
        </div>

        {/* Ce que le bouton va faire : l'ouvrir, ou la redérouler. Le dire
            évite de cliquer en croyant créer et en écrasant. */}
        <p className="rfm-aide">
          {relance
            ? 'Cette campagne est déjà ouverte : l’appel la redéroule sur les soldes ' +
              'du jour, en gardant les montants déjà importés.'
            : 'L’appel photographie la dette de chaque participant qui en a une. ' +
              'Les montants viendront du fichier de la paie.'}
        </p>

        <div className="rfm-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={valider}
            disabled={envoi || !societe}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Valider
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

export default AppelRetenuesModal
