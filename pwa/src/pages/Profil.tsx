/**
 * Écran « Profil » (onglet /profil, SPEC_DESIGN §5) : « Mes informations » en
 * une seule carte groupée, puis les réglages en cartes d'action (§3.5).
 *
 * Ce qui a disparu, et pourquoi : les 13 `IonItem` répartis dans 4 `IonList`
 * et leurs filets gris — les interdictions de §1 —, puis la carte d'adhérent
 * elle-même. Elle est déjà sur l'accueil, avec le portrait qu'on y change :
 * la répéter ici ne montrait rien de nouveau et repoussait les réglages hors
 * de l'écran. Enfin « Ma famille » : les cartes d'ayant droit se touchent
 * désormais depuis l'accueil (components/CartePleinEcran), là où l'employé
 * en a besoin, au lieu d'être rangées dans un écran de réglages.
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
  type RefresherEventDetail,
} from '@ionic/react'
import {
  downloadOutline,
  helpBuoyOutline,
  informationCircleOutline,
  logOutOutline,
} from 'ionicons/icons'
import { useMemo, useState } from 'react'

import CarteListe from '../components/CarteListe'
import FeuilleChoix from '../components/FeuilleChoix'
import { haptique } from '../hooks/haptique'
import { useParticipant, useSession } from '../session'
import { estInstallee } from '../utils/plateforme'
import { VERSION } from '../version'
import { informationsDuParticipant } from './profil/informations'
import './profil/profil.css'

export default function Profil() {
  const { participant } = useParticipant()
  const { rafraichir, deconnecter } = useSession()
  // La question posée dans une feuille de choix, s'il y en a une.
  const [question, setQuestion] = useState<'deconnexion' | null>(null)
  const routeur = useIonRouter()
  const installee = useMemo(estInstallee, [])
  const informations = useMemo(() => informationsDuParticipant(participant), [participant])

  function actualiser(evenement: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    void rafraichir().finally(() => evenement.detail.complete())
  }

  function confirmerDeconnexion() {
    haptique.avertissement()
    setQuestion('deconnexion')
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
        <div className="ipm-zone-sure" />

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

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Réglages</h2>
          </div>
          <div className="ipm-pile">
            {!installee && (
              <CarteListe
                icone={downloadOutline}
                teinte="neutre"
                titre="Installer sur l’écran d’accueil"
                details="Ouverture en plein écran, sans passer par le navigateur."
                onClick={() => {
                  haptique.leger()
                  routeur.push('/installation', 'forward', 'push')
                }}
              />
            )}
            <CarteListe
              icone={helpBuoyOutline}
              teinte="neutre"
              titre="Assistance"
              details="Comment demander un bon, sa validité, les questions fréquentes."
              onClick={() => {
                haptique.leger()
                routeur.push('/assistance', 'forward', 'push')
              }}
            />
            <CarteListe
              icone={informationCircleOutline}
              teinte="neutre"
              titre="À propos"
              details="Version de l’application et données hors ligne."
              meta={<span className="ipm-chiffres">{VERSION}</span>}
              onClick={() => {
                haptique.leger()
                routeur.push('/a-propos', 'forward', 'push')
              }}
            />
            <CarteListe
              className="profil__deconnexion"
              icone={logOutOutline}
              teinte="annule"
              titre="Se déconnecter"
              details="Efface les bons enregistrés sur ce téléphone."
              chevron={false}
              onClick={confirmerDeconnexion}
            />
          </div>
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>

      <FeuilleChoix
        ouverte={question === 'deconnexion'}
        onFermer={() => setQuestion(null)}
        titre="Se déconnecter d’IPM Mobile ?"
        message="Les bons enregistrés sur ce téléphone seront effacés. Vous les retrouverez en vous identifiant à nouveau."
        icone={logOutOutline}
        choix={[
          {
            libelle: 'Se déconnecter',
            genre: 'principal',
            onClick: () => void deconnecter('volontaire'),
          },
          { libelle: 'Annuler' },
        ]}
      />
    </IonPage>
  )
}
