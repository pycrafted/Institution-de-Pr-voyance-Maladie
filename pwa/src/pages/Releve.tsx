/**
 * Écran « Mon relevé » (onglet /releve) — le compte IPM de l'agent, en clair.
 *
 * Quand un agent se soigne, l'IPM règle le prestataire en entier, puis répartit
 * la facture : la part IPM (ce qu'elle prend en charge) et la part de l'agent
 * (ce qui lui reste à charge). Cette part se rembourse par des retenues sur
 * salaire. L'écran montre les mouvements en trois vues, sans jargon comptable
 * (le solde restant, lui, est affiché sur l'accueil) :
 *
 *   1. « Retenues » - ce qui a été prélevé sur le salaire, mois par mois ;
 *   2. « Remboursements » - ce que l'IPM a rendu à l'agent (frais avancés) ;
 *   3. « Soins » - pour chaque bon, ce que l'IPM a payé et la part de l'agent
 *      (le bon s'ouvre au clic).
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
import { cashOutline, cloudOfflineOutline, medkitOutline, warningOutline } from 'ionicons/icons'
import { useState, type ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import { SqueletteCarte } from '../components/Skeletons'
import BarreActions from '../components/BarreActions'
import { chargerCompte, etatCompte, useCompte } from '../data/compte'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { MouvementMensuel, Soin } from '../types/api'
import { cheminDocument } from '../utils/documents'
import { dateMoyenne, moisAnnee, montant } from '../utils/format'
import { typeDocument } from './bons/affichage'
import './releve/Releve.css'

/** Au retour sur l'onglet, le relevé est resynchronisé s'il a plus d'une minute. */
const FRAICHEUR_MS = 60_000

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 4

type Vue = 'retenues' | 'remboursements' | 'soins'

/** Les trois onglets du relevé, libellés courts pour tenir sur une ligne. */
const ONGLETS: readonly { cle: Vue; libelle: string }[] = [
  { cle: 'retenues', libelle: 'Retenues' },
  { cle: 'remboursements', libelle: 'Remboursements' },
  { cle: 'soins', libelle: 'Soins' },
]

