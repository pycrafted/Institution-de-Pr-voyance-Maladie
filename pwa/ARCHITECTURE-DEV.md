# IPM Mobile : conventions pour les développeurs

À lire avant de toucher un écran. La spécification fonctionnelle fait foi ; ce
document dit **où** sont les choses et **comment** écrire.

## Installation

`npm install` dans `pwa/`, avec `npm_config_strict_ssl=false` pour la seule
commande (jamais dans un `.npmrc`). Au 18/09/2026, le FortiGate du réseau
bloque registry.npmjs.org par une règle de contrôle d'applications (réponse
403 « Application Blocked : Npmjs ») : tant que l'accès n'est pas ouvert,
`node_modules/` et `package-lock.json` n'existent pas et aucune commande npm
ne tourne.

## Règles

- **Ne pas modifier `package.json`** : toutes les dépendances sont déjà là
  (Ionic React 8, react-router 5, ionicons, pdfjs-dist, idb-keyval, Vitest,
  Testing Library, Playwright). Si une dépendance manque, le signaler dans le
  rapport.
- Chaque écran reste dans **son** fichier (voir « Écrans » plus bas). Ne pas
  modifier le socle (`api/`, `types/`, `session/`, `data/`, `offline/`,
  `hooks/`, `utils/`, `theme/`, composants partagés, `App.tsx`) sans le signaler :
  les autres agents s'en servent en même temps.
- Français partout : noms, commentaires (qui expliquent le **pourquoi**),
  messages. Messages d'erreur humains, jamais un code HTTP.
- Jamais de `console.log` (ESLint le refuse), à plus forte raison avec des
  données personnelles.
- Aucun appel `fetch` direct : tout passe par `src/api/`.

## Arborescence

```
src/
  main.tsx              CSS Ionic + thème, setupIonicReact (mode NON forcé)
  App.tsx               lancement, garde d'identification, IonTabs, routes
  version.ts            VERSION (package.json), pour « À propos »
  types/api.ts          types EXACTS des réponses de /api/mobile/
  api/                  client HTTP unique (voir plus bas)
  session/              SessionProvider, useSession(), useParticipant()
  data/bons.ts          liste partagée des bons : useBons(), memoriserBon()
  offline/stockage.ts   IndexedDB : session, bons, PDF en cache
  hooks/                useOnline(), haptique
  utils/                format.ts (dates, âge, noms), statut.ts, plateforme.ts, installation.ts
  components/           composants partagés + hôte du modal Nouveau bon
  pages/                les écrans
  theme/                variables.css (couleurs), global.css (sensation native)
  test/                 setup.ts, fabriques.ts (données d'exemple typées)
```

## Routes

| URL               | Composant                          | Remarque                                  |
|-------------------|------------------------------------|-------------------------------------------|
| `/identification` | `pages/Identification.tsx`         | seule route sans session                  |
| `/accueil`        | `pages/Accueil.tsx`                | onglet                                    |
| `/bons`           | `pages/MesBons.tsx`                | onglet                                    |
| `/bons/:id`       | `pages/DetailBon.tsx`              | dans l'onglet « Mes bons » ; `match.params.id` |
| `/profil`         | `pages/Profil.tsx`                 | onglet                                    |
| `/pharmacies`     | `pages/Pharmacies.tsx`             | ouverte par la grille de services (pas un onglet) |
| `/assistance`     | `pages/Assistance.tsx`             | ouverte par la grille de services (pas un onglet) |
| (modal)           | `pages/NouveauBon/index.tsx`       | ouvert par `useNouveauBon().ouvrirNouveauBon()` |

La garde est dans `App.tsx` : sans session, tout renvoie à `/identification` ;
après `identifier()`, l'application bascule seule sur `/accueil`. Après
`deconnecter()`, retour automatique à l'identification. **Ne pas naviguer à la
main** pour ces transitions.

