/**
 * Écran « Conventionnés » (/conventionnes) : l'annuaire de TOUTES les
 * structures conventionnées par l'IPM — pharmacies, cliniques, hôpitaux,
 * laboratoires, cabinets… — et non plus des seules pharmacies.
 *
 * De haut en bas :
 *   1. bandeau de marque compact (§3.2) ; c'est un onglet, donc sans retour ;
 *   2. champ de recherche (§3.8) par nom, adresse ou spécialité ;
 *   3. puces de filtre (§3.6) : « Tous », puis une par spécialité présente,
 *      les plus fournies d'abord ;
 *   4. une CARTE AUTONOME par structure (§3.5) : nom, spécialité, adresse,
 *      téléphone, et deux boutons ronds — « Appeler » (`tel:`) et « S'y
 *      rendre », qui ouvre la carte de l'itinéraire DANS l'application
 *      (pages/Itineraire.tsx).
 *
 * Tirer pour rafraîchir. Squelettes tant que rien n'est connu, état vide
 * illustré (§3.10) quand l'annuaire est vide, introuvable ou hors de portée.
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  useIonRouter,
  type RefresherEventDetail,
} from '@ionic/react'
import {
  callOutline,
  cloudOfflineOutline,
  locationOutline,
  medicalOutline,
  navigateOutline,
  searchOutline,
  warningOutline,
} from 'ionicons/icons'
import { useMemo, useState, type ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import BandeauMarque from '../components/BandeauMarque'
import Champ from '../components/Champ'
import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import PucesFiltre, { type Puce } from '../components/PucesFiltre'
import { SqueletteCarte } from '../components/Skeletons'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { Conventionne } from '../types/api'
import { pluriel, telephone as formaterTelephone } from '../utils/format'
import { nomPropre } from '../utils/libelles'
import {
  filtrerConventionnes,
  filtresSpecialites,
  libelleSpecialite,
  lienTelephone,
  nomStructure,
  TOUS,
} from './conventionnes/recherche'
import { useConventionnes } from './conventionnes/useConventionnes'
import './conventionnes/conventionnes.css'

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 5

export default function Conventionnes() {
  const { structures, chargement, erreur, synchroniseLe, rafraichir } = useConventionnes()
  const enLigne = useOnline()
  const [recherche, setRecherche] = useState('')
  const [specialite, setSpecialite] = useState(TOUS)

  const puces = useMemo<Puce[]>(() => {
    if (!structures) return []
    return [
      { cle: TOUS, libelle: 'Tous', nombre: structures.length },
      ...filtresSpecialites(structures).map((f) => ({
        cle: f.code,
        libelle: f.libelle,
        nombre: f.nombre,
      })),
    ]
  }, [structures])

  const trouvees = useMemo(
    () => (structures ? filtrerConventionnes(structures, recherche, specialite) : []),
    [structures, recherche, specialite],
  )

  const avecAnnuaire = structures !== null && structures.length > 0
  // Liste déjà affichée mais dernière synchronisation en échec : on le dit,
  // au lieu de laisser croire que l'annuaire est à jour.
  const serveurInjoignable = structures !== null && erreur !== null && !chargement
  const filtreActif = puces.find((p) => p.cle === specialite)

  function actualiser(evenement: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    void rafraichir().finally(() => evenement.detail.complete())
  }

  function toutAfficher() {
    setRecherche('')
    setSpecialite(TOUS)
  }

  let contenu: ReactNode
  if (structures === null) {
    contenu =
      erreur && !chargement ? (
        <EtatVide
          icone={enLigne ? warningOutline : cloudOfflineOutline}
          teinte={enLigne ? 'annule' : 'neutre'}
          titre={enLigne ? 'Annuaire indisponible' : 'Annuaire indisponible hors ligne'}
          message={
            enLigne
              ? erreur.message
              : 'La liste des structures conventionnées se charge depuis le serveur de l’IPM. Reconnectez-vous pour la consulter.'
          }
          action={{ libelle: 'Réessayer', onClick: () => void rafraichir() }}
        />
      ) : (
        <div className="conventionnes__squelettes">
          {Array.from({ length: SQUELETTES }, (_, i) => (
            <SqueletteCarte key={i} hauteur={96} />
          ))}
        </div>
      )
  } else if (structures.length === 0) {
    contenu = (
      <EtatVide
        icone={medicalOutline}
        titre="Aucune structure conventionnée"
        message="L’annuaire de votre IPM n’en comporte aucune pour l’instant. Rapprochez-vous de l’IPM."
      />
    )
  } else if (trouvees.length === 0) {
    const cherche = recherche.trim()
    contenu = (
      <EtatVide
        icone={searchOutline}
        teinte="neutre"
        titre="Aucune structure trouvée"
        message={
          cherche
            ? `Rien ne correspond à « ${cherche} »${filtreActif && specialite !== TOUS ? ` parmi les ${filtreActif.libelle.toLocaleLowerCase('fr-FR')}` : ''}.`
            : 'Aucune structure dans cette catégorie.'
        }
        action={{ libelle: 'Tout afficher', onClick: toutAfficher, secondaire: true }}
      />
    )
  } else {
    contenu = (
      <section className="ipm-section" aria-label="Structures conventionnées">
        <div className="ipm-entete-section">
          <h2 className="ipm-titre-section" aria-live="polite">
            {trouvees.length === structures.length
              ? pluriel(structures.length, 'structure')
              : `${pluriel(trouvees.length, 'structure')} sur ${structures.length}`}
          </h2>
        </div>
        <div className="ipm-pile">
          {trouvees.map((structure, rang) => (
            <CarteStructure key={structure.code} structure={structure} rang={rang} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <IonPage className="conventionnes">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={actualiser}>
          <IonRefresherContent />
        </IonRefresher>

        <BandeauMarque
          titre="Conventionnés"
          sousTitre="Les structures de santé conventionnées par votre IPM"
        />

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {avecAnnuaire && (
          <>
            <div className="conventionnes__recherche">
              <Champ
                libelle="Rechercher"
                valeur={recherche}
                onChanger={setRecherche}
                placeholder="Nom, adresse ou spécialité"
                icone={searchOutline}
                type="search"
                inputmode="search"
                enterkeyhint="search"
              />
            </div>
            <PucesFiltre
              className="conventionnes__filtres"
              puces={puces}
              active={specialite}
              onChanger={setSpecialite}
              etiquette="Filtrer par spécialité"
            />
          </>
        )}

        {contenu}

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/**
 * Une structure en carte autonome (§3.5). La carte n'est pas touchable dans
 * son ensemble : seuls ses deux boutons ronds le sont, pour qu'un pouce qui
 * lit une adresse ne déclenche jamais un appel par mégarde.
 */
