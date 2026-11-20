/**
 * Écran « Retenues » (onglet /releve) : ce qui a été prélevé sur le salaire de
 * l'agent, mois par mois, et rien d'autre.
 *
 * Quand un agent se soigne, l'IPM règle le prestataire, puis la part restée à
 * la charge de l'agent se rembourse par des retenues sur salaire : ce sont
 * elles qu'on montre ici. Le solde restant est dans la barre du haut.
 *
 * Tirer pour rafraîchir, et disponible hors ligne (useCompte affiche le
 * dernier relevé en cache avant la réponse du serveur).
 */

import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  useIonToast,
  useIonViewDidEnter,
  type RefresherEventDetail,
} from '@ionic/react'
import { cashOutline, cloudOfflineOutline, warningOutline } from 'ionicons/icons'
import type { ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import { SqueletteCarte } from '../components/Skeletons'
import BarreActions from '../components/BarreActions'
import { chargerCompte, etatCompte, useCompte } from '../data/compte'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { MouvementMensuel } from '../types/api'
import { moisAnnee, montant } from '../utils/format'
import './releve/Releve.css'

/** Au retour sur l'onglet, le relevé est resynchronisé s'il a plus d'une minute. */
const FRAICHEUR_MS = 60_000

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 4

export default function Releve() {
  const { releve, chargement, erreur, depuisCache, synchroniseLe, rafraichir } = useCompte()
  const enLigne = useOnline()
  const [presenterToast] = useIonToast()

  // Lu dans le magasin (et non par fermeture) : Ionic n'enregistre ce
  // rappel qu'une fois.
  useIonViewDidEnter(() => {
    const { synchroniseLe: le, chargement: enCours } = etatCompte()
    const age = le ? Date.now() - Date.parse(le) : Number.POSITIVE_INFINITY
    if (!enCours && age > FRAICHEUR_MS) void chargerCompte()
  })

  async function surRafraichir(e: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    await rafraichir()
    e.detail.complete()
    const echec = etatCompte().erreur
    if (echec && echec.genre !== 'annulee' && echec.genre !== 'non-autorise') {
      haptique.erreur()
      void presenterToast({
        message: echec.message,
        duration: 2800,
        position: 'top',
        icon:
          echec.genre === 'reseau' || echec.genre === 'delai'
            ? cloudOfflineOutline
            : warningOutline,
      })
    }
  }

  // Relevé venu du cache parce que le serveur ne répond pas (en ligne).
  const serveurInjoignable = depuisCache && erreur !== null && !chargement

  let contenu: ReactNode
  if (releve === null) {
    contenu =
      erreur && !chargement ? (
        <EtatVide
          icone={enLigne ? warningOutline : cloudOfflineOutline}
          teinte="annule"
          titre="Impossible d’afficher vos retenues"
          message={erreur.message}
          action={{ libelle: 'Réessayer', onClick: () => void rafraichir() }}
        />
      ) : (
        <div className="ipm-section">
          <div className="ipm-pile">
            {Array.from({ length: SQUELETTES }, (_, i) => (
              <SqueletteCarte key={i} hauteur={88} />
            ))}
          </div>
        </div>
      )
  } else {
    contenu = (
      <section className="ipm-section releve-bloc" aria-label="Retenues sur salaire">
        {releve.retenues.length > 0 ? (
          <div className="ipm-pile">
            {releve.retenues.map((retenue, rang) => (
              <CarteRetenue key={`ret-${retenue.id}`} retenue={retenue} rang={rang} />
            ))}
          </div>
        ) : (
          <EtatVide
            icone={cashOutline}
            teinte="neutre"
            compact
            titre="Aucune retenue pour l’instant"
          />
        )}
      </section>
    )
  }

  return (
    <IonPage className="mon-releve retenues">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={surRafraichir}>
          <IonRefresherContent />
        </IonRefresher>

        {/* Pas d'en-tête noir : l'écran commence par la zone sûre (encoche). */}
        <BarreActions />

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {contenu}

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/**
 * Une retenue d'un mois : ce qui a été coupé sur la paie ce mois-là. Le mois
 * en titre, le montant à droite. Jamais cliquable (ce n'est pas un document).
 */
function CarteRetenue({ retenue, rang }: { retenue: MouvementMensuel; rang: number }) {
  const mois = moisAnnee(retenue.date)
  return (
    <CarteListe
      rang={rang}
      icone={cashOutline}
      // Icône grise, comme les réglages du profil.
      teinte="neutre"
      titre={mois ? mois.charAt(0).toUpperCase() + mois.slice(1) : 'Mois inconnu'}
      details="Prélevé sur votre salaire"
      etiquette={`${mois}, retenu sur salaire ${montant(retenue.montant)}`}
      puce={
        <span className="releve-montant releve-montant--retenue">- {montant(retenue.montant)}</span>
      }
    />
  )
}
