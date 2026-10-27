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
  IonSpinner,
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
import { useGeolocalisation, type EtatLocalisation } from './itineraire/useGeolocalisation'
import { useTrajet, type EtatTrajet } from './itineraire/useTrajet'
import {
  libelleSpecialite,
  lienItineraire,
  lienTelephone,
  nomStructure,
} from './conventionnes/recherche'
import { useConventionnes } from './conventionnes/useConventionnes'
import './itineraire/itineraire.css'

// Leaflet n'est téléchargé qu'à l'ouverture d'une carte.
const Carte = lazy(() => import('./itineraire/Carte'))

/** Hauteur réservée à la feuille du bas, pour que le cadrage ne passe pas dessous. */
const HAUTEUR_FEUILLE = 260

export type ItineraireProps = RouteComponentProps<{ code: string }>

export default function Itineraire({ match }: ItineraireProps) {
  const code = decodeURIComponent(match.params.code ?? '')
  const { structures, erreur } = useConventionnes()
  const structure = structures?.find((s) => s.code === code) ?? null
  const localisation = useGeolocalisation()
  const moi = localisation.etat === 'trouvee' ? localisation.position : null
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
                localisation={localisation}
                trajet={trajet}
                localisee={destination !== null}
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
              <IonSpinner name="crescent" aria-hidden="true" />
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
  localisation,
  trajet,
  localisee,
}: {
  localisation: EtatLocalisation
  trajet: EtatTrajet
  localisee: boolean
}) {
  let contenu: ReactNode
  if (!localisee) {
    contenu = (
      <p className="itineraire__message">
        L’IPM n’a pas encore placé cette structure sur la carte. Le guidage la cherchera par son
        adresse.
      </p>
    )
  } else if (localisation.etat === 'non-securisee') {
    contenu = (
      <p className="itineraire__message">
        Votre position ne peut pas être utilisée sur cette version de test de l’application. Le
        guidage, lui, part bien de là où vous êtes.
      </p>
    )
  } else if (localisation.etat === 'refusee') {
    contenu = (
      <p className="itineraire__message">
        Autorisez la localisation dans les réglages du navigateur pour voir le trajet depuis votre
        position.
      </p>
    )
  } else if (localisation.etat === 'indisponible') {
    contenu = (
      <p className="itineraire__message">
        Position introuvable pour l’instant. Le guidage reste possible.
      </p>
    )
  } else if (
    localisation.etat === 'recherche' ||
    trajet.etat === 'attente' ||
    trajet.etat === 'calcul'
  ) {
    contenu = (
      <p className="itineraire__message itineraire__message--attente" aria-busy="true">
        <IonSpinner name="dots" aria-hidden="true" />
        {localisation.etat === 'recherche' ? 'Localisation en cours…' : 'Calcul de l’itinéraire…'}
      </p>
    )
  } else if (trajet.etat === 'echec') {
    contenu = (
      <p className="itineraire__message">
        Itinéraire indisponible pour l’instant. Le guidage reste possible.
      </p>
    )
  } else {
    const { distance, duree } = trajet.trajet
    contenu = (
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
    )
  }
  return (
    <div className="itineraire__resume" aria-live="polite">
      {contenu}
    </div>
  )
}
