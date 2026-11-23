/**
 * Écran « Profil » (onglet /profil, SPEC_DESIGN §5) : « Mes informations » en
 * une seule carte groupée, puis les réglages en cartes d'action (§3.5).
 *
 * Ce qui a disparu, et pourquoi : les 13 `IonItem` répartis dans 4 `IonList`
 * et leurs filets gris — les interdictions de §1 —, puis la carte d'adhérent
 * elle-même. Elle est déjà sur l'accueil, avec le portrait qu'on y change :
 * la répéter ici ne montrait rien de nouveau et repoussait les réglages hors
 * de l'écran. Les cartes des ayants droit sont sur l'accueil, juste sous celle
 * de l'employé.
 *
 * La déconnexion efface jeton, profil, bons et PDF en cache
 * (useSession().deconnecter) ; App.tsx revient seul à l'identification.
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
import {
  checkmarkCircleOutline,
  downloadOutline,
  fingerPrint,
  keyOutline,
  logOutOutline,
  moon,
  sunny,
} from 'ionicons/icons'
import { useEffect, useMemo, useState } from 'react'

import Avatar from '../components/Avatar'
import CarteListe from '../components/CarteListe'
import BarreActions from '../components/BarreActions'
import { haptique } from '../hooks/haptique'
import { useFamille } from '../hooks/useFamille'
import { messageErreur } from '../api'
import { useParticipant, useSession } from '../session'
import { activerEmpreinte, desactiverEmpreinte } from '../session/empreinte'
import { basculerApparence, useApparence } from '../theme/apparence'
import { useInstallation } from '../utils/installation'
import { cleDeLAppareil, empreinteDisponible, estAbandon } from '../utils/clesAcces'
import { estInstallee } from '../utils/plateforme'
import { detailBeneficiaire } from './profil/famille'
import ChangerMotDePasse from './profil/ChangerMotDePasse'
import { nomPropre } from '../utils/libelles'
import { informationsDuParticipant } from './profil/informations'
import './profil/profil.css'

export default function Profil() {
  const { participant } = useParticipant()
  const famille = useFamille()
  const { rafraichir, deconnecter } = useSession()
  const sombre = useApparence() === 'sombre'
  const routeur = useIonRouter()
  const dejaInstallee = useMemo(estInstallee, [])
  const installation = useInstallation()
  // Masquée une fois l'app installée (avant, ou à l'instant depuis ce bouton).
  const installee = dejaInstallee || installation.installee

  /**
   * « Télécharger l'application » : ouvre directement la boîte d'installation
   * du navigateur quand il la propose (Android, Chrome, Edge). Sinon (iPhone,
   * Safari…), le navigateur n'offre pas d'installation en un geste : on mène
   * à /telecharger, l'écran qui explique comment l'ajouter.
   */
  function telechargerApplication() {
    haptique.leger()
    if (installation.possible) void installation.proposer()
    else routeur.push('/telecharger', 'forward', 'push')
  }
  const informations = useMemo(() => informationsDuParticipant(participant), [participant])

  const [presenterToast] = useIonToast()
  const [motDePasseOuvert, setMotDePasseOuvert] = useState(false)
  // Empreinte / Face ID : proposée si le téléphone sait le faire.
  const [empreintePossible, setEmpreintePossible] = useState(false)
  const [empreinteActive, setEmpreinteActive] = useState(() => cleDeLAppareil() !== null)
  const [empreinteEnCours, setEmpreinteEnCours] = useState(false)
  useEffect(() => {
    let vivant = true
    void empreinteDisponible().then((oui) => {
      if (vivant) setEmpreintePossible(oui)
    })
    return () => {
      vivant = false
    }
  }, [])

  function annoncer(message: string) {
    void presenterToast({ message, duration: 2400, position: 'top', icon: checkmarkCircleOutline })
  }

  async function basculerEmpreinte() {
    if (empreinteEnCours || !participant) return
    haptique.leger()
    setEmpreinteEnCours(true)
    try {
      if (empreinteActive) {
        await desactiverEmpreinte()
        setEmpreinteActive(false)
        annoncer('Empreinte retirée de cet appareil.')
      } else {
        await activerEmpreinte(participant.matriculeAffiche)
        setEmpreinteActive(true)
        haptique.succes()
        annoncer('Empreinte activée : connectez-vous d’un geste.')
      }
    } catch (e) {
      if (!estAbandon(e)) {
        haptique.erreur()
        void presenterToast({ message: messageErreur(e), duration: 3000, position: 'top' })
      }
    } finally {
      setEmpreinteEnCours(false)
    }
  }

  function actualiser(evenement: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    void rafraichir().finally(() => evenement.detail.complete())
  }

  // Pas de question : toucher « Se déconnecter » déconnecte aussitôt.
  function seDeconnecter() {
    haptique.leger()
    void deconnecter('volontaire')
  }

  return (
    <IonPage className="profil">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={actualiser}>
          <IonRefresherContent />
        </IonRefresher>

        {/* La barre d'actions est fixe au-dessus : sans cette réserve, la
            première carte commençait dessous (comme à l'accueil et dans les
            listes, qui ouvrent par la même zone sûre). */}
        <BarreActions />

        {/* Ce que l'IPM sait de l'employé, rubrique par rubrique. Rien ne s'y
            modifie : ces informations se corrigent à l'IPM, et la photo
            s'envoie depuis la feuille « Photos d'identité » de l'accueil. */}
        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Mes informations</h2>
          </div>
          <dl className="ipm-groupe profil__infos">
            {informations.map((info) => (
              <div
                key={info.cle}
                className={`profil__info${info.large ? ' profil__info--large' : ''}`}
              >
                <dt className="profil__info-libelle">{info.libelle}</dt>
                <dd className={`profil__info-valeur${info.chiffres ? ' ipm-chiffres' : ''}`}>
                  {info.lien ? (
                    <a href={info.lien} className="profil__info-lien">
                      {info.valeur}
                    </a>
                  ) : (
                    info.valeur
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* La famille couverte : une carte par ayant droit, sa photo
            d'identité (ou ses initiales), son nom, son lien et son âge. */}
        {famille.length > 0 && (
          <section className="ipm-section">
            <div className="ipm-entete-section">
              <h2 className="ipm-titre-section">Ayants droit</h2>
            </div>
            <div className="ipm-pile">
              {famille.map((membre, rang) => (
                <CarteListe
                  key={membre.matricule}
                  rang={rang}
                  vignette={
                    <Avatar
                      nom={membre.nomComplet}
                      photo={membre.photo}
                      taille={44}
                      forme="identite"
                    />
                  }
                  titre={nomPropre(membre.nomComplet)}
                  details={detailBeneficiaire(membre)}
                  chevron={false}
                />
              ))}
            </div>
          </section>
        )}

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Réglages</h2>
          </div>
          <div className="ipm-pile">
            <CarteListe
              icone={sombre ? sunny : moon}
              teinte="neutre"
              titre={sombre ? 'Passer en mode clair' : 'Passer en mode sombre'}
              chevron={false}
              onClick={() => {
                haptique.leger()
                basculerApparence()
              }}
            />
            {empreintePossible && (
              <CarteListe
                icone={fingerPrint}
                teinte="neutre"
                titre={
                  empreinteActive
                    ? 'Retirer l’empreinte / Face ID'
                    : 'Se connecter par empreinte / Face ID'
                }
                details={empreinteActive ? 'Activée sur cet appareil' : undefined}
                chevron={false}
                onClick={() => void basculerEmpreinte()}
              />
            )}
            <CarteListe
              icone={keyOutline}
              teinte="neutre"
              titre="Changer mon mot de passe"
              chevron={false}
              onClick={() => {
                haptique.leger()
                setMotDePasseOuvert(true)
              }}
            />
            {!installee && (
              <CarteListe
                icone={downloadOutline}
                teinte="neutre"
                titre="Télécharger l’application"
                chevron={false}
                onClick={telechargerApplication}
              />
            )}
            <CarteListe
              className="profil__deconnexion"
              icone={logOutOutline}
              teinte="annule"
              titre="Se déconnecter"
              chevron={false}
              onClick={seDeconnecter}
            />
          </div>
        </section>

        <ChangerMotDePasse
          ouverte={motDePasseOuvert}
          onFermer={(change) => {
            setMotDePasseOuvert(false)
            if (change) annoncer('Mot de passe changé.')
          }}
        />

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}
