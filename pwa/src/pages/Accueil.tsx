/**
 * Écran « Accueil » (onglet /accueil) — SPEC_DESIGN §4. C'est l'écran de
 * référence de la refonte, de haut en bas :
 *
 *   1. bandeau de marque plein (§3.2), qui réserve 24 px sous lui ;
 *   2. la carte d'identité d'adhérent (components/CarteIdentite), qui
 *      REMONTE de ces 24 px sur le bandeau — c'est ce chevauchement qui donne
 *      la profondeur. Photo d'identité et champs nommés (nom, prénoms,
 *      matricule…), comme la carte que l'organisation remet à ses employés ;
 *      le bandeau n'en remet pas un portrait à 100 px de là ;
 *   3. « Demander un document » : deux colonnes de grandes cartes (§3.4),
 *      une par type de bon, issues de DOCUMENTS.
 *
 * Les ayants droit sont au Profil. Le solde IPM est dans la barre du haut.
 *
 * Et rien d'autre : demander un document est la raison d'être de l'écran.
 * Les écrans utilitaires ne s'y invitent pas — « Mes bons »,
 * « Pharmacies » et « Profil » sont des onglets de la barre du bas, et
 * « Assistance » vit dans les réglages du profil.
 *
 * L'accueil ne liste plus les derniers bons : demander un document est sa
 * seule raison d'être, et la liste complète vit dans l'onglet « Mes
 * documents ». Les bons restent chargés ici — c'est ce chargement qui dit si
 * le serveur répond, donc s'il faut afficher le bandeau hors ligne — et
 * tirer vers le bas les rafraîchit avec le profil.
 */

import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  useIonRouter,
  type RefresherEventDetail,
} from '@ionic/react'
import { useState } from 'react'

import { BoutonPrincipal } from '../components/Boutons'
import CarteIdentite from '../components/CarteIdentite'
import Feuille from '../components/Feuille'
import GrilleServices from '../components/GrilleServices'
import { useNouveauBon } from '../components/NouveauBonModal'
import OfflineBanner from '../components/OfflineBanner'
import BarreActions from '../components/BarreActions'
import { useBons } from '../data/bons'
import { useCompte } from '../data/compte'
import { haptique } from '../hooks/haptique'
import { MESSAGE_BIENTOT, ouvreAssistant, type TypeDocument } from '../services/catalogue'
import { estGenreDocument } from '../utils/documents'
import { useParticipant, useSession } from '../session'
import { libelleLisible } from './accueil/accueil-utils'
import './accueil/accueil.css'

export default function Accueil() {
  const { participant } = useParticipant()
  const { rafraichir: rafraichirProfil } = useSession()
  const { erreur, depuisCache, synchroniseLe, rafraichir: rafraichirBons } = useBons()
  // Le solde est dans la barre du haut ; l'accueil le rafraîchit au tirer.
  const { rafraichir: rafraichirCompte } = useCompte()
  const { ouvrirAssistant } = useNouveauBon()
  const routeur = useIonRouter()
  // Document à venir dont on explique l'absence, dans une feuille (§3.9).
  const [aVenir, setAVenir] = useState<TypeDocument | null>(null)

  const societe = libelleLisible(participant.societe?.libelle)
  // Serveur injoignable alors que l'appareil se dit connecté : on le dit
  // quand même (les bons affichés sont ceux du cache).
  const serveurInjoignable = depuisCache && erreur !== null && erreur.genre !== 'annulee'

  function actualiser(evenement: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    void Promise.all([rafraichirBons(), rafraichirProfil(), rafraichirCompte()]).finally(() =>
      evenement.detail.complete(),
    )
  }

  /** Toucher d'une carte de document ouverte : l'assistant, ou sa route. */
  function ouvrirDocument(document: TypeDocument) {
    if (ouvreAssistant(document) && estGenreDocument(document.cle)) {
      ouvrirAssistant(document.cle)
      return
    }
    if (document.route) routeur.push(document.route, 'forward', 'push')
  }

  return (
    <IonPage className="accueil">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={actualiser}>
          <IonRefresherContent />
        </IonRefresher>

        {/* Pas de salutation ni de titre : la barre d'actions occupe le haut
            de l'écran, et la carte d'adhérent est le héros de celui-ci. Ce
            vide réserve la hauteur de la barre, comme le fait l'en-tête des
            autres écrans. */}
        <BarreActions />

        {/* La carte d'identité d'adhérent : la pièce que l'employé montre,
            la seule surface de marque de l'écran, et le seul endroit où
            figure son identité — le profil ne la répète plus.

            Son portrait ne se touche PAS : une pièce d'identité ne se modifie
            pas au moment où on la présente. Les photos s'envoient depuis la
            feuille dédiée, ouverte par l'appareil photo du header.

            Elle ne s'ouvre plus en grand : elle se lit telle quelle. */}
        <div className="accueil__carte">
          <div className="accueil__carte-bouton">
            <CarteIdentite
              nom={participant.nom}
              prenoms={participant.prenoms}
              matricule={participant.matricule}
              dateNaissance={participant.dateNaissance}
              societe={societe || undefined}
              photo={participant.photo}
            />
          </div>
        </div>

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {/* Pas de titre : le filet la sépare des ayants droit ; son nom reste
            lu par les lecteurs d'écran. */}
        <section className="ipm-section accueil__documents" aria-label="Demander un bon">
          <GrilleServices
            onOuvrir={ouvrirDocument}
            onIndisponible={setAVenir}
            etiquette="Documents à demander"
          />
        </section>

        <div className="ipm-bas-page" />
      </IonContent>

      {/* Document à venir : on explique, on ne bloque pas sèchement. */}
      <Feuille
        ouverte={aVenir !== null}
        onFermer={() => setAVenir(null)}
        titre={aVenir?.libelle}
        icone={aVenir?.icone}
      >
        {/* Ce qu'est le document d'abord, puis quand l'avoir. */}
        {aVenir && <p className="accueil__a-venir">{aVenir.description}</p>}
        <p className="accueil__a-venir accueil__a-venir--quand">{MESSAGE_BIENTOT}</p>
        <BoutonPrincipal onClick={() => setAVenir(null)}>Compris</BoutonPrincipal>
      </Feuille>

      {/* Notifications : rien pour l'instant. On le dit honnêtement, dans une
          feuille, plutôt qu'une cloche inerte. */}
    </IonPage>
  )
}
