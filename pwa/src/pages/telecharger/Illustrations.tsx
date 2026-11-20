/**
 * Les petits écrans de téléphone du guide d'installation (/telecharger).
 *
 * Chaque étape montre ce que la personne voit à ce moment-là sur son
 * téléphone, en simplifié, et entoure en rouge ce qu'il faut toucher (un
 * cercle qui pulse, comme un doigt qui appuie). Dessinés en HTML et CSS,
 * sans capture d'écran : nets à toutes les tailles, légers, et en français.
 */

import { IonIcon } from '@ionic/react'
import {
  addCircleOutline,
  bookOutline,
  bookmarkOutline,
  chevronBack,
  chevronForward,
  compass,
  copyOutline,
  ellipsisVertical,
  logoChrome,
  phonePortraitOutline,
  settingsOutline,
  shareOutline,
  timeOutline,
  addOutline,
} from 'ionicons/icons'
import type { ReactNode } from 'react'

/** Le cadre du téléphone ; `haut` : on montre le haut de l'écran, sinon le bas. */
function Telephone({ children, haut = false }: { children: ReactNode; haut?: boolean }) {
  return (
    <div className={`tel tel--${haut ? 'haut' : 'bas'}`} aria-hidden="true">
      <div className="tel__ecran">{children}</div>
    </div>
  )
}

/** Entoure ce qu'il faut toucher. */
function Cible({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`tel-cible ${className}`}>{children}</span>
}

/** Une icône d'application quelconque, pour remplir l'écran d'accueil. */
function AppliVide({ teinte }: { teinte: number }) {
  return (
    <span className="tel-appli">
      <span className={`tel-appli__icone tel-appli__icone--t${teinte}`} />
      <span className="tel-appli__nom" />
    </span>
  )
}

/** L'écran d'accueil, avec l'application à toucher au milieu des autres. */
function EcranAccueil({ appli }: { appli: 'safari' | 'chrome' | 'ipm' }) {
  const cible =
    appli === 'ipm' ? (
      <span className="tel-appli">
        <Cible className="tel-cible--appli">
          <span className="tel-appli__icone tel-appli__icone--ipm">
            <img src="/logo-ipm.png" alt="" />
          </span>
        </Cible>
        <span className="tel-appli__libelle">IPM-SAR</span>
      </span>
    ) : (
      <span className="tel-appli">
        <Cible className="tel-cible--appli">
          <span className={`tel-appli__icone tel-appli__icone--${appli}`}>
            <IonIcon icon={appli === 'safari' ? compass : logoChrome} />
          </span>
        </Cible>
        <span className="tel-appli__libelle">{appli === 'safari' ? 'Safari' : 'Chrome'}</span>
      </span>
    )
  return (
    <Telephone haut>
      <div className="tel-accueil">
        <AppliVide teinte={1} />
        <AppliVide teinte={2} />
        <AppliVide teinte={3} />
        <AppliVide teinte={4} />
        <AppliVide teinte={3} />
        {cible}
        <AppliVide teinte={1} />
        <AppliVide teinte={2} />
      </div>
    </Telephone>
  )
}

/** Le bas de Safari : l'adresse, puis la barre d'outils avec « Partager ». */
function BarreSafari() {
  return (
    <Telephone>
      <div className="tel-page">
        <span className="tel-ligne" />
        <span className="tel-ligne tel-ligne--courte" />
      </div>
      <div className="tel-adresse">ipm-sar.app</div>
      <div className="tel-outils">
        <IonIcon icon={chevronBack} />
        <IonIcon icon={chevronForward} />
        <Cible>
          <IonIcon icon={shareOutline} />
        </Cible>
        <IonIcon icon={bookOutline} />
        <IonIcon icon={copyOutline} />
      </div>
    </Telephone>
  )
}

