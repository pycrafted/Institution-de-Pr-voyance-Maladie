/**
 * Écran « Itinéraire » (/conventionnes/:code) : la carte, DANS l'application,
 * du chemin entre l'employé et la structure conventionnée.
 *
 * Plein écran, comme les cartes natives : la barre d'onglets s'efface, la
 * carte occupe tout, et flottent dessus un bouton retour et un bouton de
 * recentrage. En bas, une feuille dit l'essentiel — la structure, le temps et
 * la distance — et propose de lancer le guidage pas à pas dans Google Maps
 * (capable de guider à la voix) ou d'appeler.
 *
 * Chaque obstacle a son message plutôt qu'une carte muette : localisation
 * refusée, page non sécurisée (HTTP), structure pas encore localisée par
 * l'IPM, itinéraire incalculable.
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  useIonRouter,
  useIonViewWillEnter,
  useIonViewWillLeave,
} from '@ionic/react'
import {
  callOutline,
  carOutline,
  chevronBack,
  locateOutline,
  navigateOutline,
  searchOutline,
  walkOutline,
} from 'ionicons/icons'
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import type { RouteComponentProps } from 'react-router'

import { BoutonPrincipal } from '../components/Boutons'
import EtatVide from '../components/EtatVide'
import { haptique } from '../hooks/haptique'
import { nomPropre } from '../utils/libelles'
import type { CarteHandle } from './itineraire/Carte'
import { dureeAPied, formaterDistance, formaterDuree } from './itineraire/trajet'
import { useGeolocalisation } from './itineraire/useGeolocalisation'
import { useTrajet, type EtatTrajet } from './itineraire/useTrajet'
import {
  libelleSpecialite,
  lienItineraire,
  lienTelephone,
  nomStructure,
} from './conventionnes/recherche'
import { useConventionnes } from './conventionnes/useConventionnes'
import './itineraire/itineraire.css'
import Chargeur from '../components/Chargeur'

// Google Maps n'est téléchargé qu'à l'ouverture d'une carte.
const Carte = lazy(() => import('./itineraire/Carte'))

/** Hauteur réservée à la feuille du bas, pour que le cadrage ne passe pas dessous. */
const HAUTEUR_FEUILLE = 260

/**
 * Position de repli : la raffinerie, tant que la géolocalisation n'est pas
 * disponible.
 *
 * Le site mobile de test est servi en HTTP (port 8081), et un navigateur
 * refuse la géolocalisation hors contexte sécurisé. Plutôt que pas
 * d'itinéraire du tout, on fait partir le trajet de la SAR - et l'écran le
 * DIT, sous le temps de trajet (cf. `Resume`, « Trajet depuis la SAR »).
 *
 * À RETIRER une fois le site mobile servi en HTTPS : `moi` redeviendra
 * simplement la position relevée. Exportée pour que le test n'en recopie pas
 * les coordonnées.
 */
export const SAR_PAR_DEFAUT = { latitude: 14.740742, longitude: -17.34728 }

export type ItineraireProps = RouteComponentProps<{ code: string }>

