/**
 * Détail d'un document (/bons/:id, /bons/optique/:id, /bons/lettres/:id) — SPEC_DESIGN §5.
 *
 *   1. bandeau de marque compact (§3.2) : le numéro du bon, ce que le
 *      pharmacien regarde d'abord, avec le statut et « valable jusqu'au … »
 *      juste en dessous, sur le fond clair ;
 *   2. l'aperçu du PDF officiel dans une carte (rayon --r-lg, ombre-2), rendu
 *      par PdfViewer (Original / Copie) ;
 *   3. les actions en boutons de la charte (§3.7) : « Partager / Imprimer »
 *      et « Télécharger le PDF ».
 *
 * L'écran ne répète pas en cartes ce que le bon porte déjà — bénéficiaire,
 * prescripteur, pharmacie, ordonnance : c'est le PDF officiel, celui que lira
 * le pharmacien, qui fait foi et qui est montré.
 *
 * Le comportement ne change pas : tout reste montrable hors ligne au comptoir
 * de la pharmacie — le bon vient de la liste en cache et le PDF déjà vu est
 * relu dans IndexedDB (pages/bons/useDetailBon.ts).
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  useIonRouter,
  useIonToast,
  type RefresherEventDetail,
} from '@ionic/react'
import {
  checkmarkCircleOutline,
  cloudOfflineOutline,
  documentTextOutline,
  downloadOutline,
  refreshOutline,
  shareOutline,
  warningOutline,
} from 'ionicons/icons'
import { type ReactNode } from 'react'
import type { RouteComponentProps } from 'react-router'

import EnteteEcran from '../components/EnteteEcran'
import { BoutonPrincipal, BoutonSecondaire } from '../components/Boutons'
import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import PdfViewer from '../components/PdfViewer'
import { SqueletteCarte } from '../components/Skeletons'
import StatutBadge from '../components/StatutBadge'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { Bon } from '../types/api'
import { genreDuChemin } from '../utils/documents'
import { dateMoyenne } from '../utils/format'
import { explicationStatut, libelleValidite } from '../utils/statut'
import { typeDocument } from './bons/affichage'
import { nomFichierPdf, partagerPdf, telechargerFichier } from './bons/partage'
import { empreinteImpression, lireIdentifiant, useDetailBon, usePdfBon } from './bons/useDetailBon'
import './bons/DetailBon.css'

export type DetailBonProps = RouteComponentProps<{ id: string }>

/** Le PDF officiel a deux pages, comme le document imprimé par l'IPM : l'original et sa copie. */
const PAGES_DU_BON = ['Original', 'Copie']

