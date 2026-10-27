/**
 * Écran « Mes bons » (onglet /bons) — SPEC_DESIGN §5.
 *
 * Tous les documents du participant, y compris ceux émis par l'IPM, de haut
 * en bas :
 *
 *   1. bandeau de marque compact (§3.2), à la place de la toolbar Ionic au
 *      gros titre noir sur fond gris, interdite par §1 ;
 *   2. menu déroulant des TYPES de document (bons de pharmacie, lettres de
 *      garantie), avec leur compte, qui remplacent l'ion-segment
 *      rectangulaire, lui aussi interdit ;
 *   3. les documents en cartes autonomes (§3.5), groupées par mois : chaque
 *      carte porte le TYPE de document, son numéro, le bénéficiaire, la
 *      pharmacie et son statut — et jamais un filet gris entre deux lignes.
 *
 * Tirer pour rafraîchir, et disponible hors ligne (useBons affiche la
 * dernière liste en cache avant la réponse du serveur).
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  useIonToast,
  useIonViewDidEnter,
  type RefresherEventDetail,
} from '@ionic/react'
import {
  add,
  chevronDown,
  cloudOfflineOutline,
  documentTextOutline,
  warningOutline,
} from 'ionicons/icons'
import { useMemo, useState, type ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import EtatVide from '../components/EtatVide'
import { useNouveauBon } from '../components/NouveauBonModal'
import OfflineBanner from '../components/OfflineBanner'
import { SqueletteCarte } from '../components/Skeletons'
import StatutBadge from '../components/StatutBadge'
import { chargerBons, etatBons, useBons } from '../data/bons'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { Bon } from '../types/api'
import { dateRelative, pluriel } from '../utils/format'
import { nomPropre } from '../utils/libelles'
import { joursRestants, libelleValidite, STATUTS } from '../utils/statut'
import { cheminDocument, cleDocument } from '../utils/documents'
import { documentParCle } from '../services/catalogue'
import { libelleBeneficiaire, structureDuDocument, typeDocument } from './bons/affichage'
import {
  compterParType,
  estFiltreType,
  FILTRES,
  filtrerBons,
  type FiltreType,
} from './bons/filtrage'
import './bons/MesBons.css'

/** Au retour sur l'onglet, la liste est resynchronisée si elle a plus d'une minute. */
const FRAICHEUR_MS = 60_000

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 4

/** Le nom de la catégorie : « Bons de pharmacie », « Lettres de garantie ». */
function libelleFiltre(filtre: FiltreType): string {
  return documentParCle(filtre)?.libellePluriel ?? filtre
}

export default function MesBons() {
  const { bons, chargement, erreur, depuisCache, synchroniseLe, rafraichir } = useBons()
  const { ouvrirNouveauBon } = useNouveauBon()
  const enLigne = useOnline()
  const [filtre, setFiltre] = useState<FiltreType>('tous')
  const [presenterToast] = useIonToast()

  const visibles = useMemo(() => (bons ? filtrerBons(bons, filtre, '') : []), [bons, filtre])
  const comptes = useMemo(() => compterParType(bons ?? []), [bons])
  // Une entrée par type réellement présent : proposer « Lettres de garantie
  // (0) » à qui n'en a aucune n'aide personne.
  const categories = useMemo(
    () =>
      FILTRES.filter((f) => f === 'tous' || comptes[f] > 0).map((f) => ({
        cle: f,
        libelle: f === 'tous' ? 'Tous les documents' : libelleFiltre(f),
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
        icone={documentTextOutline}
        teinte="neutre"
        titre="Aucun document trouvé"
        message={messageSansResultat(filtre)}
        action={{ libelle: 'Tous les documents', onClick: toutAfficher, secondaire: true }}
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

        {/* Pas d'en-tête : l'écran commence par sa recherche et ses puces.
            On ne garde que l'espace de la zone sûre (encoche du téléphone). */}
        <div className="ipm-zone-sure" />

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {avecDocuments && (
          /* Un menu déroulant plutôt qu'un champ de recherche et une rangée de
             puces, comme sur l'annuaire des conventionnés : l'employé range
             ses documents par TYPE (« mes lettres de garantie »), il ne les
             cherche pas par numéro. Le statut, lui, se lit sur chaque carte
             et change tout seul : il ne fait pas une catégorie. Un `select`
             natif ouvre le sélecteur du téléphone. */
          <div className="ipm-menu-categorie">
            {/* Pas de libellé visible au-dessus du menu : le choix affiché
                (« Tous les documents », « Bons de pharmacie »…) se suffit. Le nom
                reste porté pour les lecteurs d'écran. */}
            <div className="ipm-menu-categorie__cadre">
              <select
                id="bons-categorie"
                className="ipm-menu-categorie__choix"
                aria-label="Type de document"
                value={filtre}
                onChange={(e) => {
                  haptique.leger()
                  if (estFiltreType(e.target.value)) setFiltre(e.target.value)
                }}
              >
                {categories.map((categorie) => (
                  <option key={categorie.cle} value={categorie.cle}>
                    {categorie.libelle}
                  </option>
                ))}
              </select>
              <IonIcon
                className="ipm-menu-categorie__chevron"
                icon={chevronDown}
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {contenu}

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/**
 * « pas encore de » plutôt que « aucun » : la tournure vaut pour un bon
 * comme pour une lettre, sans avoir à porter le genre de chaque type.
 */
function messageSansResultat(filtre: FiltreType): string {
  if (filtre === 'tous') return 'Vous n’avez aucun document.'
  const type = documentParCle(filtre)?.libelle.toLocaleLowerCase('fr-FR')
  return `Vous n’avez pas encore de ${type}.`
}

/**
 * Un document en carte autonome (§3.5) : son type, son numéro, pour qui et
 * où se présenter (pharmacie ou prestataire), avec sa puce de statut et sa
 * date.
 */
/** En deçà, la carte rappelle le délai restant (« Expire demain »). */
const JOURS_ALERTE = 7

function CarteDocument({ bon, rang }: { bon: Bon; rang: number }) {
  const type = typeDocument(bon)
  const validite = libelleValidite(bon.statut, bon.valableJusquAu)
  // Le délai ne s'affiche que s'il reste une semaine ou moins.
  const reste = joursRestants(bon.statut, bon.valableJusquAu)
  const bientotExpire = reste !== null && reste <= JOURS_ALERTE
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
      // Trois informations, pas huit : pour qui, où, et le délai seulement
      // quand il presse. Le numéro, le lien de parenté et la validité complète
      // restent dans le détail - et la recherche trouve toujours un numéro.
      details={
        <>
          <span>{nomPropre(bon.beneficiaire?.nomComplet) || 'Bénéficiaire inconnu'}</span>
          {(structure || bientotExpire) && (
            <span>
              {structure}
              {bientotExpire && (
                <span className="mes-documents__validite">
                  {structure ? ' · ' : ''}
                  {validite}
                </span>
              )}
            </span>
          )}
        </>
      }
      puce={<StatutBadge statut={bon.statut} />}
      meta={dateRelative(bon.date)}
    />
  )
}
