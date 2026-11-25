/**
 * Page « Fournisseurs de Soins ».
 *
 * Les prestataires conventionnés - cliniques, pharmacies, laboratoires,
 * cabinets - que la caisse rembourse. Deux onglets, comme l'application
 * d'origine :
 *   - Tous les Fournisseurs   les prestataires agréés
 *   - Demandes d'agrément     les demandes en attente d'instruction ; une
 *                             demande validée rejoint l'onglet précédent
 *
 * Chaque onglet monte le composant <Referentiel /> de « Données de base »
 * plutôt que de réécrire un écran équivalent : même tableau, même panneau
 * latéral, mêmes gestes. Les feuilles de styles sont importées ici parce que
 * les vues sont chargées à la demande - arriver directement sur
 * /fournisseurs-de-soins ne monte pas les autres pages, donc ne charge pas
 * leurs styles.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
// La page ne porte plus l'en-tête ni les onglets de Participants (cf.
// fournisseurs-de-soins.scss), mais cette feuille marque aussi les champs
// obligatoires laissés vides des DEUX formulaires de cet écran
// (`.ddb-formulaire-fournisseurs-de-soins`, `.ddb-formulaire-demandes-agrement`
// y sont nommés explicitement) : elle reste donc importée.
import '../participants/participants.scss'
import './fournisseurs-de-soins.scss'
import { FOURNISSEURS_DE_SOINS } from './config'
import { DEMANDES_AGREMENT } from './demandesAgrement'

const ONGLETS = [
  { cle: 'fournisseurs', libelle: 'Tous les Fournisseurs', referentiel: FOURNISSEURS_DE_SOINS },
  { cle: 'demandes', libelle: 'Demandes d’agrément', referentiel: DEMANDES_AGREMENT },
]

/**
 * Combien de fiches la page montre, sur celles qu'elle possède.
 *
 * **Toutes (2026-11-12).** La restriction à douze datait de la base de
 * démonstration ; sur les vraies données LAMPS, l'app doit montrer les
 * 412 fournisseurs réels - la tuile « Prestataires de soins actifs » du
 * tableau de bord se cale sur cette constante, et douze y était faux.
 *
 * **Pour re-restreindre l'affichage, remettre un nombre ici** (c'est la seule
 * constante à toucher) ; `Infinity` montre tout.
 */
export const FICHES_VISIBLES = Infinity
const lignesVisibles = (total) => Math.min(total, FICHES_VISIBLES)

const FournisseursDeSoins = () => {
  const [onglet, setOnglet] = useState(ONGLETS[0].cle)
  // Stats de l'onglet actif, posées en pastille à côté du titre (comme Données
  // de base) ; <Referentiel> les remonte.
  const [stats, setStats] = useState(null)
  const base = ONGLETS.find((o) => o.cle === onglet)
  // Dans le `useMemo` et non à l'appel : un objet neuf à chaque rendu ferait
  // croire au composant que son référentiel a changé.
  const courant = useMemo(
    () => ({
      ...base,
      referentiel: { ...base.referentiel, limiteAffichage: lignesVisibles },
    }),
    [base],
  )
  const changerOnglet = (cle) => {
    setStats(null)
    setOnglet(cle)
  }

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu fds-page">
          {/* Le chapeau porte le titre et le total de la vue (« Total
              Fournisseurs: 411 », le libellé de l'application d'origine), que
              <Referentiel /> remonte par `onStats`. */}
          <header className="fds-chapeau">
            <h1 className="fds-titre">Fournisseurs de Soins</h1>
            <PastillesStats segments={stats?.segments} />
          </header>

          {/* Les deux onglets en cartes : ce sont deux états du même dossier -
              une demande agréée devient un fournisseur - et leurs colonnes ne
              se ressemblent pas. */}
          <nav className="fds-cartes" aria-label="Sections des fournisseurs de soins">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`fds-carte${onglet === o.cle ? ' fds-carte-active' : ''}`}
                aria-current={onglet === o.cle ? 'page' : undefined}
                onClick={() => changerOnglet(o.cle)}
              >
                <span className="fds-carte-libelle">{o.libelle}</span>
              </button>
            ))}
          </nav>

          {/* `key` : changer d'onglet remonte le composant, qui relit la base.
              Un fournisseur tout juste agréé apparaît donc dès qu'on revient
              sur la liste, sans avoir à actualiser la page. */}
          <Referentiel key={courant.cle} referentiel={courant.referentiel} onStats={setStats} />
        </section>
      </CCardBody>
    </CCard>
  )
}

export default FournisseursDeSoins
