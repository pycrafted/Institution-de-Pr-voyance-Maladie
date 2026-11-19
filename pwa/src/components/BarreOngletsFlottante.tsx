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

import { IonIcon, IonLabel, IonTabBar, IonTabButton } from '@ionic/react'
import {
  cash,
  cashOutline,
  documentText,
  documentTextOutline,
  home,
  homeOutline,
  location,
  locationOutline,
  wallet,
  walletOutline,
} from 'ionicons/icons'

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
    // Le relevé du compte IPM (soins, retenues, remboursements) : remonté de
    // la barre du haut, c'est un écran qu'on consulte souvent.
    cle: 'releve',
    href: '/releve',
    libelle: 'Relevé',
    icone: walletOutline,
    iconePleine: wallet,
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
  {
    // Le scan (pré-financement) est devenu un onglet comme les autres, à la
    // place du relevé, qui a rejoint la barre du haut (compte/perso). Nommé
    // d'après ce qu'il offre (une avance d'argent), pas d'après le geste : la
    // consultation s'y fait sans rien scanner. Billet plutôt que portefeuille,
    // déjà pris par le relevé dans la barre du haut.
    cle: 'scan',
    href: '/scan',
    libelle: 'Préfinancement',
    icone: cashOutline,
    iconePleine: cash,
  },
]

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
    </IonTabBar>
  )
}
