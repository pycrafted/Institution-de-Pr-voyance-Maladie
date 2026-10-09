/**
 * Feuille d'installation (SPEC §3) quand l'application est ouverte dans le
 * navigateur plutôt que depuis l'écran d'accueil :
 *  - Android / Chrome : bouton « Installer » (invitation beforeinstallprompt
 *    interceptée au démarrage, cf. utils/installation.ts) ;
 *  - iOS : instructions illustrées « Partager → Sur l'écran d'accueil »,
 *    Safari n'offrant aucun moyen de le faire par programme.
 * Jamais affichée dans l'application installée. Refermable : le refus est
 * mémorisé (localStorage) et on ne la repropose pas avant quelques jours.
 * Le profil peut la rouvrir à la demande (ouvrirFeuilleInstallation).
 *
 * Montée une seule fois par App.tsx, au-dessus des deux routeurs : elle
 * survit au passage identification → accueil.
 */

import { IonIcon, IonModal, useIonToast } from '@ionic/react'
import {
  add,
  checkmarkCircle,
  close,
  cloudOfflineOutline,
  downloadOutline,
  ellipsisHorizontal,
  ellipsisVertical,
  flashOutline,
  phonePortraitOutline,
  shareOutline,
} from 'ionicons/icons'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { haptique } from '../hooks/haptique'
import { useInstallation } from '../utils/installation'
import { estAndroid, estInstallee, estIOS } from '../utils/plateforme'
import { BoutonPrincipal, BoutonSecondaire } from './Boutons'
import './InstallSheet.css'

/** Clé localStorage : date-heure ISO du dernier refus. */
export const CLE_FERMETURE = 'ipm-mobile.installation.fermee-le'
/** Délai avant de reproposer l'installation après un refus. */
export const JOURS_AVANT_NOUVELLE_PROPOSITION = 14
/** Laisser l'écran s'afficher avant de glisser la feuille par-dessus. */
export const DELAI_APPARITION_MS = 1500

const JOUR_MS = 86_400_000

export type PlateformeInstallation = 'ios' | 'android' | 'autre'

// eslint-disable-next-line react-refresh/only-export-components
export function plateformeCourante(): PlateformeInstallation {
  if (estIOS()) return 'ios'
  if (estAndroid()) return 'android'
  return 'autre'
}

