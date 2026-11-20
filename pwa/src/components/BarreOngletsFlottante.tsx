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
import type { ComponentProps } from 'react'
import { useLocation } from 'react-router-dom'
import {
  cash,
  cashOutline,
  documentText,
  documentTextOutline,
  home,
  homeOutline,
  location,
  locationOutline,
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
    // Les retenues sur salaire, mois par mois. Les billets plutôt que le
    // portefeuille, déjà pris par le solde dans la barre du haut.
    cle: 'releve',
    href: '/releve',
    libelle: 'Retenues',
    icone: cashOutline,
    iconePleine: cash,
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

interface Props {
  onglets?: readonly Onglet[]
}

/** Pages sans barre d'onglets : la page « Télécharger Nofly » se suffit à elle-même. */
const SANS_ONGLETS = /^\/telecharger\/?$/

export default function BarreOngletsFlottante({ onglets = ONGLETS }: Props) {
  const { pathname } = useLocation()
  // Masquée par CSS plutôt que retirée : IonTabs a besoin de sa barre.
  const masquee = SANS_ONGLETS.test(pathname)
  return (
    <IonTabBar slot="bottom" className={`ipm-onglets${masquee ? ' ipm-onglets--masquee' : ''}`}>
      {onglets.map((onglet) => (
        <OngletRacine key={onglet.cle} tab={onglet.cle} href={onglet.href} racine={onglet.href}>
          <IonIcon ios={onglet.icone} md={onglet.iconePleine} aria-hidden="true" />
          <IonLabel>{onglet.libelle}</IonLabel>
        </OngletRacine>
      ))}
    </IonTabBar>
  )
}

/**
 * Un bouton d'onglet qui ramène TOUJOURS à la racine de son onglet quand on y
 * revient d'ailleurs. Par défaut, Ionic rouvre la dernière page vue dans
 * l'onglet (un bon ouvert, par exemple) : la barre lui passe cette adresse en
 * `href`. On la remplace par la racine (« /bons ») tant qu'on est dans un
 * AUTRE onglet ; dans l'onglet lui-même, on laisse Ionic faire (retoucher
 * l'onglet ramène déjà à sa racine).
 */
function OngletRacine({
  racine,
  href,
  ...props
}: Omit<ComponentProps<typeof IonTabButton>, 'ref'> & { racine: string }) {
  const { pathname } = useLocation()
  const dansLOnglet = pathname === racine || pathname.startsWith(`${racine}/`)
  return <IonTabButton {...props} href={dansLOnglet ? href : racine} />
}
// IonTabBar ne pilote que ses boutons d'onglet : ce drapeau le lui dit.
OngletRacine.isTabButton = true
