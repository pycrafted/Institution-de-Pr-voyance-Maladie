/**
 * Écran « Mes bons » (onglet /bons) — SPEC_DESIGN §5.
 *
 * Tous les documents du participant, y compris ceux émis par l'IPM, de haut
 * en bas :
 *
 *   1. bandeau de marque compact (§3.2), à la place de la toolbar Ionic au
 *      gros titre noir sur fond gris, interdite par §1 ;
 *   2. champ de recherche (§3.8) et puces de filtre défilantes (§3.6), qui
 *      remplacent l'ion-segment rectangulaire, lui aussi interdit ;
 *   3. les documents en cartes autonomes (§3.5), groupées par mois : chaque
 *      carte porte le TYPE de document, son numéro, le bénéficiaire, la
 *      pharmacie et son statut — et jamais un filet gris entre deux lignes.
 *
 * Tirer pour rafraîchir, et disponible hors ligne (useBons affiche la
 * dernière liste en cache avant la réponse du serveur).
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
import {
  add,
  cloudOfflineOutline,
  documentTextOutline,
  searchOutline,
  warningOutline,
} from 'ionicons/icons'
import { useMemo, useState, type ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import BandeauMarque from '../components/BandeauMarque'
import Champ from '../components/Champ'
import EtatVide from '../components/EtatVide'
import { useNouveauBon } from '../components/NouveauBonModal'
import OfflineBanner from '../components/OfflineBanner'
import PucesFiltre, { type Puce } from '../components/PucesFiltre'
import { SqueletteCarte } from '../components/Skeletons'
import StatutBadge from '../components/StatutBadge'
import { chargerBons, etatBons, useBons } from '../data/bons'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { Bon } from '../types/api'
import { dateRelative, pluriel } from '../utils/format'
import { libelleValidite, STATUTS } from '../utils/statut'
import { cheminDocument, cleDocument } from '../utils/documents'
import { libelleBeneficiaire, structureDuDocument, typeDocument } from './bons/affichage'
import {
  compterParStatut,
  estFiltreStatut,
  FILTRES,
  filtrerBons,
  type FiltreStatut,
} from './bons/filtrage'
import './bons/MesBons.css'

/** Au retour sur l'onglet, la liste est resynchronisée si elle a plus d'une minute. */
const FRAICHEUR_MS = 60_000

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 4

function libelleFiltre(filtre: FiltreStatut): string {
  return filtre === 'tous' ? 'Tous' : STATUTS[filtre].libellePluriel
}