export default function DetailBon({ match, location }: DetailBonProps) {
  // Par prudence, l'identifiant se relit aussi dans l'URL : un match sans
  // paramètres (route par défaut d'Ionic) ne doit pas donner « introuvable ».
  const id = lireIdentifiant(
    match.params.id ??
      /^\/bons\/(?:lettres\/|optique\/)?(\d+)\/?$/.exec(location?.pathname ?? '')?.[1],
  )
  // Le genre se lit dans le chemin (/bons, /bons/optique, /bons/lettres) : c'est lui qui dit à
  // quelle liste de l'API l'identifiant appartient.
  const genre = genreDuChemin(match.path) ?? genreDuChemin(location?.pathname) ?? 'bon-pharmacie'
  const { bon, erreur, introuvable, recharger } = useDetailBon(genre, id)
  // Bon modifié par l'IPM depuis la mise en cache du PDF, même lors d'une
  // visite précédente : l'empreinte enregistrée avec le PDF ne correspond
  // plus, et usePdfBon le retélécharge.
  // Un bon en attente de l'IPM ne s'imprime pas encore : rien à télécharger.
  const enAttente = bon?.statut === 'attente'
  const apercu = usePdfBon(genre, enAttente ? null : id, bon ? empreinteImpression(bon) : null)
  const enLigne = useOnline()
  const routeur = useIonRouter()
  const [presenterToast] = useIonToast()

  function toast(message: string, icone: string) {
    void presenterToast({ message, duration: 2500, position: 'top', icon: icone })
  }

  async function partager() {
    if (!apercu.pdf || !bon) return
    haptique.leger()
    // Aucun await avant partagerPdf : Safari exige que le partage suive
    // immédiatement le toucher.
    const resultat = await partagerPdf(apercu.pdf, bon)
    if (resultat === 'telecharge') {
      toast('Partage indisponible sur ce navigateur : le PDF a été téléchargé.', downloadOutline)
    }
  }

  function telecharger() {
    if (!apercu.pdf || !bon) return
    telechargerFichier(apercu.pdf, nomFichierPdf(bon))
    haptique.succes()
    toast('PDF téléchargé.', checkmarkCircleOutline)
  }

  async function surRafraichir(e: CustomEvent<RefresherEventDetail>) {
    haptique.leger()
    await Promise.all([recharger(), apercu.pdf ? Promise.resolve() : apercu.recharger()])
    e.detail.complete()
  }

  /** Retour à la liste, même quand le détail a été ouvert par un lien direct. */
  function retour() {
    if (routeur.canGoBack()) routeur.goBack()
    else routeur.push('/bons', 'back', 'pop')
  }

  const partageable = Boolean(apercu.pdf && bon)
  const type = typeDocument({ genre })
  const lettre = genre === 'lettre-garantie'

  let contenu: ReactNode
  if (introuvable) {
    contenu = (
      <EtatVide
        icone={documentTextOutline}
        teinte="neutre"
        titre={lettre ? 'Lettre introuvable' : 'Bon introuvable'}
        message={
          lettre
            ? 'Cette lettre n’existe pas ou n’est plus rattachée à votre dossier.'
            : 'Ce bon n’existe pas ou n’est plus rattaché à votre dossier.'
        }
        action={{ libelle: 'Mes bons', onClick: retour, secondaire: true }}
      />
    )
  } else if (!bon) {
    contenu = erreur ? (
      <EtatVide
        icone={enLigne ? warningOutline : cloudOfflineOutline}
        teinte="annule"
        titre={lettre ? 'Impossible d’afficher cette lettre' : 'Impossible d’afficher ce bon'}
        message={erreur.message}
        action={{ libelle: 'Réessayer', onClick: () => void recharger(), icone: refreshOutline }}
      />
    ) : (
      <div className="detail-bon__attente">
        <SqueletteCarte hauteur={320} />
        <SqueletteCarte hauteur={96} />
        <SqueletteCarte hauteur={96} />
      </div>
    )
  } else {
    contenu = (
      <>
        <Validite bon={bon} />
        <p className="detail-bon__explication">{explicationStatut(bon.statut, genre)}</p>

        <div className="ipm-carte detail-bon__apercu">
          {enAttente ? (
            <div className="detail-bon__apercu-attente">
              <span>Le bon s’affichera ici dès que l’IPM l’aura accordé.</span>
            </div>
          ) : apercu.pdf ? (
            <PdfViewer
              pdf={apercu.pdf}
              libellesPages={PAGES_DU_BON}
              titre={`${type.libelle} ${bon.code}`}
            />
          ) : apercu.erreur && !apercu.chargement ? (
            <ApercuIndisponible
              horsLigne={!enLigne || apercu.erreur.genre === 'reseau'}
              lettre={lettre}
              message={apercu.erreur.message}
              onReessayer={() => void apercu.recharger()}
            />
          ) : (
            <div className="detail-bon__apercu-attente" aria-busy="true">
              <IonSpinner name="crescent" aria-hidden="true" />
              <span>{lettre ? 'Préparation de la lettre…' : 'Préparation du bon…'}</span>
            </div>
          )}
        </div>

        <div className="detail-bon__actions">
          <BoutonPrincipal
            disabled={!partageable}
            icone={shareOutline}
            onClick={() => void partager()}
          >
            Partager / Imprimer
          </BoutonPrincipal>
          <BoutonSecondaire disabled={!partageable} icone={downloadOutline} onClick={telecharger}>
            Télécharger le PDF
          </BoutonSecondaire>
        </div>
      </>
    )
  }

  return (
    <IonPage className="detail-bon">
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={surRafraichir} disabled={introuvable}>
          <IonRefresherContent />
        </IonRefresher>

        {/* En-tête d'app mobile : flèche retour Material + le numéro du bon,
            lisible à bout de bras au comptoir (§5). Le statut et la validité
            viennent juste en dessous. */}
        <EnteteEcran
          titre={
            bon ? (
              <span className="detail-bon__numero ipm-chiffres selectionnable">{bon.code}</span>
            ) : (
              type.libelle
            )
          }
          sousTitre={type.libelle}
          onRetour={retour}
        />

        <OfflineBanner />
        {contenu}

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/** Puce de statut et « valable jusqu'au … », posées sur le bandeau rouge. */
function Validite({ bon }: { bon: Bon }) {
  const reste = libelleValidite(bon.statut, bon.valableJusquAu)
  const jusquau = dateMoyenne(bon.valableJusquAu)
  const libelle =
    bon.statut === 'expire' ? `Était valable jusqu’au ${jusquau}` : `Valable jusqu’au ${jusquau}`
  return (
    <div className="detail-bon__validite">
      <StatutBadge statut={bon.statut} icone />
      <span className="detail-bon__jusquau">
        {libelle}
        {reste && <strong className="detail-bon__reste"> · {reste}</strong>}
      </span>
    </div>
  )
}

function ApercuIndisponible({
  horsLigne,
  lettre,
  message,
  onReessayer,
}: {
  horsLigne: boolean
  lettre: boolean
  message: string
  onReessayer: () => void
}) {
  return (
    <div className="detail-bon__apercu-erreur" role="status">
      <IonIcon icon={horsLigne ? cloudOfflineOutline : warningOutline} aria-hidden="true" />
      <p className="detail-bon__apercu-titre">
        {horsLigne ? 'Aperçu indisponible hors ligne' : 'Aperçu indisponible'}
      </p>
      <p>
        {horsLigne
          ? `${lettre ? 'Cette lettre n’a' : 'Ce bon n’a'} pas encore été ${lettre ? 'ouverte' : 'ouvert'} sur ce téléphone. Il s’affichera dès le retour du réseau.`
          : message}
      </p>
      <BoutonSecondaire compact icone={refreshOutline} onClick={onReessayer}>
        Réessayer
      </BoutonSecondaire>
    </div>
  )
}