Navigation : `useIonRouter().push('/bons/12', 'forward', 'push')` (transitions
natives), ou la prop `routerLink` de `CarteListe`. Retour :
`useIonRouter().goBack()`, passé à `<BandeauMarque onRetour>` — il n'y a plus
de toolbar, donc plus de `IonBackButton`.

Trois onglets seulement (`components/BarreOngletsFlottante.tsx`, constante
`ONGLETS`) : Accueil, Documents, Profil. Les autres écrans s'atteignent par la
grille de services de l'accueil.

## Écrans et propriétaires

| Agent        | Fichiers                                                                    |
|--------------|-----------------------------------------------------------------------------|
| systeme      | `theme/`, `components/` (la charte), `pages/Accueil.tsx`, `pages/accueil/`, `services/catalogue.ts`, `pages/Pharmacies.tsx`, `pages/Assistance.tsx`, `scripts/generer-icones.py` |
| accueil      | `pages/Identification.tsx`, `pages/Profil.tsx`, `components/InstallSheet.tsx` |
| bons         | `pages/MesBons.tsx`, `pages/DetailBon.tsx`, `components/PdfViewer.tsx`       |
| nouveau-bon  | `pages/NouveauBon/` (point d'entrée `index.tsx`, contrat `NouveauBonProps`) |

Chaque fichier existe déjà en version minimale : garder son export par défaut
et ses props exportées. Les styles propres à un écran vont dans un `.css` à
côté du fichier (`Accueil.css`), importé par l'écran, classes préfixées par
le nom de l'écran (`.accueil__salutation`).

## Types (`src/types/api.ts`)

`Participant`, `Beneficiaire`, `Fournisseur`, `Specialite`, `Bon`, `StatutBon`
(`'valide' | 'expire' | 'annule' | 'traite'`), `BeneficiaireBon`, `CodeLibelle`,
`MoiReponse`, `IdentificationCorps`, `IdentificationReponse`, `NouveauBonCorps`,
`ChampNouveauBon`, `ErreursChamps`, `DateISO`. Nullabilité exacte du backend
(`age`, `societe`, `type`, `pharmacie`, `adresse`, `telephone` peuvent être `null`).

## Client API (`src/api/`, importer depuis `'../api'`)

| Fonction                                   | Point d'entrée                             |
|--------------------------------------------|--------------------------------------------|
| `identifier({ matricule, date_naissance })` | POST `/mobile/identification/` (sans jeton) |
| `lireMoi()`                                | GET `/mobile/moi/`                         |
| `listerPharmacies()`                       | GET `/mobile/pharmacies/`                  |
| `listerSpecialites()`                      | GET `/mobile/specialites/`                 |
| `listerPrescripteurs(codeSpecialite)`      | GET `/mobile/prescripteurs/?specialite=`   |
| `listerBons()` / `lireBon(id)`             | GET `/mobile/bons-pharmacie/[id/]`         |
| `creerBon(corps: NouveauBonCorps)`         | POST `/mobile/bons-pharmacie/` → `Bon`     |
| `telechargerPdfBon(id)`                    | GET `/mobile/bons-pharmacie/<id>/pdf/` → `Blob` |

Toutes acceptent `{ signal }` (annuler quand l'écran est quitté). Échec :
**`ErreurApi`** avec `genre` (`'reseau' | 'delai' | 'annulee' | 'validation' |
'non-autorise' | 'interdit' | 'introuvable' | 'trop-de-requetes' | 'serveur' |
'inconnue'`), `statut`, `message` (français, **montrable tel quel**), `champs`
(400 : `{ champ: [messages] }`) et `erreur.champ('nbArticles')`.
`messageErreur(e)` donne un message pour n'importe quelle exception.
Ignorer silencieusement `genre === 'annulee'`. Un 401 ferme la session tout
seul (le client appelle la déconnexion) : rien à faire dans l'écran.

## Session (`src/session/`)

`useSession()` → `{ statut, participant, beneficiaires, motifDeconnexion,
identifier(matricule, 'AAAA-MM-JJ'), rafraichir(), deconnecter() }`.
`useParticipant()` → `{ participant, beneficiaires }` non nuls (écrans protégés).
`motifDeconnexion === 'expiree'` : l'identification doit dire que la session
a expiré. `deconnecter()` efface jeton, profil, bons et PDF.

## Données partagées et hors-ligne

- `useBons()` (`data/bons.ts`) → `{ bons, chargement, erreur, depuisCache,
  synchroniseLe, rafraichir }`. Cache d'abord, réseau ensuite ; une seule
  requête même si plusieurs écrans l'appellent. `bons === null` : rien de
  connu (afficher des squelettes). `useBonConnu(id)` : un bon de la liste.
  `memoriserBon(bon)` : insère/remplace (fait automatiquement après création).
- `offline/stockage.ts` : `lirePdfEnCache(id)`, `enregistrerPdfEnCache(id, blob)`,
  `lireBonEnCache(id)`.
- Pull-to-refresh : `<IonRefresher onIonRefresh={e => rafraichir().then(() => e.detail.complete())}>`.

## La charte : les dix composants imposés (`src/components/`)

Ce sont **les seules** briques avec lesquelles construire un écran. Leurs
styles sont dans `components/composants.css`, rangés dans l'ordre de
SPEC_DESIGN §3 ; un écran n'écrit ni couleur, ni rayon, ni ombre en dur.

| Composant | Fichier | Props principales |
|---|---|---|
| `BarreOngletsFlottante` | `BarreOngletsFlottante.tsx` | `{ onglets? }` — déjà montée par `App.tsx` ; `ONGLETS` donne la liste |
| `BandeauMarque` | `BandeauMarque.tsx` | `{ variante?: 'plein'/'compact', titre, sousTitre?, teinte?: 'noir'/'rouge', fin?, onRetour?, chevauche?, children? }` |
| `CarteIdentite` | `CarteIdentite.tsx` | `{ nom, prenoms, matricule, dateNaissance?, societe?, photo?, onChangerPhoto? }` — carte d'identité d'adhérent (accueil et profil) |
| `TuileService`, `GrilleServices` | `TuileService.tsx`, `GrilleServices.tsx` | `{ services?, onOuvrir(service), onIndisponible?(service), etiquette? }` |
| `CarteListe` | `CarteListe.tsx` | `{ icone?, vignette?, teinte?, titre, details?, puce?, meta?, chevron?, routerLink?, onClick?, rang?, etiquette? }` |
| `PucesFiltre` | `PucesFiltre.tsx` | `{ puces: {cle,libelle,nombre?}[], active, onChanger(cle), etiquette }` |
| `BoutonPrincipal`, `BoutonSecondaire`, `PiedBoutons` | `Boutons.tsx` | `{ children, onClick?, disabled?, occupe?, icone?, teinte?: 'rouge'/'noir', compact?, etiquette? }` |
| `Champ` | `Champ.tsx` | `{ libelle, valeur, onChanger, erreur?, aide?, placeholder?, icone?, type?, inputmode?, enterkeyhint?, onEntree?, reference? }` |
| `Feuille` | `Feuille.tsx` | `{ ouverte, onFermer, titre?, children }` ; `ContenuFeuille` pour les tests |
| `EtatVide` | `EtatVide.tsx` | `{ icone, titre, message?, action?: { libelle, onClick, icone?, secondaire? }, teinte?, compact? }` |

`teinte` d'une `CarteListe` ou d'un `EtatVide` : un statut (`valide`, `traite`,
`expire`, `annule`), `rouge` ou `neutre` ; c'est elle qui colore le cercle
d'icône, par les classes partagées `.ipm-cercle--*`.

Briques complémentaires :

- `StatutBadge` `{ statut, taille?, icone?, surMarque? }` : puce de statut ; les
  couleurs viennent des jetons `--st-*`, jamais du composant.
- `LogoSar` `{ largeur?, ton?: 'rouge'/'blanc' }` : le logo officiel ; `blanc`
  est un filtre CSS, pas un second fichier à charger.
- `Avatar` `{ nom, taille?, ton?: 'douce'/'marque' }` : initiales dans un rond de
  couleur stable ; `marque` sur un bandeau (verre blanc translucide).
- `SqueletteListe` `{ lignes?, avatar? }`, `SqueletteCarte` `{ hauteur? }`,
  `SqueletteTexte` `{ lignes? }` (`Skeletons.tsx`).
- `OfflineBanner` `{ synchroniseLe?, forcer? }` : invisible en ligne.
- `useNouveauBon()` (`NouveauBonModal.tsx`) → `{ ouvrirNouveauBon }`.
- `MiseAJour` : service worker + toast « nouvelle version » (monté par App).
- `EmptyState` : **déprécié**, simple traduction vers `EtatVide`. Ne pas
  l'employer dans du code neuf.

### Squelette d'un écran

```tsx
<IonPage className="mes-documents">
  <IonContent fullscreen>
    <IonRefresher slot="fixed" onIonRefresh={actualiser}>
      <IonRefresherContent />
    </IonRefresher>

    <BandeauMarque titre="Mes documents" onRetour={() => routeur.goBack()} />

    <section className="ipm-section">
      <div className="ipm-entete-section">
        <h2 className="ipm-titre-section">Octobre 2025</h2>
      </div>
      <div className="ipm-pile">
        {bons.map((bon, rang) => (
          <CarteListe key={bon.id} rang={rang} routerLink={`/bons/${bon.id}`} … />
        ))}
      </div>
    </section>

    {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
    <div className="ipm-bas-page" />
  </IonContent>
</IonPage>
```

## Utilitaires

- `hooks/useOnline.ts` : `useOnline()` → booléen (désactiver la création hors ligne).
- `hooks/haptique.ts` : `haptique.leger() | selection() | succes() | erreur() | avertissement()`.
- `utils/format.ts` : `dateCourte`, `dateMoyenne`, `dateLongue`, `dateRelative`,
  `dateHeure`, `lireDate`, `versDateISO`, `aujourdhuiISO`, `ajouterJours`,
  `ecartJours`, `age`, `premierPrenom`, `capitaliser`, `initiales`, `pluriel`,
  `telephone`. **Ne jamais faire `new Date('AAAA-MM-JJ')`** (décalage de fuseau).
- `utils/statut.ts` : `STATUTS`, `infoStatut(statut)` → `{ libelle,
  libellePluriel, couleur, icone, explication }`, `ORDRE_STATUTS`,
  `joursRestants`, `libelleValidite`.
- `utils/plateforme.ts` : `estIOS()`, `estAndroid()`, `estInstallee()`.
- `utils/installation.ts` : `useInstallation()` → `{ possible, installee, proposer }`.

## Style attendu — la charte (SPEC_DESIGN)

**Interdits, sans exception** (§1) : filet ou bordure entre deux lignes de
liste (`IonItem lines`, `border-bottom`) ; bloc collé au bord de l'écran ;
rayon inférieur à 14 px sur un conteneur ; rangée « libellé à gauche / valeur
à droite » pour des informations personnelles ; `ion-segment` ; grande toolbar
Ionic au titre noir sur fond gris ; écran entièrement gris ou blanc, sans une
seule surface de marque ; couleur en dur dans une page.

**Jetons** (`theme/variables.css`), à employer partout :

| Famille | Noms |
|---|---|
| couleurs | `--ipm-rouge`, `--ipm-rouge-fonce`, `--ipm-rouge-doux`, `--ipm-rouge-texte`, `--ipm-noir`, `--ipm-graphite`, `--ipm-fond`, `--ipm-surface`, `--ipm-surface-2`, `--ipm-bordure`, `--ipm-texte`, `--ipm-texte-doux` |
| statuts | `--st-valide`, `--st-traite`, `--st-expire`, `--st-annule`, chacun avec `-doux` (fond à 12 %) et `-texte` (lisible, niveau AA) |
| dégradés | `--deg-marque` (noir SAR), `--deg-rouge`, `--deg-pied` |
| rayons | `--r-xs:10` `--r-sm:14` `--r-md:18` `--r-lg:22` `--r-xl:26` `--r-2xl:32` `--r-pill` |
| ombres | `--ombre-1` `--ombre-2` `--ombre-3` `--ombre-rouge` |
| espacements | `--e-4` … `--e-32`, `--gouttiere:16`, `--inter-cartes:12`, `--inter-sections:28`, `--bas-page:104`, `--chevauchement:24` |
| typographie | `--t-display` `--t-titre` `--t-sous-titre` `--t-section` `--t-corps` `--t-secondaire` `--t-puce` (Satoshi) |
| mouvement | `--mvt-appui:120ms`, `--mvt-appui-echelle:.97`, `--mvt-entree:200ms`, `--mvt-decalage:30ms`, `--mvt-courbe` |

Concentricité des rayons : rayon intérieur = rayon extérieur − marge
intérieure (carte de 22 avec 8 de marge → 14).

**Utilitaires** (`theme/global.css`) : `.ipm-gouttiere`, `.ipm-pile` (cartes
autonomes espacées de 12), `.ipm-section`, `.ipm-entete-section` +
`.ipm-titre-section` + `.ipm-lien-section`, `.ipm-carte`, `.ipm-chiffres`
(chiffres tabulaires), `.ipm-appui` (`scale(.97)` au toucher), `.ipm-entree`
(apparition échelonnée, avec `style={{ '--rang': i }}`), `.ipm-bas-page` (le
vide que réclame la barre d'onglets flottante), `.ipm-zone-sure`.

**Anciens noms** encore définis en alias (`--ipm-rayon`, `--ipm-carte`,
`--ipm-espace-*`, `--ipm-ombre-*`, `--ipm-texte-secondaire`…) : ils existent
pour ne pas casser les écrans pas encore repris par la refonte. Ne pas s'en
servir dans du code neuf.

**Mode sombre** : jamais de couleur en dur hors `theme/variables.css`, et la
palette d'Ionic se redéfinit sur `:root, :root.ios, :root.md` — sans ces deux
derniers sélecteurs, ses propres fonds l'emportent. À vérifier en capture.

Haptique sur les gestes qui comptent (`hooks/haptique.ts`, déjà appelée par les
composants de la charte) ; toasts courts ; confirmations par
`IonActionSheet` / `IonAlert` ; `IonDatetime` en roues pour les dates.

## Icônes et écran de lancement

`scripts/generer-icones.py` (Pillow) produit `public/icons/*`,
`public/favicon.ico` et `public/splash/*` **à partir de `public/logo-sar.png`**,
posé sur les deux dégradés de la charte. Les PNG sont versionnés : ne relancer
le script que si le logo ou la charte changent, et recopier alors dans
`index.html` les balises `apple-touch-startup-image` qu'il imprime.

```powershell
python -m pip install pillow
python scripts/generer-icones.py
```

`theme_color` et `background_color` (manifest, `vite.config.ts`) et les
`<meta name="theme-color">` d'`index.html` valent tous `#1D1D1B`, haut de
`--deg-marque` : chaque écran commence par un bandeau de marque, la barre
d'état se pose dessus, en clair comme en sombre.

## Tests

- `npm test` (Vitest + jsdom + fake-indexeddb). Tests à côté du code :
  `MesBons.test.tsx`. Données : `src/test/fabriques.ts` (`unBon()`,
  `unParticipant()`, `unMoi()`, `unFournisseur()`, `uneSpecialite()`,
  `reponseJson()`). Simuler l'API avec
  `configurerClient({ fetch: vi.fn(...), jeton: 'J', apiBase: '/api' })`.
- `npm run lint`, `npm run typecheck`, `npm run build` doivent rester verts.
- E2E : `e2e/*.spec.ts`, `npm run e2e` (Edge installé, projets `iphone-13` et
  `pixel-7`), backend sur une **copie** de la base.
- Développement : `npm run dev` (port 5174, `/api` relayé vers Django 127.0.0.1:8000).
