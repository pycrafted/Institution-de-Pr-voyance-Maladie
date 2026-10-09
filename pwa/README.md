# IPM Mobile

PWA des bons de pharmacie pour les participants de l'IPM SAR : identification
par matricule et date de naissance, création d'un bon en 5 étapes, affichage
et partage du PDF officiel, consultation hors ligne.

Site à part entière : aucun code commun avec le front IPM (`src/` à la racine
du dépôt). Il ne parle à IPM que par l'API HTTP `/api/mobile/`
(`backend/apps/mobile/`).

## Pile

Vite, React 18, TypeScript strict, Ionic React 8 (mode `ios` sur iPhone, `md`
sur Android), vite-plugin-pwa (Workbox), pdfjs-dist, idb-keyval. Tests :
Vitest + Testing Library, Playwright (émulation iPhone 13 et Pixel 7 dans Edge).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (port 5174, `/api` relayé vers Django) |
| `npm run lint` / `npm run typecheck` | ESLint, `tsc -b` |
| `npm test` | tests unitaires et de composants (jsdom) |
| `npm run build` | build dans `dist/` (manifest, `sw.js`, précache) |
| `npm run preview` | sert `dist/` (port 4174, `/api` relayé) |
| `npm run e2e` | scénarios Playwright, cf. `e2e/README.md` |

`/api` est relayé vers `http://127.0.0.1:8000`, ou vers `IPM_API_CIBLE` si la
variable est définie (Django de test des e2e sur 8010).

## Configuration

`public/config.json` est lu au démarrage (`src/api/config.ts`) : `apiBase` vaut
`/api` en développement. En production, `deploy/publier.ps1 -ApiBase` le
réécrit (par défaut `https://sar-integration.sar.sn/api`). Le service worker
le sert en NetworkFirst : l'adresse de l'API change sans nouveau build.

## Architecture

Voir `ARCHITECTURE-DEV.md` : client API (`src/api/`), session
(`src/session/`), liste partagée des bons (`src/data/bons.ts`), cache hors
ligne (`src/offline/`), écrans (`src/pages/`), et la charte visuelle —
jetons (`src/theme/variables.css`) et dix composants imposés
(`src/components/`).

## Les services de l'accueil

L'accueil ne fait qu'afficher **`src/services/catalogue.ts`**, qui déclare
DEUX familles, jamais mélangées (SPEC_DESIGN §4) :

- **`DOCUMENTS`** — les types de bons demandables. Ce sont les grandes cartes
  de service sur deux colonnes, le cœur de l'écran.
- **`RACCOURCIS`** — les écrans utilitaires (mes documents, pharmacies,
  assistance, profil), en petits cercles sous la grille.

```ts
// DOCUMENTS
{
  cle: 'bon-optique',        // identifiant stable (clé React, sélecteur de test)
  libelle: "Bon d'optique",  // court, deux lignes au plus sur la carte
  description: "…",          // phrase expliquée dans la feuille « Bientôt »
  icone: eyeOutline,         // ionicons
  route: null,               // chemin, ROUTE_ASSISTANT, ou null
  disponible: false,
}
```

Quatre documents sont produits par l'IPM ; l'API mobile n'en expose qu'un
aujourd'hui. Les trois autres (`bon-optique`, `lettre-garantie`,
`hospitalisation`) sont donc déclarés `disponible: false` : leur carte passe
au noir de marque, porte la puce « Bientôt » et ouvre au toucher une feuille
qui explique que le document se demande pour l'instant auprès de l'IPM.

### Ouvrir un nouveau service

1. Côté backend, exposer le point d'entrée dans `backend/apps/mobile/`.
2. Ajouter la fonction correspondante au client `src/api/`.
3. Écrire l'écran dans `src/pages/`, avec les composants de la charte, et
   déclarer sa route dans `src/App.tsx` (y compris dans `CHEMINS_IDENTIFIE`,
   sans quoi la garde renvoie à l'accueil).
4. Dans `src/services/catalogue.ts`, passer l'entrée de **`DOCUMENTS`** à
   `disponible: true` et renseigner `route` (ou `ROUTE_ASSISTANT` si c'est un
   assistant modal). Un cinquième type s'ajoute de la même façon : la grille
   à deux colonnes l'accepte sans retouche.

Aucun autre fichier n'est à toucher : la grille, la rangée de raccourcis et
la feuille « Bientôt » suivent le catalogue.

## Icônes, écran de lancement, couleurs

`scripts/generer-icones.py` (Pillow) régénère `public/icons/`,
`public/favicon.ico` et `public/splash/` à partir de `public/logo-sar.png`.
Les PNG produits sont versionnés ; relancer seulement si le logo ou la charte
changent. Cf. `ARCHITECTURE-DEV.md`, « Icônes et écran de lancement ».

## Déploiement

Voir `deploy/INSTALLATION.md` (site IIS « IPM-Mobile » en HTTPS sur 8443).