/** Instant (ms) du dernier refus, ou null. Stockage indisponible : jamais refusé. */
// eslint-disable-next-line react-refresh/only-export-components
export function lireFermeture(): number | null {
  try {
    const valeur = window.localStorage.getItem(CLE_FERMETURE)
    const instant = valeur ? Date.parse(valeur) : Number.NaN
    return Number.isFinite(instant) ? instant : null
  } catch {
    return null
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function memoriserFermeture(maintenant: Date = new Date()): void {
  try {
    window.localStorage.setItem(CLE_FERMETURE, maintenant.toISOString())
  } catch {
    // Navigation privée ou stockage plein : la feuille reviendra, tant pis.
  }
}

/**
 * Faut-il proposer spontanément l'installation ? Sur iOS toujours (le
 * partage le permet dans Safari), ailleurs seulement si le navigateur a
 * émis son invitation (sinon on n'aurait rien d'utile à proposer).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function doitProposer(contexte: {
  installee: boolean
  plateforme: PlateformeInstallation
  possible: boolean
  fermeeLe: number | null
  maintenant: number
}): boolean {
  if (contexte.installee) return false
  if (
    contexte.fermeeLe !== null &&
    contexte.maintenant - contexte.fermeeLe < JOURS_AVANT_NOUVELLE_PROPOSITION * JOUR_MS
  ) {
    return false
  }
  return contexte.plateforme === 'ios' || contexte.possible
}

// ---------------------------------------------------------------------------
// Réouverture à la demande (Profil → « Installer sur l'écran d'accueil »)
// ---------------------------------------------------------------------------

let demandes = 0
const abonnes = new Set<() => void>()

/** Rouvre la feuille, même refusée auparavant. */
// eslint-disable-next-line react-refresh/only-export-components
export function ouvrirFeuilleInstallation(): void {
  demandes += 1
  abonnes.forEach((abonne) => abonne())
}

function sAbonner(abonne: () => void) {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}
const lireDemandes = () => demandes

// ---------------------------------------------------------------------------
// Contenu (sans la fenêtre, pour être testé seul)
// ---------------------------------------------------------------------------

interface ContenuProps {
  plateforme: PlateformeInstallation
  /** Le navigateur accepte l'installation en un geste (Android/Chrome). */
  possible: boolean
  onInstaller: () => void
  onFermer: () => void
}

export function ContenuInstallation({ plateforme, possible, onInstaller, onFermer }: ContenuProps) {
  const installationDirecte = plateforme !== 'ios' && possible
  return (
    <div className="installation">
      {/* Poignée de la charte (§3.9) : la feuille se referme au balayage. */}
      <div className="ipm-feuille__poignee" aria-hidden="true" />

      <header className="installation__entete">
        <img
          className="installation__icone"
          src="/icons/icone-192.png"
          alt=""
          width={56}
          height={56}
        />
        <div className="installation__titres">
          <h2 id="installation-titre" className="installation__titre">
            Installer IPM Mobile
          </h2>
          <p className="installation__sous-titre">
            Vos bons de pharmacie toujours à portée de main.
          </p>
        </div>
        <button
          type="button"
          className="installation__fermer ipm-appui"
          onClick={onFermer}
          aria-label="Fermer"
        >
          <IonIcon icon={close} aria-hidden="true" />
        </button>
      </header>

      {/* Trois atouts, chacun sur sa propre carte : §1 interdit le filet
          entre deux lignes d'une liste. */}
      <ul className="installation__atouts">
        <Atout icone={flashOutline}>Ouverture instantanée, en plein écran</Atout>
        <Atout icone={cloudOfflineOutline}>Vos bons consultables même sans connexion</Atout>
        <Atout icone={phonePortraitOutline}>
          Aucun store à ouvrir, très peu de place sur le téléphone
        </Atout>
      </ul>

      {plateforme === 'ios' && <EtapesIOS />}
      {plateforme !== 'ios' && !possible && <EtapesNavigateur />}

      <div className="installation__actions">
        {installationDirecte && (
          <BoutonPrincipal icone={downloadOutline} onClick={onInstaller}>
            Installer
          </BoutonPrincipal>
        )}
        {/* Seul bouton de la feuille, « Compris » est le principal, comme sur
            toutes les feuilles ; à côté d'« Installer », « Plus tard » s'efface. */}
        {installationDirecte ? (
          <BoutonSecondaire onClick={onFermer}>Plus tard</BoutonSecondaire>
        ) : (
          <BoutonPrincipal onClick={onFermer}>Compris</BoutonPrincipal>
        )}
      </div>
    </div>
  )
}

/** Un atout de l'application, sur sa carte : cercle teinté + phrase. */
function Atout({ icone, children }: { icone: string; children: ReactNode }) {
  return (
    <li className="installation__atout">
      <span className="installation__cercle ipm-cercle--rouge" aria-hidden="true">
        <IonIcon icon={icone} />
      </span>
      <span>{children}</span>
    </li>
  )
}

/**
 * iOS : trois étapes, chacune avec une reproduction de l'élément à toucher
 * (bouton Partager, ligne du menu de partage, bouton « Ajouter »).
 */
function EtapesIOS() {
  return (
    <>
      <ol className="installation__etapes" aria-label="Installer sur iPhone">
        <li>
          <span className="installation__numero" aria-hidden="true">
            1
          </span>
          <span className="installation__texte">
            Touchez <strong>Partager</strong> dans la barre de Safari
            <small>
              Sous iOS 26, touchez d’abord{' '}
              <IonIcon icon={ellipsisHorizontal} aria-label="le bouton ···" />
            </small>
          </span>
          <span
            className="installation__imitation installation__imitation--bouton"
            aria-hidden="true"
          >
            <IonIcon icon={shareOutline} />
          </span>
        </li>
        <li>
          <span className="installation__numero" aria-hidden="true">
            2
          </span>
          <span className="installation__texte">
            Faites défiler, puis choisissez <strong>Sur l’écran d’accueil</strong>
          </span>
          <span
            className="installation__imitation installation__imitation--ligne"
            aria-hidden="true"
          >
            <span>Sur l’écran d’accueil</span>
            <span className="installation__carre">
              <IonIcon icon={add} />
            </span>
          </span>
        </li>
        <li>
          <span className="installation__numero" aria-hidden="true">
            3
          </span>
          <span className="installation__texte">
            Touchez <strong>Ajouter</strong>, en haut à droite
          </span>
          <span
            className="installation__imitation installation__imitation--texte"
            aria-hidden="true"
          >
            Ajouter
          </span>
        </li>
      </ol>
      <p className="installation__note">
        Ouvrez ensuite IPM Mobile depuis son icône : vous vous y identifierez une seule fois. Si «
        Sur l’écran d’accueil » n’apparaît pas, ouvrez d’abord cette page dans Safari.
      </p>
    </>
  )
}

/** Navigateur sans invitation (Firefox, ou invitation déjà utilisée) : passer par son menu. */
function EtapesNavigateur() {
  return (
    <ol className="installation__etapes" aria-label="Installer depuis le navigateur">
      <li>
        <span className="installation__numero" aria-hidden="true">
          1
        </span>
        <span className="installation__texte">Ouvrez le menu du navigateur</span>
        <span
          className="installation__imitation installation__imitation--bouton"
          aria-hidden="true"
        >
          <IonIcon icon={ellipsisVertical} />
        </span>
      </li>
      <li>
        <span className="installation__numero" aria-hidden="true">
          2
        </span>
        <span className="installation__texte">
          Choisissez <strong>Installer l’application</strong> ou{' '}
          <strong>Ajouter à l’écran d’accueil</strong>
        </span>
      </li>
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Feuille
// ---------------------------------------------------------------------------

/** Un champ de saisie a le focus (clavier ouvert) : ce n'est pas le moment. */
// eslint-disable-next-line react-refresh/only-export-components
export function saisieEnCours(): boolean {
  const actif = document.activeElement
  if (!actif || actif === document.body) return false
  return (
    actif instanceof HTMLInputElement ||
    actif instanceof HTMLTextAreaElement ||
    actif instanceof HTMLSelectElement ||
    (actif instanceof HTMLElement && actif.isContentEditable) ||
    actif.closest('ion-input, ion-textarea, ion-searchbar') !== null
  )
}

interface Props {
  /**
   * La proposition spontanée est permise (false sur l'écran d'identification :
   * la feuille recouvrait le champ Matricule en pleine saisie). Elle vient
   * alors à l'arrivée sur l'accueil. L'ouverture à la demande (Profil) n'en
   * dépend pas.
   */
  spontanee?: boolean
}

export default function InstallSheet({ spontanee = true }: Props) {
  const { possible, installee, proposer } = useInstallation()
  const demandesManuelles = useSyncExternalStore(sAbonner, lireDemandes, lireDemandes)
  const [ouverte, setOuverte] = useState(false)
  const [presenterToast] = useIonToast()
  const plateforme = useMemo(plateformeCourante, [])
  // Lue une fois : on ne passe pas du navigateur à l'application installée
  // sans recharger la page.
  const dejaInstallee = useMemo(estInstallee, [])
  // Une seule proposition spontanée par lancement.
  const dejaProposee = useRef(false)

  useEffect(() => {
    if (dejaProposee.current || !spontanee) return
    const aProposer = doitProposer({
      installee: dejaInstallee || installee,
      plateforme,
      possible,
      fermeeLe: lireFermeture(),
      maintenant: Date.now(),
    })
    if (!aProposer) return
    let minuteur: ReturnType<typeof setTimeout>
    const essayer = () => {
      // Jamais par-dessus une saisie : on repasse un peu plus tard.
      if (saisieEnCours()) {
        minuteur = setTimeout(essayer, DELAI_APPARITION_MS)
        return
      }
      dejaProposee.current = true
      setOuverte(true)
    }
    minuteur = setTimeout(essayer, DELAI_APPARITION_MS)
    return () => clearTimeout(minuteur)
  }, [dejaInstallee, installee, plateforme, possible, spontanee])

  useEffect(() => {
    if (demandesManuelles > 0) setOuverte(true)
  }, [demandesManuelles])

  // Installation terminée (quel qu'en soit le chemin : feuille ou menu du
  // navigateur). Le toast passe par une référence : annoncé une seule fois,
  // quelle que soit la stabilité de la fonction rendue par useIonToast.
  const toastRef = useRef(presenterToast)
  toastRef.current = presenterToast
  const installationAnnoncee = useRef(false)
  useEffect(() => {
    if (!installee || installationAnnoncee.current) return
    installationAnnoncee.current = true
    setOuverte(false)
    haptique.succes()
    void toastRef.current({
      message: 'IPM Mobile est installé. Ouvrez-le depuis votre écran d’accueil.',
      duration: 3500,
      position: 'top',
      icon: checkmarkCircle,
      color: 'success',
    })
  }, [installee])

  async function installer() {
    haptique.leger()
    const acceptee = await proposer()
    // Acceptée : « appinstalled » suivra et refermera la feuille. Refusée :
    // la boîte du navigateur ne se représentera pas avant un rechargement.
    if (!acceptee) {
      memoriserFermeture()
      setOuverte(false)
    }
  }

  return (
    <IonModal
      isOpen={ouverte}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      // La poignée est dessinée par le contenu (§3.9, mêmes cotes partout) :
      // celle d'Ionic n'a ni sa taille ni sa couleur.
      handle={false}
      className="installation-feuille"
      aria-labelledby="installation-titre"
      onDidDismiss={() => {
        // Refermée au geste, par « Plus tard » ou par la croix : on ne
        // la repropose pas de sitôt.
        setOuverte(false)
        if (!installee) memoriserFermeture()
      }}
    >
      <ContenuInstallation
        plateforme={plateforme}
        possible={possible}
        onInstaller={() => void installer()}
        onFermer={() => setOuverte(false)}
      />
    </IonModal>
  )
}
