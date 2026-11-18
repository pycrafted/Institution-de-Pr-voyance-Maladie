/**
 * Écran « Profil » (onglet /profil, SPEC_DESIGN §5) : « Mes informations » en
 * une seule carte groupée, puis les réglages en cartes d'action (§3.5).
 *
 * Ce qui a disparu, et pourquoi : les 13 `IonItem` répartis dans 4 `IonList`
 * et leurs filets gris — les interdictions de §1 —, puis la carte d'adhérent
 * elle-même. Elle est déjà sur l'accueil, avec le portrait qu'on y change :
 * la répéter ici ne montrait rien de nouveau et repoussait les réglages hors
 * de l'écran. La section « Ayants droit » (les cartes des proches, ouvertes en
 * grand par components/CartePleinEcran) a en revanche rejoint cet écran depuis
 * l'accueil, avec le reste du « compte/perso » de l'agent.
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
  moon,
  sunny,
} from 'ionicons/icons'
import { useMemo, useState } from 'react'

import Avatar from '../components/Avatar'
import CarteListe from '../components/CarteListe'
import CartePleinEcran, { useFamille } from '../components/CartePleinEcran'
import FeuilleChoix from '../components/FeuilleChoix'
import { haptique } from '../hooks/haptique'
import { useParticipant, useSession } from '../session'
import { basculerApparence, useApparence } from '../theme/apparence'
import { estInstallee } from '../utils/plateforme'
import { VERSION } from '../version'
import { informationsDuParticipant } from './profil/informations'
import './profil/profil.css'

export default function Profil() {
  const { participant } = useParticipant()
  const { rafraichir, deconnecter } = useSession()
  const sombre = useApparence() === 'sombre'
  const famille = useFamille()
  // La question posée dans une feuille de choix, s'il y en a une.
  const [question, setQuestion] = useState<'deconnexion' | null>(null)
  // Carte d'ayant droit montrée en grand (son matricule), ou null.
  const [cartePleinEcran, setCartePleinEcran] = useState<string | null>(null)
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

        {/* Les cartes des ayants droit : on présente souvent celle d'un proche
            (l'enfant qu'on emmène en pharmacie), elle est ici en un toucher.
            Venue de l'accueil, elle rejoint le profil - le « compte/perso » de
            l'agent. Masquée s'il n'a pas d'ayant droit. */}
        {famille.length > 0 && (
          <section className="ipm-section">
            <div className="ipm-entete-section">
              <h2 className="ipm-titre-section">Ayants droit</h2>
            </div>
            <ul className="profil-famille" aria-label="Cartes d’ayant droit">
              {famille.map((membre) => (
                <li key={membre.matricule}>
                  <button
                    type="button"
                    className="profil-famille__membre ipm-appui"
                    aria-label={`Carte d’ayant droit de ${membre.prenoms} ${membre.nom}`}
                    onClick={() => {
                      haptique.leger()
                      setCartePleinEcran(membre.matricule)
                    }}
                  >
                    {/* La forme de la photo de la carte d'adhérent : le même
                        visage se reconnaît d'un écran à l'autre. */}
                    <Avatar nom={membre.nomComplet} photo={membre.photo} taille={56} forme="identite" />
                    <span className="profil-famille__nom">{membre.prenoms}</span>
                  </button>
                </li>
              ))}
            </ul>
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
            {!installee && (
              <CarteListe
                icone={downloadOutline}
                teinte="neutre"
                titre="Installer sur l’écran d’accueil"
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
              onClick={() => {
                haptique.leger()
                routeur.push('/assistance', 'forward', 'push')
              }}
            />
            <CarteListe
              icone={informationCircleOutline}
              teinte="neutre"
              titre="À propos"
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
              chevron={false}
              onClick={confirmerDeconnexion}
            />
          </div>
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>

      <CartePleinEcran cible={cartePleinEcran} onFermer={() => setCartePleinEcran(null)} />

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