export default function MesBons() {
  const { bons, chargement, erreur, depuisCache, synchroniseLe, rafraichir } = useBons()
  const { ouvrirNouveauBon } = useNouveauBon()
  const enLigne = useOnline()
  const [filtre, setFiltre] = useState<FiltreStatut>('tous')
  const [recherche, setRecherche] = useState('')
  const [presenterToast] = useIonToast()

  const visibles = useMemo(
    () => (bons ? filtrerBons(bons, filtre, recherche) : []),
    [bons, filtre, recherche],
  )
  const comptes = useMemo(() => compterParStatut(bons ?? []), [bons])
  // Une puce par statut réellement présent : afficher « Annulés 0 » n'aide
  // personne et allonge une rangée qui doit tenir sous le pouce.
  const puces = useMemo<Puce[]>(
    () =>
      FILTRES.filter((f) => f === 'tous' || comptes[f] > 0).map((f) => ({
        cle: f,
        libelle: libelleFiltre(f),
        nombre: comptes[f],
      })),
    [comptes],
  )

  // Lu dans le magasin (et non par fermeture) : Ionic n'enregistre ce
  // rappel qu'une fois.
  useIonViewDidEnter(() => {
    const { synchroniseLe: le, chargement: enCours } = etatBons()
    const age = le ? Date.now() - Date.parse(le) : Number.POSITIVE_INFINITY
    if (!enCours && age > FRAICHEUR_MS) void chargerBons()
  })

  async function surRafraichir(e: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    await rafraichir()
    e.detail.complete()
    const echec = etatBons().erreur
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

  function toutAfficher() {
    setFiltre('tous')
    setRecherche('')
  }

  // Liste venue du cache parce que le serveur ne répond pas (en ligne).
  const serveurInjoignable = depuisCache && erreur !== null && !chargement
  const avecDocuments = bons !== null && bons.length > 0

  let contenu: ReactNode
  if (bons === null) {
    contenu =
      erreur && !chargement ? (
        <EtatVide
          icone={enLigne ? warningOutline : cloudOfflineOutline}
          teinte="annule"
          titre="Impossible d’afficher vos documents"
          message={erreur.message}
          action={{ libelle: 'Réessayer', onClick: () => void rafraichir() }}
        />
      ) : (
        <div className="mes-documents__squelettes">
          {Array.from({ length: SQUELETTES }, (_, i) => (
            <SqueletteCarte key={i} hauteur={104} />
          ))}
        </div>
      )
  } else if (bons.length === 0) {
    contenu = (
      <EtatVide
        icone={documentTextOutline}
        titre="Aucun document pour l’instant"
        message="Vos bons de pharmacie et lettres de garantie, demandés depuis ce téléphone ou émis par l’IPM, apparaîtront ici."
        action={
          enLigne ? { libelle: 'Nouveau bon', onClick: ouvrirNouveauBon, icone: add } : undefined
        }
      />
    )
  } else if (visibles.length === 0) {
    contenu = (
      <EtatVide
        icone={searchOutline}
        teinte="neutre"
        titre="Aucun document trouvé"
        message={messageSansResultat(filtre, recherche)}
        action={{ libelle: 'Tout afficher', onClick: toutAfficher, secondaire: true }}
      />
    )
  } else {
    contenu = (
      <>
        {/* Une seule liste, du plus récent au plus ancien : les
            intercalaires par mois coupaient la lecture sans rien apprendre,
            la date de chaque document est déjà sur sa carte. */}
        <section className="ipm-section" aria-label="Vos documents">
          <div className="ipm-pile">
            {visibles.map((bon, rang) => (
              <CarteDocument key={cleDocument(bon)} bon={bon} rang={rang} />
            ))}
          </div>
        </section>
        <p className="mes-documents__total" aria-live="polite">
          {visibles.length === bons.length
            ? pluriel(bons.length, 'document')
            : `${pluriel(visibles.length, 'document')} sur ${bons.length}`}
        </p>
      </>
    )
  }

  return (
    <IonPage className="mes-documents">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={surRafraichir}>
          <IonRefresherContent />
        </IonRefresher>

        <BandeauMarque
          titre="Mes bons"
          // Ce que l'écran contient, et non un compte : le nombre est déjà
          // sur les puces de filtre et au bas de la liste.
          sousTitre="Vos bons de pharmacie et vos lettres de garantie"
        />

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {avecDocuments && (
          <>
            <div className="mes-documents__recherche">
              <Champ
                libelle="Rechercher"
                valeur={recherche}
                onChanger={setRecherche}
                placeholder="Numéro, bénéficiaire, structure"
                icone={searchOutline}
                type="search"
                inputmode="search"
                enterkeyhint="search"
              />
            </div>
            <PucesFiltre
              className="mes-documents__filtres"
              puces={puces}
              active={filtre}
              etiquette="Filtrer par statut"
              onChanger={(cle) => {
                if (estFiltreStatut(cle)) setFiltre(cle)
              }}
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

function messageSansResultat(filtre: FiltreStatut, recherche: string): string {
  const statut = filtre === 'tous' ? '' : ` ${STATUTS[filtre].libelle.toLocaleLowerCase('fr-FR')}`
  if (recherche.trim()) return `Aucun document${statut} ne correspond à « ${recherche.trim()} ».`
  return `Vous n’avez aucun document${statut}.`
}

/**
 * Un document en carte autonome (§3.5) : son type, son numéro, pour qui et
 * où se présenter (pharmacie ou prestataire), avec sa puce de statut et sa
 * date.
 */
function CarteDocument({ bon, rang }: { bon: Bon; rang: number }) {
  const type = typeDocument(bon)
  const validite = libelleValidite(bon.statut, bon.valableJusquAu)
  const structure = structureDuDocument(bon)
  // Le lecteur d'écran annonce la carte d'un trait, sans le « N° » ni les
  // points médians, qui ne veulent rien dire à l'oreille.
  return (
    <CarteListe
      rang={rang}
      routerLink={cheminDocument(bon)}
      teinte={bon.statut}
      titre={type.libelle}
      etiquette={[
        `${type.libelle} ${bon.code}`,
        STATUTS[bon.statut].libelle,
        libelleBeneficiaire(bon),
        structure,
        validite,
        dateRelative(bon.date),
      ]
        .filter(Boolean)
        .join(', ')}
      details={
        <>
          <span>
            {'N° '}
            <span className="ipm-chiffres">{bon.code}</span>
            {` · ${libelleBeneficiaire(bon)}`}
          </span>
          <span>
            {structure || 'Structure non précisée'}
            {validite && <span className="mes-documents__validite"> · {validite}</span>}
          </span>
        </>
      }
      puce={<StatutBadge statut={bon.statut} />}
      meta={dateRelative(bon.date)}
    />
  )
}
