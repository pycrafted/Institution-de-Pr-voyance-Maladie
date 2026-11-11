/**
 * Barre d'onglets flottante (SPEC_DESIGN §3.1) : 64 de haut, détachée de
 * 12 px des bords et du bas (zone sûre comprise), rayon `--r-xl`, surface à
 * 92 % floutée, `--ombre-3`. L'onglet actif porte une pastille rouge douce.
 *
 * C'est la forme des applications de 2026 : la barre ne colle plus au bas de
 * l'écran, le contenu passe dessous. Les écrans réservent donc `--bas-page`
 * (104) de vide en fin de contenu — cf. l'utilitaire `.ipm-bas-page`.
 *
 * Elle reste un vrai IonTabBar : Ionic lui parle par son contexte, pas par
 * ses enfants, on peut donc l'envelopper dans un composant à nous.
 */

import { IonIcon, IonLabel, IonTabBar, IonTabButton, useIonToast } from '@ionic/react'
import {
  documentText,
  documentTextOutline,
  home,
  homeOutline,
  location,
  locationOutline,
  wallet,
  walletOutline,
} from 'ionicons/icons'

import { haptique } from '../hooks/haptique'

export interface Onglet {
  /** Nom de l'onglet pour Ionic, et clé React. */
  cle: string
  href: string
  /** 11/600, court : la barre n'a pas la place d'une phrase. */
  libelle: string
  /** Icône iOS (au trait) et icône Android (pleine), comme le veut chaque système. */
  icone: string
  iconePleine: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const ONGLETS: readonly Onglet[] = [
  { cle: 'accueil', href: '/accueil', libelle: 'Accueil', icone: homeOutline, iconePleine: home },
  {
    cle: 'bons',
    href: '/bons',
    // §5 : l'écran s'appelle « Mes bons » partout — onglet, titre
    // d'écran et raccourci de l'accueil.
    libelle: 'Mes bons',
    icone: documentTextOutline,
    iconePleine: documentText,
  },
  {
    // Toutes les structures conventionnées, et pas seulement les pharmacies.
    // L'épingle plutôt qu'un symbole médical : l'écran sert à trouver une
    // structure près de soi et à s'y rendre, et la croix se confondait avec
    // l'icône du bon de pharmacie.
    cle: 'conventionnes',
    href: '/conventionnes',
    libelle: 'Structures',
    icone: locationOutline,
    iconePleine: location,
  },
]

/** Le suivi comptable de l'employé (retenues sur salaire et leur motif) : le
    bouton est en place, l'écran viendra plus tard. */
const ONGLET_A_VENIR = {
  cle: 'retenues',
  libelle: 'Mes retenues',
  icone: walletOutline,
  iconePleine: wallet,
  message: 'Le suivi de vos retenues IPM n’est pas encore disponible.',
}

/**
 * Un onglet qui ne mène nulle part : il annonce seulement que son écran
 * n'existe pas encore. IonTabBar ne garde que les boutons d'onglet
 * (`isTabButton`) et leur passe un `onClick` qui change d'onglet : celui-ci
 * l'ignore, et rien ne bouge.
 */
function OngletAVenir() {
  const [presenterToast] = useIonToast()
  return (
    <IonTabButton
      tab={ONGLET_A_VENIR.cle}
      // Sans adresse, ion-tabs chercherait un onglet « retenues » qui n'existe
      // pas (erreur en console). Le bouton d'Ionic bloque de lui-même le
      // lien : « # » n'est jamais suivi.
      href="#"
      onClick={() => {
        haptique.leger()
        void presenterToast({ message: ONGLET_A_VENIR.message, duration: 2800, position: 'top' })
      }}
    >
      <IonIcon ios={ONGLET_A_VENIR.icone} md={ONGLET_A_VENIR.iconePleine} aria-hidden="true" />
      <IonLabel>{ONGLET_A_VENIR.libelle}</IonLabel>
    </IonTabButton>
  )
}
OngletAVenir.isTabButton = true

interface Props {
  onglets?: readonly Onglet[]
}

export default function BarreOngletsFlottante({ onglets = ONGLETS }: Props) {
  return (
    <IonTabBar slot="bottom" className="ipm-onglets">
      {onglets.map((onglet) => (
        <IonTabButton key={onglet.cle} tab={onglet.cle} href={onglet.href}>
          <IonIcon ios={onglet.icone} md={onglet.iconePleine} aria-hidden="true" />
          <IonLabel>{onglet.libelle}</IonLabel>
        </IonTabButton>
      ))}
      <OngletAVenir />
    </IonTabBar>
  )
}
