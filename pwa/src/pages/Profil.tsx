/**
 * Écran « Profil » (onglet /profil, SPEC_DESIGN §5) : « Ma famille » en une
 * seule carte groupée, puis les réglages en cartes d'action (§3.5).
 *
 * Ce qui a disparu, et pourquoi : les 13 `IonItem` répartis dans 4 `IonList`
 * et leurs filets gris — les interdictions de §1 —, puis la carte d'adhérent
 * elle-même. Elle est déjà sur l'accueil, avec le portrait qu'on y change :
 * la répéter ici ne montrait rien de nouveau et repoussait la famille et les
 * réglages hors de l'écran.
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
  moonOutline,
  peopleOutline,
  sunnyOutline,
} from 'ionicons/icons'
import { useMemo, useState } from 'react'

import Avatar from '../components/Avatar'
import BandeauMarque from '../components/BandeauMarque'
import { BoutonPrincipal } from '../components/Boutons'
import CarteListe from '../components/CarteListe'
import EtatVide from '../components/EtatVide'
import Feuille from '../components/Feuille'
import FeuilleChoix from '../components/FeuilleChoix'
import { ouvrirFeuilleInstallation } from '../components/InstallSheet'
import { haptique } from '../hooks/haptique'
import { useParticipant, useSession } from '../session'
import { basculerApparence, useApparence } from '../theme/apparence'
import { estInstallee } from '../utils/plateforme'
import { matriculeSansSociete } from '../utils/format'
import { VERSION } from '../version'
import { detailBeneficiaire } from './profil/famille'
import { informationsDuParticipant } from './profil/informations'
import './profil/profil.css'

export default function Profil() {
  const { participant, beneficiaires } = useParticipant()
  const { rafraichir, deconnecter } = useSession()
  // La question posée dans une feuille de choix, s'il y en a une.
  const [question, setQuestion] = useState<'deconnexion' | null>(null)
  const routeur = useIonRouter()
  const [aProposOuvert, setAProposOuvert] = useState(false)
  const installee = useMemo(estInstallee, [])
  const sombre = useApparence() === 'sombre'
  const informations = useMemo(() => informationsDuParticipant(participant), [participant])
  // « Ma famille » ne liste que les ayants droit : le titulaire est déjà
  // détaillé juste au-dessus, dans « Mes informations ».
  const famille = useMemo(
    () => beneficiaires.filter((beneficiaire) => !beneficiaire.estParticipant),
    [beneficiaires],
  )

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

        <BandeauMarque titre="Profil" sousTitre="Vos informations, votre famille et les réglages" />

        {/* Ce que l'IPM sait de l'employé, rubrique par rubrique. Rien ne s'y
            modifie : ces informations se corrigent à l'IPM, et la photo se
            change sur la carte de l'accueil. */}
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
            <h2 className="ipm-titre-section">
              Ma famille{famille.length > 0 ? ` · ${famille.length}` : ''}
            </h2>
          </div>
          {famille.length === 0 ? (
            <EtatVide
              icone={peopleOutline}
              teinte="neutre"
              compact
              titre={beneficiaires.length === 0 ? 'Famille indisponible' : 'Aucun ayant droit'}
              message={
                beneficiaires.length === 0
                  ? 'La liste de vos bénéficiaires n’a pas encore pu être chargée. Tirez vers le bas pour actualiser.'
                  : 'Aucun ayant droit n’est rattaché à votre dossier. Rapprochez-vous de l’IPM pour en ajouter un.'
              }
            />
          ) : (
            <>
              {/* Une seule carte, et non cinq : la famille est UN objet. Rien
                  ne sépare ses lignes, comme dans « Mes informations ». */}
              <div className="ipm-groupe">
                {famille.map((beneficiaire, rang) => (
                  <CarteListe
                    key={beneficiaire.matricule}
                    rang={rang}
                    vignette={<Avatar nom={beneficiaire.nomComplet} taille={44} />}
                    titre={beneficiaire.nomComplet}
                    details={detailBeneficiaire(beneficiaire)}
                    meta={
                      <span className="ipm-chiffres">
                        {matriculeSansSociete(beneficiaire.matricule)}
                      </span>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Réglages</h2>
          </div>
          <div className="ipm-pile">
            {!installee && (
              <CarteListe
                icone={downloadOutline}
                teinte="rouge"
                titre="Installer sur l’écran d’accueil"
                details="Ouverture en plein écran, sans passer par le navigateur."
                onClick={ouvrirFeuilleInstallation}
              />
            )}
            {/* Le mode d'affichage, qui était un bouton sur l'accueil : il a
                sa place parmi les réglages, avec les autres préférences. */}
            <CarteListe
              icone={sombre ? sunnyOutline : moonOutline}
              teinte="neutre"
              titre={sombre ? 'Passer en mode clair' : 'Passer en mode sombre'}
              details={
                sombre
                  ? 'L’application est en sombre, reposant le soir.'
                  : 'L’application est en clair, lisible en plein jour.'
              }
              onClick={() => {
                haptique.leger()
                basculerApparence()
              }}
            />
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
              onClick={() => setAProposOuvert(true)}
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

      <Feuille
        ouverte={aProposOuvert}
        onFermer={() => setAProposOuvert(false)}
        titre="À propos"
        icone={informationCircleOutline}
      >
        <p className="profil__a-propos">
          IPM Mobile, l’application de l’Institution de Prévoyance Maladie de la SAR. Version{' '}
          <span className="ipm-chiffres">{VERSION}</span>.
        </p>
        <p className="profil__a-propos">
          Vos derniers bons restent consultables sans connexion. Ils sont effacés à la déconnexion.
        </p>
        <BoutonPrincipal onClick={() => setAProposOuvert(false)}>Compris</BoutonPrincipal>
      </Feuille>
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
