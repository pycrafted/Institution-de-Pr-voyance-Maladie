/**
 * Page « Participants ».
 *
 * Les salariés couverts par l'IPM - à distinguer des adhérents, qui sont les
 * collectivités cotisantes. La page présente deux onglets :
 *   - Participants IPM         liste des participants en activité
 *   - Participants Retraités   même liste, filtrée sur les retraités
 * Les ayants droit (ex-onglet « Familles ») se lisent désormais en dépliant la
 * ligne de chaque participant (cf. AyantsDroitParticipant). Les demandes de
 * photo, elles, restent atteignables sans onglet visible : la cloche des
 * notifications ouvre cette vue via « ?onglet=photos ».
 * La création se fait par un bouton « Nouveau participant » à droite du titre,
 * comme les autres pages (fournisseurs, factures…).
 *
 * Les listes réutilisent le composant <Referentiel /> ; la saisie d'un nouveau
 * participant ouvre le même panneau que les autres pages (fournisseurs de
 * soins…) - <FormulaireEntree />, glissé depuis la droite au-dessus de la
 * liste. La feuille de styles de « Données de base » est importée ici car les
 * vues sont chargées à la demande.
 */

import React, { useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus } from '@coreui/icons'

import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import FormulaireEntree from '../donnees-de-base/FormulaireEntree'
import '../donnees-de-base/donnees-de-base.scss'
import './participants.scss'
import { creerEntree, listerEntreesSync } from '../../services/referentiels'
import { toast } from '../../services/toast'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { PARTICIPANTS, PARTICIPANTS_IPM, PARTICIPANTS_RETRAITES } from './config'
import { DEMANDES_PHOTO } from './demandesPhoto'
import { FenetreCodeActivation } from './codeActivation'

const ONGLETS = [
  { cle: 'ipm', libelle: 'Participants IPM' },
  { cle: 'retraites', libelle: 'Participants Retraités' },
]

// « Demandes de photo » n'est plus un onglet permanent : les demandes arrivent
// par la cloche de notifications, qui ouvre cette vue via « ?onglet=photos ».
// On la garde donc atteignable (et instruisible) sans l'afficher dans la barre.
const ONGLET_PHOTOS = 'photos'
const CLES_VALIDES = [...ONGLETS.map((o) => o.cle), ONGLET_PHOTOS]

const Participants = () => {
  // Liste affichée : IPM, Retraités ou Familles. La création, elle, est un
  // panneau qui se glisse au-dessus de la liste (`creationOuverte`).
  // L'onglet peut venir de l'adresse (« ?onglet=photos ») : la cloche des
  // notifications mène ainsi droit aux demandes de photo.
  const [onglet, setOnglet] = useState(() => {
    const demande = new URLSearchParams(window.location.search).get('onglet')
    return CLES_VALIDES.includes(demande) ? demande : 'ipm'
  })
  const [creationOuverte, setCreationOuverte] = useState(false)
  // Stats de la liste active, remontées par <Referentiel> pour les poser en
  // pastille à côté du titre de la page, comme sur Données de base.
  const [stats, setStats] = useState(null)
  const changerOnglet = (cle) => {
    setStats(null)
    setOnglet(cle)
  }
  const nomDe = (valeurs) => `${valeurs.prenoms || ''} ${valeurs.nom || ''}`.trim()

  const creerParticipant = async (valeurs) => {
    try {
      // Un dossier qui vient d'être saisi attend son instruction : il entre
      // « En Attente ». Son état se change ensuite depuis la liste.
      await creerEntree('participants', { etat: 'En Attente', ...valeurs })
      toast.success(`${nomDe(valeurs) || 'Participant'} ajouté`)
      // On ferme le panneau et on ramène sur la liste IPM, où le nouveau
      // participant vient de s'ajouter.
      setCreationOuverte(false)
      setOnglet('ipm')
    } catch (e) {
      // Erreurs de saisie renvoyées par le serveur : le formulaire les pose
      // sous les champs concernés, comme les siennes.
      if (erreursDeChamps(e)) throw e
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
    }
  }

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <section className="ddb-contenu prt-page">
          <header className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Participants</h1>
              {/* Légende de la vue : la société filtrée, comme l'application
                  d'origine (« IPM SAR PERSONNEL MOO »). Elle était calculée
                  par le descripteur (`legendeStats`) et jetée - la liste ne la
                  pose elle-même que lorsqu'elle garde ses stats, et ici elle
                  les remonte à la page. */}
              {stats?.legende && <span className="prt-legende">{stats.legende}</span>}
              {/* Total et ventilation de la vue, en pastilles distinctes à côté
                  du titre, comme Données de base. */}
              <PastillesStats segments={stats?.segments} />
            </div>
            {/* Bouton d'accent aligné au titre, tout à droite : création dans
                le panneau glissant, comme les autres pages. */}
            <button
              type="button"
              className="ddb-bouton-nouveau prt-bouton-nouveau"
              onClick={() => setCreationOuverte(true)}
            >
              <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
              Nouveau participant
            </button>
          </header>

          {/* Les deux onglets en cartes : deux populations du même dossier, et
              le régime commande tout le reste de l'écran. */}
          <nav className="prt-cartes" aria-label="Sections des participants">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-carte${onglet === o.cle ? ' prt-carte-active' : ''}`}
                aria-current={onglet === o.cle ? 'page' : undefined}
                onClick={() => changerOnglet(o.cle)}
              >
                <span className="prt-carte-libelle">{o.libelle}</span>
              </button>
            ))}
          </nav>

          {onglet === 'ipm' && <Referentiel referentiel={PARTICIPANTS_IPM} onStats={setStats} />}
          {onglet === 'retraites' && (
            <Referentiel referentiel={PARTICIPANTS_RETRAITES} onStats={setStats} />
          )}
          {onglet === 'photos' && <Referentiel referentiel={DEMANDES_PHOTO} onStats={setStats} />}
        </section>

        {/* Saisie d'un nouveau participant : le même panneau glissant que les
            autres pages, ouvert par le bouton rouge « Nouveau participant ». */}
        <FormulaireEntree
          referentiel={PARTICIPANTS}
          entree={null}
          entrees={listerEntreesSync('participants')}
          visible={creationOuverte}
          onFermer={() => setCreationOuverte(false)}
          onEnregistrer={creerParticipant}
        />

        {/* Le code d'activation mobile généré sur une ligne, montré une fois. */}
        <FenetreCodeActivation />
      </CCardBody>
    </CCard>
  )
}

export default Participants