function CarteStructure({ structure, rang }: { structure: Conventionne; rang: number }) {
  const nom = nomStructure(structure)
  const specialite = libelleSpecialite(structure.specialite?.libelle)
  const adresse = nomPropre(structure.adresse)
  const lien = lienTelephone(structure.telephone)
  const numero = formaterTelephone(structure.telephone)
  const routeur = useIonRouter()

  return (
    <CarteListe
      rang={rang}
      titre={nom}
      details={
        <>
          {specialite && <span className="conventionnes__specialite">{specialite}</span>}
          <span className="conventionnes__ligne">
            <IonIcon icon={locationOutline} aria-hidden="true" />
            <span>{adresse || 'Adresse non communiquée'}</span>
          </span>
          <span className="conventionnes__ligne">
            <IonIcon icon={callOutline} aria-hidden="true" />
            <span className={numero ? 'ipm-chiffres' : undefined}>
              {numero || 'Téléphone non communiqué'}
            </span>
          </span>
        </>
      }
      puce={
        <span className="conventionnes__actions">
          {lien && (
            <a
              className="conventionnes__action ipm-cercle--neutre ipm-appui"
              href={lien}
              aria-label={`Appeler ${nom}`}
              onClick={() => haptique.leger()}
            >
              <IonIcon icon={callOutline} aria-hidden="true" />
            </a>
          )}
          {/* La carte de l'itinéraire, dans l'application : la position
                de l'employé, le trajet, le temps — et de là, le guidage. */}
          <button
            type="button"
            className="conventionnes__action conventionnes__action--itineraire ipm-appui"
            aria-label={`S’y rendre : itinéraire vers ${nom}`}
            onClick={() => {
              haptique.leger()
              routeur.push(
                `/conventionnes/${encodeURIComponent(structure.code)}`,
                'forward',
                'push',
              )
            }}
          >
            <IonIcon icon={navigateOutline} aria-hidden="true" />
          </button>
        </span>
      }
    />
  )
}