/** Le menu qui s'ouvre après « Partager », avec « Sur l'écran d'accueil ». */
function FeuillePartage() {
  return (
    <Telephone>
      <div className="tel-feuille">
        <span className="tel-feuille__ligne">
          <span>Copier</span>
          <IonIcon icon={copyOutline} />
        </span>
        <span className="tel-feuille__ligne">
          <span>Ajouter aux favoris</span>
          <IonIcon icon={bookmarkOutline} />
        </span>
        <Cible className="tel-cible--ligne">
          <span className="tel-feuille__ligne">
            <span>Sur l’écran d’accueil</span>
            <IonIcon icon={addCircleOutline} />
          </span>
        </Cible>
      </div>
    </Telephone>
  )
}

/** La fenêtre d'iPhone qui demande confirmation : « Ajouter » en haut à droite. */
function AjoutIphone() {
  return (
    <Telephone haut>
      <div className="tel-entete">
        <span className="tel-lien">Annuler</span>
        <span className="tel-entete__titre">Écran d’accueil</span>
        <Cible>
          <span className="tel-lien tel-lien--gras">Ajouter</span>
        </Cible>
      </div>
      <div className="tel-apercu">
        <span className="tel-appli__icone tel-appli__icone--ipm">
          <img src="/logo-ipm.png" alt="" />
        </span>
        <span className="tel-champ">IPM-SAR</span>
      </div>
    </Telephone>
  )
}

/** La fenêtre d'installation d'Android, ouverte par le bouton rouge. */
function FenetreAndroid() {
  return (
    <Telephone>
      <div className="tel-voile">
        <div className="tel-dialogue">
          <div className="tel-dialogue__tete">
            <span className="tel-appli__icone tel-appli__icone--ipm tel-appli__icone--petite">
              <img src="/logo-ipm.png" alt="" />
            </span>
            <span>
              <strong>Installer l’application ?</strong>
              <br />
              IPM-SAR
            </span>
          </div>
          <div className="tel-dialogue__boutons">
            <span className="tel-lien tel-lien--android">Annuler</span>
            <Cible>
              <span className="tel-bouton-android">Installer</span>
            </Cible>
          </div>
        </div>
      </div>
    </Telephone>
  )
}

/** Le menu des trois points de Chrome, avec « Installer l'application ». */
function MenuChrome() {
  return (
    <Telephone haut>
      <div className="tel-chrome">
        <span className="tel-adresse tel-adresse--chrome">ipm-sar.app</span>
        <span className="tel-chrome__points">
          <IonIcon icon={ellipsisVertical} />
        </span>
      </div>
      <div className="tel-menu">
        <span className="tel-menu__ligne">
          <IonIcon icon={addOutline} /> Nouvel onglet
        </span>
        <span className="tel-menu__ligne">
          <IonIcon icon={timeOutline} /> Historique
        </span>
        <Cible className="tel-cible--ligne">
          <span className="tel-menu__ligne">
            <IonIcon icon={phonePortraitOutline} /> Installer l’application
          </span>
        </Cible>
        <span className="tel-menu__ligne">
          <IonIcon icon={settingsOutline} /> Paramètres
        </span>
      </div>
    </Telephone>
  )
}

const ILLUSTRATIONS: Record<string, () => ReactNode> = {
  'iphone-safari': () => <EcranAccueil appli="safari" />,
  'iphone-partager': () => <BarreSafari />,
  'iphone-ecran': () => <FeuillePartage />,
  'iphone-ajouter': () => <AjoutIphone />,
  'iphone-fini': () => <EcranAccueil appli="ipm" />,
  'android-chrome': () => <EcranAccueil appli="chrome" />,
  'android-bouton': () => <FenetreAndroid />,
  'android-menu': () => <MenuChrome />,
  'android-fini': () => <EcranAccueil appli="ipm" />,
}

/** Le dessin d'une étape (« iphone-partager », « android-menu »…), s'il y en a un. */
export default function IllustrationEtape({ cle }: { cle: string }) {
  return ILLUSTRATIONS[cle]?.() ?? null
}
