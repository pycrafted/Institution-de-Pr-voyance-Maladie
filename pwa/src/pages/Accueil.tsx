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
  useIonToast,
  type RefresherEventDetail,
} from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import BandeauMarque from '../components/BandeauMarque'
import { BoutonPrincipal } from '../components/Boutons'
import CarteIdentite from '../components/CarteIdentite'
import Feuille from '../components/Feuille'
import FeuilleChoix from '../components/FeuilleChoix'
import GrilleServices from '../components/GrilleServices'
import { useNouveauBon } from '../components/NouveauBonModal'
import OfflineBanner from '../components/OfflineBanner'
import { useBons } from '../data/bons'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import { MESSAGE_BIENTOT, ouvreAssistant, type TypeDocument } from '../services/catalogue'
import { estGenreDocument } from '../utils/documents'
import { useParticipant, useSession } from '../session'
import { libelleLisible } from './accueil/accueil-utils'
import { usePhoto } from './accueil/usePhoto'
import './accueil/accueil.css'

export default function Accueil() {
  const { participant } = useParticipant()
  const { rafraichir: rafraichirProfil } = useSession()
  const enLigne = useOnline()
  const photo = usePhoto(rafraichirProfil, enLigne)
  const [presenterToast] = useIonToast()
  // Photo : « Changer » ou « Retirer », quand il y en a déjà une.
  const [photoDemandee, setPhotoDemandee] = useState(false)
  const { erreur, depuisCache, synchroniseLe, rafraichir: rafraichirBons } = useBons()
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
    void Promise.all([rafraichirBons(), rafraichirProfil()]).finally(() =>
      evenement.detail.complete(),
    )
  }

  // Message de l'envoi de photo : un toast, puis on l'oublie. Dans un effet
  // et non pendant le rendu, qui doit rester sans effet de bord.
  useEffect(() => {
    if (!photo.message) return
    void presenterToast({ message: photo.message, duration: 2500, position: 'top' })
    photo.oublierMessage()
  }, [photo, presenterToast])

  /** Portrait touché : choisir une photo, ou décider du sort de celle-ci. */
  function toucherPhoto() {
    if (!participant.photo) {
      photo.choisir()
      return
    }
    haptique.leger()
    setPhotoDemandee(true)
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

        <BandeauMarque
          variante="plein"
          chevauche
          titre="Accueil"
          // Ce que l'écran propose, comme sur les autres onglets.
          sousTitre="Votre carte d’adhérent et vos demandes de documents"
        />

        {/* La carte d'identité d'adhérent : la pièce que l'employé montre,
            la seule surface de marque de l'écran, et le seul endroit où
            figure son identité — le profil ne la répète plus. Son portrait
            se touche pour le poser ou le changer. */}
        <div className="accueil__chevauchement">
          <CarteIdentite
            nom={participant.nom}
            prenoms={participant.prenoms}
            matricule={participant.matricule}
            dateNaissance={participant.dateNaissance}
            societe={societe || undefined}
            photo={participant.photo}
            onChangerPhoto={photo.enCours ? undefined : toucherPhoto}
          />
          {/* Le sélecteur du téléphone : galerie ou appareil photo. Caché,
              c'est le portrait de la carte qui l'ouvre. */}
          <input
            ref={photo.inputRef}
            type="file"
            accept="image/*"
            className="accueil__fichier"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void photo.surFichier(e.target.files?.[0])}
          />
        </div>

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Demander un document</h2>
          </div>
          <GrilleServices
            onOuvrir={ouvrirDocument}
            onIndisponible={setAVenir}
            etiquette="Documents à demander"
          />
        </section>

        <div className="ipm-bas-page" />
      </IonContent>

      {/* Photo déjà posée : la changer, ou la retirer. */}
      <FeuilleChoix
        ouverte={photoDemandee}
        onFermer={() => setPhotoDemandee(false)}
        titre="Ma photo"
        message="Elle figure sur votre carte d’adhérent et sur votre fiche à l’IPM."
        icone={cameraOutline}
        choix={[
          { libelle: 'Changer la photo', genre: 'principal', onClick: () => photo.choisir() },
          { libelle: 'Retirer la photo', genre: 'danger', onClick: () => void photo.retirer() },
          { libelle: 'Annuler' },
        ]}
      />

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
    </IonPage>
  )
}