export default function Itineraire({ match }: ItineraireProps) {
  const code = decodeURIComponent(match.params.code ?? '')
  const { structures, erreur } = useConventionnes()
  const structure = structures?.find((s) => s.code === code) ?? null
  const localisation = useGeolocalisation()
  const geoloc = localisation.etat === 'trouvee' ? localisation.position : null
  const positionParDefaut = geoloc === null
  const moi = geoloc ?? SAR_PAR_DEFAUT
  const destination = structure?.position ?? null
  const trajet = useTrajet(moi, destination)
  const carte = useRef<CarteHandle>(null)
  const routeur = useIonRouter()

  // Plein écran : la barre d'onglets s'efface tant que la carte est ouverte.
  useIonViewWillEnter(() => document.body.classList.add('ipm-sans-onglets'))
  useIonViewWillLeave(() => document.body.classList.remove('ipm-sans-onglets'))
  useEffect(() => () => document.body.classList.remove('ipm-sans-onglets'), [])

  function retour() {
    haptique.leger()
    if (routeur.canGoBack()) routeur.goBack()
    else routeur.push('/conventionnes', 'back', 'pop')
  }

  // Code inconnu (lien ancien, structure retirée) : on le dit.
  if (structures !== null && !structure) {
    return (
      <IonPage className="itineraire itineraire--vide">
        <IonContent fullscreen>
          <EtatVide
            icone={searchOutline}
            teinte="neutre"
            titre="Structure introuvable"
            message="Elle ne figure plus dans l’annuaire des structures de votre IPM."
            action={{ libelle: 'Retour à l’annuaire', onClick: retour, secondaire: true }}
          />
        </IonContent>
      </IonPage>
    )
  }

  const telephone = structure ? lienTelephone(structure.telephone) : null
  const guidage = structure ? lienItineraire(structure) : null

  return (
    <IonPage className="itineraire">
      <IonContent fullscreen scrollY={false}>
        <div className="itineraire__carte">
          <Suspense fallback={<div className="itineraire__attente-carte" aria-hidden="true" />}>
            <Carte
              ref={carte}
              destination={destination}
              position={moi}
              precision={localisation.etat === 'trouvee' ? localisation.precision : undefined}
              trace={trajet.etat === 'pret' ? trajet.trajet.trace : null}
              margeBas={HAUTEUR_FEUILLE}
            />
          </Suspense>
        </div>

        <button
          type="button"
          className="itineraire__flottant itineraire__retour ipm-appui"
          onClick={retour}
          aria-label="Retour"
        >
          <IonIcon icon={chevronBack} aria-hidden="true" />
        </button>

        {(moi || destination) && (
          <button
            type="button"
            className="itineraire__flottant itineraire__recentrer ipm-appui"
            onClick={() => {
              haptique.leger()
              carte.current?.recadrer()
            }}
            aria-label="Recentrer la carte"
          >
            <IonIcon icon={locateOutline} aria-hidden="true" />
          </button>
        )}

        <section className="itineraire__feuille" aria-label="Itinéraire">
          <span className="itineraire__poignee" aria-hidden="true" />
          {structure ? (
            <>
              <h1 className="itineraire__nom">{nomStructure(structure)}</h1>
              <p className="itineraire__lieu">
                {[libelleSpecialite(structure.specialite?.libelle), nomPropre(structure.adresse)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <Resume
                trajet={trajet}
                localisee={destination !== null}
                parDefaut={positionParDefaut}
              />

              <div className="itineraire__actions">
                {guidage && (
                  <BoutonPrincipal
                    icone={navigateOutline}
                    onClick={() => window.open(guidage, '_blank', 'noopener,noreferrer')}
                  >
                    Guidage dans Google Maps
                  </BoutonPrincipal>
                )}
                {telephone && (
                  <a
                    className="itineraire__appeler ipm-appui"
                    href={telephone}
                    aria-label={`Appeler ${nomStructure(structure)}`}
                    onClick={() => haptique.leger()}
                  >
                    <IonIcon icon={callOutline} aria-hidden="true" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="itineraire__chargement" aria-busy="true">
              <Chargeur aria-hidden="true" />
              <span>{erreur ? 'Annuaire indisponible pour l’instant.' : 'Chargement…'}</span>
            </div>
          )}
        </section>
      </IonContent>
    </IonPage>
  )
}

/**
 * Ce que la feuille dit du trajet : le temps et la distance quand tout est
 * là, sinon la raison — dite en clair, avec ce que l'employé peut y faire.
 */
function Resume({
  trajet,
  localisee,
  parDefaut,
}: {
  trajet: EtatTrajet
  localisee: boolean
  parDefaut: boolean
}) {
  let contenu: ReactNode
  if (!localisee) {
    contenu = (
      <p className="itineraire__message">
        L’IPM n’a pas encore placé cette structure sur la carte. Le guidage la cherchera par son
        adresse.
      </p>
    )
  } else if (trajet.etat === 'pret') {
    const { distance, duree } = trajet.trajet
    contenu = (
      <div className="itineraire__trajet-bloc">
        <div className="itineraire__trajet">
          <span className="itineraire__duree ipm-chiffres">{formaterDuree(duree)}</span>
          <span className="itineraire__details">
            <span className="itineraire__mode">
              <IonIcon icon={carOutline} aria-hidden="true" />
              <span className="ipm-chiffres">{formaterDistance(distance)}</span> en voiture
            </span>
            <span className="itineraire__mode">
              <IonIcon icon={walkOutline} aria-hidden="true" />
              environ <span className="ipm-chiffres">{formaterDuree(dureeAPied(distance))}</span> à
              pied
            </span>
          </span>
        </div>
        {parDefaut && (
          <p className="itineraire__depart-defaut">
            Trajet depuis la SAR - votre position n’est pas disponible sur cette version de test.
          </p>
        )}
      </div>
    )
  } else if (trajet.etat === 'echec') {
    contenu = (
      <p className="itineraire__message">
        Itinéraire indisponible pour l’instant. Le guidage reste possible.
      </p>
    )
  } else {
    contenu = (
      <p className="itineraire__message itineraire__message--attente" aria-busy="true">
        <Chargeur aria-hidden="true" />
        Calcul de l’itinéraire…
      </p>
    )
  }
  return (
    <div className="itineraire__resume" aria-live="polite">
      {contenu}
    </div>
  )
}
