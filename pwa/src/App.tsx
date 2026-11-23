/**
 * Coquille de l'application : lancement, garde d'identification, onglets.
 *
 *   /identification        sans session
 *   /accueil /bons /profil  onglets (IonTabs), tab bar en bas
 *   /bons/:id               détail d'un bon, dans l'onglet « Mes bons »
 *   /bons/lettres/:id       détail d'une lettre de garantie, même écran
 *   modal « Nouveau bon »   ouvert par useNouveauBon(), de n'importe où
 *
 * Deux arbres de routage distincts selon la session plutôt que des
 * <Redirect> conditionnels dans un même IonRouterOutlet : Ionic garde en
 * mémoire les pages de sa pile, et une page protégée ne doit pas survivre à
 * la déconnexion.
 */

import { IonApp, IonRouterOutlet, IonTabs } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { useEffect, useState } from 'react'
import { Redirect, Route, useLocation } from 'react-router-dom'

import BarreOngletsFlottante from './components/BarreOngletsFlottante'
import MiseAJour from './components/MiseAJour'
import PropositionEmpreinte from './components/PropositionEmpreinte'
import { NouveauBonProvider } from './components/NouveauBonModal'
import Splash from './components/Splash'
import { haptique } from './hooks/haptique'
import Accueil from './pages/Accueil'
import Assistance from './pages/Assistance'
import Telecharger from './pages/Telecharger'
import APropos from './pages/APropos'
import DetailBon from './pages/DetailBon'
import Identification from './pages/Identification'
import Identite from './pages/Identite'
import Itineraire from './pages/Itineraire'
import MesBons from './pages/MesBons'
import Notifications from './pages/Notifications'
import Conventionnes from './pages/Conventionnes'
import Profil from './pages/Profil'
import Releve from './pages/Releve'
import { prechargerConventionnes } from './pages/conventionnes/useConventionnes'
import { prechargerGoogleMaps } from './pages/itineraire/googleMaps'
import { SessionProvider, useSession } from './session'

/** Durée minimale de l'écran de lancement : assez pour son animation, pas plus. */
export const DUREE_MIN_LANCEMENT_MS = 900

export default function App() {
  return (
    <IonApp>
      <SessionProvider>
        <Coquille />
      </SessionProvider>
      <MiseAJour />
    </IonApp>
  )
}

function useDelaiEcoule(ms: number): boolean {
  const [ecoule, setEcoule] = useState(false)
  useEffect(() => {
    const minuteur = setTimeout(() => setEcoule(true), ms)
    return () => clearTimeout(minuteur)
  }, [ms])
  return ecoule
}

function Coquille() {
  const { statut } = useSession()
  const lancementFini = useDelaiEcoule(DUREE_MIN_LANCEMENT_MS)

  if (statut === 'chargement' || !lancementFini) return <Splash />

  return (
    <>
      {statut === 'identifie' ? (
        <IonReactRouter key="identifie">
          <NouveauBonProvider>
            <Onglets />
          </NouveauBonProvider>
        </IonReactRouter>
      ) : (
        <IonReactRouter key="anonyme">
          <Anonyme />
        </IonReactRouter>
      )}
    </>
  )
}

/*
 * Pas de route « attrape-tout » (sans path) dans un IonRouterOutlet : quand
 * une route à paramètre n'a pas encore de vue en pile (premier passage sur
 * /bons/:id), Ionic retient la route sans path comme route par défaut et
 * remplace le match de la page par un match sans paramètres — le détail
 * recevait alors params = {} et affichait « Bon introuvable ». Les URL hors
 * de l'arbre sont donc redirigées hors de l'outlet, par un simple test sur le
 * chemin.
 */

/** Chemins servis quand on est identifié ; le reste mène à l'accueil. */
const CHEMINS_IDENTIFIE =
  /^\/(accueil|bons|profil|conventionnes|releve|assistance|identite|notifications|a-propos|telecharger)\/?$|^\/(bons|conventionnes)\/[^/]+\/?$|^\/bons\/(lettres|optique)\/[^/]+\/?$/

function Anonyme() {
  const { pathname } = useLocation()
  return (
    <>
      {/* /telecharger se partage avant toute connexion : pas de redirection. */}
      {pathname !== '/identification' && !/^\/telecharger\/?$/.test(pathname) && (
        <Redirect to="/identification" />
      )}
      <IonRouterOutlet>
        <Route exact path="/identification" component={Identification} />
        <Route exact path="/telecharger" component={Telecharger} />
      </IonRouterOutlet>
    </>
  )
}

function Onglets() {
  const { pathname } = useLocation()
  // Connecté : la carte des structures se prépare en arrière-plan (script
  // Google et annuaire), pour s'ouvrir aussitôt quand on touche l'onglet.
  useEffect(() => {
    prechargerGoogleMaps()
    prechargerConventionnes()
  }, [])
  return (
    <>
      {/* « / », « /identification » juste après l'identification, URL inconnue. */}
      {/* L'annuaire s'appelait « Pharmacies » : une icône installée ou un
          favori sur l'ancienne adresse mène au nouvel écran, pas à l'accueil. */}
      {/^\/pharmacies\/?$/.test(pathname) && <Redirect to="/conventionnes" />}
      {/* « /installation » a été retiré en novembre 2026 : son contenu était le
          troisième exemplaire du même guide. Une icône installée ou un favori
          sur l'ancienne adresse mène à /telecharger, qui le dit mieux. */}
      {/^\/installation\/?$/.test(pathname) && <Redirect to="/telecharger" />}
      {!CHEMINS_IDENTIFIE.test(pathname) &&
        !/^\/(pharmacies|installation)\/?$/.test(pathname) && <Redirect to="/accueil" />}
      <IonTabs onIonTabsWillChange={() => haptique.leger()}>
        <IonRouterOutlet>
          <Route exact path="/accueil" component={Accueil} />
          <Route exact path="/bons" component={MesBons} />
          <Route exact path="/bons/:id" component={DetailBon} />
          <Route exact path="/bons/lettres/:id" component={DetailBon} />
          <Route exact path="/bons/optique/:id" component={DetailBon} />
          <Route exact path="/profil" component={Profil} />
          {/* Le relevé du compte IPM de l'agent (ticket modérateur et retenues). */}
          <Route exact path="/releve" component={Releve} />
          {/* Ouverts depuis la grille de services de l'accueil (catalogue). */}
          <Route exact path="/conventionnes" component={Conventionnes} />
          {/* La carte de l'itinéraire vers une structure, dans l'application. */}
          <Route exact path="/conventionnes/:code" component={Itineraire} />
          <Route exact path="/assistance" component={Assistance} />
          {/* Photos d'identité des cartes d'adhérent, en page (ouverte du haut). */}
          <Route exact path="/identite" component={Identite} />
          {/* Décisions de l'IPM sur les demandes, en page (ouverte de la cloche). */}
          <Route exact path="/notifications" component={Notifications} />
          {/* Ouvert depuis le profil, présenté comme l'assistance. */}
          <Route exact path="/telecharger" component={Telecharger} />
          <Route exact path="/a-propos" component={APropos} />
        </IonRouterOutlet>
        {/* Barre flottante (SPEC_DESIGN §3.1) : le contenu passe dessous, les
            écrans réservent donc --bas-page en fin de contenu. */}
        <BarreOngletsFlottante />
      </IonTabs>
      {/* Après une connexion : proposer l'empreinte / Face ID, une fois. */}
      <PropositionEmpreinte />
    </>
  )
}
