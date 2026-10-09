/**
 * Fiche détaillée d'un fournisseur de soins, en lecture.
 *
 * Ouverte par l'œil d'une ligne de « Tous les fournisseurs », elle reprend
 * exactement la page « Détails fournisseur » de l'application d'origine : même
 * titre (raison sociale : spécialité), même pastille d'état, mêmes rubriques
 * dans le même ordre, plan du prestataire à droite. On la consulte sans risquer
 * de rien modifier ; la modification reste au crayon de la ligne.
 *
 * Une rubrique non saisie reste vide - y compris celles que la fiche ne permet
 * pas encore de saisir (FAX, BP, Région, Pays, Site web, dates de début et de
 * convention). De même, le plan se place sur la latitude et la longitude du
 * prestataire : sans elles, son cadre reste vide. Chaque rubrique lit déjà le
 * nom sous lequel la donnée sera enregistrée : elle se remplira d'elle-même.
 */

import React from 'react'
import { CModal } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilUser } from '@coreui/icons'

import { listerEntreesSync } from '../../services/referentiels'
import './fiche-fournisseur.scss'

/** « 2026-09-09T12:56:49Z » → « 09/09/2026 ». */
const formaterDate = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR')
}

/** Une coordonnée n'est retenue que si c'est un nombre : « 14,69 » compte, « » non. */
const coordonnee = (valeur) => {
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') return null
  const nombre = Number(String(valeur).replace(',', '.'))
  return Number.isFinite(nombre) ? nombre : null
}

/** Une information : libellé en gras, valeur à la suite, vide si non saisie. */
const Info = ({ libelle, valeur, mono = false }) => (
  <div className="ffs-ligne">
    <dt>{libelle} :</dt>
    <dd className={mono ? 'ffs-mono' : undefined}>{valeur || ''}</dd>
  </div>
)

const FicheFournisseur = ({ entree, visible, onFermer }) => {
  // La liste ne porte que le code de la spécialité : son intitulé et son
  // compte comptable se lisent dans le référentiel des données de base.
  const specialite = listerEntreesSync('specialites').find((s) => s.code === entree.specialite)

  // Plan Google Maps centré sur le prestataire, intégré sans clé d'API comme
  // l'original. Il faut ses deux coordonnées ; il faut aussi que le poste ait
  // accès à internet.
  const latitude = coordonnee(entree.latitude)
  const longitude = coordonnee(entree.longitude)
  const plan =
    latitude !== null && longitude !== null
      ? // `t=k` : vue satellite par défaut (plutôt que le plan de ville).
        `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&t=k&output=embed`
      : null

  return (
    <CModal
      visible={visible}
      onClose={onFermer}
      size="xl"
      alignment="center"
      className="ffs-fiche"
      aria-labelledby="ffs-titre"
    >
      <div className="ffs-entete">
        <h2 id="ffs-titre" className="ffs-titre">
          {entree.libelle}
          {specialite ? ` : ${specialite.libelle}` : ''}
        </h2>
        <div
          className="ffs-etat"
          title={entree.actif ? 'Convention active' : 'Convention suspendue'}
        >
          {/* `customClassName` et non `className` : la classe « icon » de
              CoreUI fige toute icône à 1 rem, et primerait sur la nôtre. */}
          <CIcon icon={cilUser} customClassName="ffs-etat-icone" />
          <span
            className={`ffs-etat-lettre${entree.actif ? '' : ' ffs-etat-suspendu'}`}
            aria-label={entree.actif ? 'Actif' : 'Suspendu'}
          >
            {entree.actif ? 'A' : 'S'}
          </span>
        </div>
      </div>

      <div className="ffs-corps">
        <dl className="ffs-infos">
          <Info libelle="Adresse" valeur={entree.adresse} />
          <Info libelle="Fixe" valeur={entree.telephone} mono />
          <Info libelle="Mobile" valeur={entree.mobile} mono />
          <Info libelle="Email" valeur={entree.email} />
          <Info libelle="FAX" valeur={entree.fax} mono />
          <Info libelle="BP" valeur={entree.bp} />
          <Info libelle="Banque" valeur={entree.banqueNom} />
          <Info libelle="Code banque" valeur={entree.banqueCode} mono />
          <Info libelle="Code agence" valeur={entree.guichetCode} mono />
          <Info libelle="Cmpte. ban." valeur={entree.compteBancaire} mono />
          <Info libelle="Clé RIB" valeur={entree.cleRib} mono />
        </dl>

        <dl className="ffs-infos">
          <Info libelle="Région" valeur={entree.region} />
          <Info libelle="Pays" valeur={entree.pays} />
          <Info libelle="Site web" valeur={entree.siteWeb} />
          <Info libelle="Compte" valeur={specialite?.compte} mono />
          <Info libelle="D. création" valeur={formaterDate(entree.cree_le)} />
          <Info libelle="D. de début" valeur={formaterDate(entree.dateDebut)} />
          <Info libelle="D. début convention" valeur={formaterDate(entree.dateDebutConvention)} />
          <Info libelle="D. fin convention" valeur={formaterDate(entree.dateFinConvention)} />
        </dl>

        {/* Sans coordonnées, le cadre du plan reste vide, comme une rubrique
            non saisie. */}
        <div className="ffs-carte">
          {plan && (
            <iframe
              title={`Plan : ${entree.libelle || 'prestataire'}`}
              src={plan}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </div>
      </div>

      <div className="ffs-pied">
        {/* Repères de l'application d'origine : depuis la fiche, on atteignait
            l'extrait de compte et les factures du prestataire. Présentés ici
            mais inactifs tant que le module Comptabilité n'existe pas. */}
        <div className="ffs-actions-compta">
          <button
            type="button"
            className="ffs-bouton-compta"
            disabled
            title="Disponible avec le module Comptabilité (à venir)"
          >
            Extrait de compte
          </button>
          <button
            type="button"
            className="ffs-bouton-compta"
            disabled
            title="Disponible avec le module Comptabilité (à venir)"
          >
            Factures
          </button>
          <span className="ffs-compta-mention">à venir</span>
        </div>
        <button type="button" className="ffs-fermer" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </CModal>
  )
}

export default FicheFournisseur
