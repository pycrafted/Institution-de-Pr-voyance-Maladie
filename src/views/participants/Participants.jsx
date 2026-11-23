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
 * La création se fait par un bouton rouge « Nouveau participant » à droite de la
 * barre d'onglets, comme les autres pages (fournisseurs, factures…).
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
import { useConfirmation } from '../donnees-de-base/Confirmation'
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
  // L'ajout se confirme dans une fenêtre, comme sur les listes. Le troisième
  // retour met le panneau « en pause » le temps de la confirmation.
  const [demanderConfirmation, modaleConfirmation, confirmationOuverte] = useConfirmation()

  const nomDe = (valeurs) => `${valeurs.prenoms || ''} ${valeurs.nom || ''}`.trim()

  const confirmerAjout = (valeurs) =>
    demanderConfirmation({
      titre: 'Confirmer l’ajout',
      message: `Ajouter ${nomDe(valeurs) ? `« ${nomDe(valeurs)} »` : 'ce participant'} ?`,
      confirmer: 'Ajouter',
    })

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
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">Participants</h1>
              {/* Total et ventilation de la vue, en pastilles distinctes à côté
                  du titre, comme Données de base. */}
              <PastillesStats segments={stats?.segments} />
            </div>
            {/* Bouton rouge aligné au titre, tout à droite : création dans le
                panneau glissant, comme les autres pages. */}
            <button
              type="button"
              className="ddb-bouton-nouveau prt-bouton-nouveau"
              onClick={() => setCreationOuverte(true)}
            >
              <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
              Nouveau participant
            </button>
          </div>
          <nav className="prt-onglets" aria-label="Sections des participants">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={`prt-onglet${onglet === o.cle ? ' prt-onglet-actif' : ''}`}
                onClick={() => changerOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </nav>
        </div>

        <section className="ddb-contenu">
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
          onConfirmer={confirmerAjout}
          onEnregistrer={creerParticipant}
          enPause={confirmationOuverte}
        />

        {modaleConfirmation}
        {/* Le code d'activation mobile généré sur une ligne, montré une fois. */}
        <FenetreCodeActivation />
      </CCardBody>
    </CCard>
  )
}

export default Participants