export default function Releve() {
  const { releve, chargement, erreur, depuisCache, synchroniseLe, rafraichir } = useCompte()
  const enLigne = useOnline()
  const [presenterToast] = useIonToast()
  // Trois vues distinctes : ce qui est coupé sur la paie, ce que l'IPM a
  // rendu, et les soins consommés.
  const [vue, setVue] = useState<Vue>('retenues')

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
          titre="Impossible d’afficher votre relevé"
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
    // Plus de carte du solde ici : il est affiché sur l'accueil. L'écran
    // s'ouvre directement sur les trois vues (chacune dit si elle est vide).
    contenu = (
      <>
        {/* Trois vues distinctes : retenues sur salaire, remboursements reçus, soins. */}
        <div className="releve-onglets" role="tablist" aria-label="Vue du relevé">
          {ONGLETS.map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              role="tab"
              aria-selected={vue === onglet.cle}
              className={`releve-onglet${vue === onglet.cle ? ' releve-onglet--actif' : ''}`}
              onClick={() => {
                haptique.leger()
                setVue(onglet.cle)
              }}
            >
              {onglet.libelle}
            </button>
          ))}
        </div>

        {vue === 'retenues' && (
          <section className="ipm-section releve-bloc" aria-label="Retenues sur salaire">
            <div className="ipm-entete-section">
              <h2 className="ipm-titre-section">
                Ce qui a été prélevé sur votre salaire, mois par mois.
              </h2>
            </div>
            {releve.retenues.length > 0 ? (
              <>
                <div className="ipm-pile">
                  {releve.retenues.map((retenue, rang) => (
                    <CarteMois
                      key={`ret-${retenue.id}`}
                      mouvement={retenue}
                      rang={rang}
                      sens="retenue"
                    />
                  ))}
                </div>
              </>
            ) : (
              <EtatVide
                icone={cashOutline}
                teinte="neutre"
                compact
                titre="Aucune retenue pour l’instant"
                message="Les prélèvements faits sur votre salaire apparaîtront ici."
              />
            )}
          </section>
        )}

        {vue === 'remboursements' && (
          <section className="ipm-section releve-bloc" aria-label="Remboursements reçus">
            <div className="ipm-entete-section">
              <h2 className="ipm-titre-section">
                Ce que l’IPM vous a remboursé (frais que vous aviez avancés).
              </h2>
            </div>
            {releve.remboursements.length > 0 ? (
              <>
                <div className="ipm-pile">
                  {releve.remboursements.map((remb, rang) => (
                    <CarteMois
                      key={`rmb-${remb.id}`}
                      mouvement={remb}
                      rang={rang}
                      sens="remboursement"
                    />
                  ))}
                </div>
              </>
            ) : (
              <EtatVide
                icone={cashOutline}
                teinte="neutre"
                compact
                titre="Aucun remboursement pour l’instant"
                message="Les frais que l’IPM vous rembourse apparaîtront ici."
              />
            )}
          </section>
        )}

        {vue === 'soins' && (
          <section className="ipm-section releve-bloc" aria-label="Vos soins">
            <div className="ipm-entete-section">
              <h2 className="ipm-titre-section">
                Votre part et ce que l’IPM a pris en charge, par bon.
              </h2>
            </div>
            {releve.soins.length > 0 ? (
              <div className="ipm-pile">
                {releve.soins.map((soin, rang) => (
                  <CarteSoin key={`soin-${soin.id}`} soin={soin} rang={rang} />
                ))}
              </div>
            ) : (
              <EtatVide
                icone={medkitOutline}
                teinte="neutre"
                compact
                titre="Aucun soin pour l’instant"
              />
            )}
          </section>
        )}
      </>
    )
  }

  return (
    <IonPage className="mon-releve">
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
 * Un soin en carte autonome (§3.5) : ce que l'IPM a pris en charge et la part
 * de l'agent (en vedette à droite). Si le bon est un document de l'agent, la
 * carte s'ouvre sur son détail.
 */
function CarteSoin({ soin, rang }: { soin: Soin; rang: number }) {
  const type = soin.document ? typeDocument(soin.document) : null
  const titre = type ? type.libelle : 'Frais médicaux'
  const chemin = soin.document ? cheminDocument(soin.document) : undefined

  return (
    <CarteListe
      rang={rang}
      routerLink={chemin}
      icone={type ? type.icone : medkitOutline}
      teinte="rouge"
      titre={titre}
      details={
        <>
          {soin.numeroBon && <span>{soin.numeroBon}</span>}
          <span>{dateMoyenne(soin.date)}</span>
        </>
      }
      // Les deux parts côte à côte, à droite de la ligne : la mienne et celle de l'IPM.
      puce={
        <span className="releve-parts">
          <span className="releve-part">
            <span className="releve-part__libelle">Ma part</span>
            <span className="releve-part__montant releve-montant--charge">
              {montant(soin.partAgent)}
            </span>
          </span>
          <span className="releve-part">
            <span className="releve-part__libelle">Part IPM</span>
            <span className="releve-part__montant releve-ipm">{montant(soin.partIpm)}</span>
          </span>
        </span>
      }
      // Pas de flèche : elle décalait les colonnes des parts d'une ligne à
      // l'autre. La ligne d'un bon reste cliquable.
      chevron={false}
      etiquette={`${titre}, ${dateMoyenne(soin.date)}, votre part ${montant(
        soin.partAgent,
      )}, part IPM ${montant(soin.partIpm)}${chemin ? ', voir le bon' : ''}`}
    />
  )
}

/**
 * Un mouvement d'un mois : une retenue sur salaire (ce qui a été coupé sur la
 * paie ce mois-là) ou un remboursement reçu. Le mois en titre, le montant à
 * droite. Jamais cliquable (ce n'est pas un document).
 */
function CarteMois({
  mouvement,
  rang,
  sens,
}: {
  mouvement: MouvementMensuel
  rang: number
  sens: 'retenue' | 'remboursement'
}) {
  const estRetenue = sens === 'retenue'
  const mois = moisAnnee(mouvement.date)
  // Une retenue retire de la paie (−), un remboursement rend de l'argent (+).
  const signe = estRetenue ? '- ' : '+ '
  const meta = estRetenue ? 'retenu sur salaire' : 'remboursé'

  return (
    <CarteListe
      rang={rang}
      icone={cashOutline}
      teinte={estRetenue ? 'attente' : 'valide'}
      titre={mois ? mois.charAt(0).toUpperCase() + mois.slice(1) : 'Mois inconnu'}
      details={estRetenue ? 'Prélevé sur votre salaire' : 'Versé par l’IPM'}
      etiquette={`${mois}, ${meta} ${montant(mouvement.montant)}`}
      puce={
        <span className={`releve-montant releve-montant--${sens}`}>
          {signe}
          {montant(mouvement.montant)}
        </span>
      }
      meta={meta}
    />
  )
}
