/**
 * Écran « Mon relevé » (onglet /releve) — le compte IPM de l'agent, en clair.
 *
 * Quand un agent se soigne, l'IPM règle le prestataire en entier, puis répartit
 * la facture : la part IPM (ce qu'elle prend en charge) et la part de l'agent
 * (ce qui lui reste à charge). Cette part se rembourse par des retenues sur
 * salaire. L'écran répond à deux questions, sans jargon comptable :
 *
 *   1. le bandeau en vedette - ce qui reste à payer à l'IPM, avec ce qu'elle a
 *      pris en charge et ce qui a déjà été remboursé ;
 *   2. « Vos soins » - pour chaque bon, ce que l'IPM a payé et la part de
 *      l'agent (le bon s'ouvre au clic) ;
 *   3. « Vos remboursements » - les retenues faites sur le salaire, mois par mois.
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
import {
  cashOutline,
  cloudOfflineOutline,
  medkitOutline,
  walletOutline,
  warningOutline,
} from 'ionicons/icons'
import { useState, type ReactNode } from 'react'

import CarteListe from '../components/CarteListe'
import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import { SqueletteCarte } from '../components/Skeletons'
import { chargerCompte, etatCompte, useCompte } from '../data/compte'
import { haptique } from '../hooks/haptique'
import { useOnline } from '../hooks/useOnline'
import type { MouvementMensuel, Soin } from '../types/api'
import { cheminDocument } from '../utils/documents'
import { dateMoyenne, moisAnnee, montant, pluriel } from '../utils/format'
import { typeDocument } from './bons/affichage'
import './releve/Releve.css'

/** Au retour sur l'onglet, le relevé est resynchronisé s'il a plus d'une minute. */
const FRAICHEUR_MS = 60_000

/** Nombre de squelettes affichés tant que rien n'est connu. */
const SQUELETTES = 4

export default function Releve() {
  const { releve, chargement, erreur, depuisCache, synchroniseLe, rafraichir } = useCompte()
  const enLigne = useOnline()
  const [presenterToast] = useIonToast()
  // Deux vues distinctes : ce qui est coupé sur la paie, et les soins consommés.
  const [vue, setVue] = useState<'retenues' | 'soins'>('retenues')

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
  } else if (
    releve.soins.length === 0 &&
    releve.retenues.length === 0 &&
    releve.remboursements.length === 0
  ) {
    contenu = (
      <>
        <BandeauSolde
          solde={releve.solde}
          totalPartIpm={releve.totalPartIpm}
          totalRetenu={releve.totalRetenu}
        />
        <EtatVide
          icone={walletOutline}
          teinte="valide"
          compact
          titre="Aucun mouvement pour l’instant"
          message="Vos soins pris en charge par l’IPM et les retenues faites sur votre salaire apparaîtront ici."
        />
      </>
    )
  } else {
    contenu = (
      <>
        <BandeauSolde
          solde={releve.solde}
          totalPartIpm={releve.totalPartIpm}
          totalRetenu={releve.totalRetenu}
        />

        {/* Deux vues distinctes : « Retenues sur salaire » et « Vos soins ». */}
        <div className="releve-onglets" role="tablist" aria-label="Vue du relevé">
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'retenues'}
            className={`releve-onglet${vue === 'retenues' ? ' releve-onglet--actif' : ''}`}
            onClick={() => {
              haptique.leger()
              setVue('retenues')
            }}
          >
            Retenues sur salaire
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'soins'}
            className={`releve-onglet${vue === 'soins' ? ' releve-onglet--actif' : ''}`}
            onClick={() => {
              haptique.leger()
              setVue('soins')
            }}
          >
            Vos soins
          </button>
        </div>

        {vue === 'retenues' ? (
          <>
            <section className="ipm-section releve-bloc" aria-label="Retenues sur salaire">
              <p className="releve-sous-titre">
                Ce qui a été prélevé sur votre salaire, mois par mois.
              </p>
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
                  <p className="releve-total" aria-live="polite">
                    {pluriel(releve.retenues.length, 'mois')} · {montant(releve.totalRetenu)} au total
                  </p>
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

            {releve.remboursements.length > 0 && (
              <section className="ipm-section releve-bloc" aria-label="Remboursements reçus">
                <h2 className="releve-titre">Remboursements reçus</h2>
                <p className="releve-sous-titre">
                  Ce que l’IPM vous a remboursé (frais que vous aviez avancés).
                </p>
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
              </section>
            )}
          </>
        ) : (
          <section className="ipm-section releve-bloc" aria-label="Vos soins">
            <p className="releve-sous-titre">
              Votre part et ce que l’IPM a pris en charge, par bon.
            </p>
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
        <div className="ipm-zone-sure" />

        <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />

        {contenu}

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/**
 * Le bandeau en vedette : ce qui reste à payer, et - en dessous - ce que l'IPM
 * a pris en charge et ce qui a été retenu sur le salaire. Trois états de solde :
 * une dette (rouge), un compte à jour (vert), ou une avance en faveur de l'agent.
 */
function BandeauSolde({
  solde,
  totalPartIpm,
  totalRetenu,
}: {
  solde: number
  totalPartIpm: number
  totalRetenu: number
}) {
  let classe = 'releve-solde--ajour'
  let intitule = 'Compte à jour'
  let affiche = montant(0)
  let note = 'Vous ne devez rien à l’IPM.'

  if (solde > 0) {
    classe = 'releve-solde--du'
    intitule = 'Reste à payer'
    affiche = montant(solde)
    note = 'Votre part des soins, moins ce qui a déjà été retenu sur votre salaire.'
  } else if (solde < 0) {
    intitule = 'Avance en votre faveur'
    affiche = montant(-solde)
    note = 'Les retenues faites dépassent votre part : ce montant vous reste acquis.'
  }

  return (
    <section className={`releve-solde ${classe}`} aria-label="Reste à payer">
      <p className="releve-solde__intitule">{intitule}</p>
      <p className="releve-solde__montant">{affiche}</p>
      <p className="releve-solde__note">{note}</p>
      <dl className="releve-solde__bilan">
        <div>
          <dt>Pris en charge par l’IPM</dt>
          <dd>{montant(totalPartIpm)}</dd>
        </div>
        <div>
          <dt>Retenu sur salaire</dt>
          <dd>{montant(totalRetenu)}</dd>
        </div>
      </dl>
    </section>
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
          <span>{[soin.numeroBon, dateMoyenne(soin.date)].filter(Boolean).join(' · ')}</span>
          <span className="releve-ipm">L’IPM a pris en charge {montant(soin.partIpm)}</span>
        </>
      }
      etiquette={`${titre}, ${dateMoyenne(soin.date)}, l’IPM a pris en charge ${montant(
        soin.partIpm,
      )}, votre part ${montant(soin.partAgent)}${chemin ? ', voir le bon' : ''}`}
      puce={<span className="releve-montant releve-montant--charge">{montant(soin.partAgent)}</span>}
      meta="votre part"
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
