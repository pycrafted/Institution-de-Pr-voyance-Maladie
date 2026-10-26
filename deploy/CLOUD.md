# Déploiement cloud : Vercel (fronts) + Render (API)

Trois déploiements indépendants, depuis le même dépôt GitHub
(`pycrafted/Institution-de-Pr-voyance-Maladie`, branche `main`), mis en place le
24 octobre 2026 :

| Quoi | Dossier | Hébergeur | Adresse |
| --- | --- | --- | --- |
| API Django | `backend/` | Render (web service `ipm-api` + PostgreSQL `ipm-db`) | `https://ipm-api-5e19.onrender.com` |
| Application IPM (gestion) | racine (`src/`) | Vercel, projet `ipm-app` | `https://ipm-app-phi.vercel.app` |
| IPM Mobile (PWA) | `pwa/` | Vercel, projet `ipm-mobile` (Root Directory `pwa`) | `https://ipm-mobile.vercel.app` |

Contrairement à IIS (une seule origine, `/api` relayé), les fronts appellent
ici l'API **sur une autre origine** : l'adresse de l'API est fixée au build
(`VITE_API_BASE` pour l'application, `IPM_API_BASE` pour la PWA) et Django
autorise ces deux origines par CORS (`DJANGO_CORS_ORIGINS`). L'API est
d'abord déployée, puisque les fronts ont besoin de son adresse.

## 1. API sur Render

Fichiers : `render.yaml` (Blueprint), `backend/build.sh`,
`backend/config/settings.py` (variables `RENDER_EXTERNAL_HOSTNAME`,
`DATABASE_URL`, WhiteNoise pour `/static/`).

1. Sur <https://dashboard.render.com> : **New → Blueprint**, choisir le dépôt,
   branche `main`. Render lit `render.yaml` et propose de créer le service
   `ipm-api` et la base `ipm-db`.
2. Renseigner les variables demandées :
   - `DJANGO_CORS_ORIGINS` : laisser vide pour l'instant (on ne connaît pas
     encore les adresses Vercel), ou mettre un `-`.
   - `DJANGO_SUPERUSER_USERNAME`, `DJANGO_SUPERUSER_EMAIL`,
     `DJANGO_SUPERUSER_PASSWORD` : le premier compte. **C'est l'email qui sert
     à se connecter** au front (`src/services/api.js` envoie `email` +
     `password`).
3. **Apply.** Le premier build prend quelques minutes : `build.sh` installe les
   dépendances, rassemble les statiques, migre la base, charge les
   référentiels (`seed_donnees_de_base`) et crée le compte.
4. Noter l'adresse du service : **Settings → URL** (`https://ipm-api.onrender.com`
   si le nom était libre, sinon Render ajoute un suffixe). Vérifier :
   - `https://<api>/admin/login/` → page de connexion habillée (statiques OK) ;
   - `https://<api>/api/auth/me/` → `401` en JSON (API vivante et fermée).
5. **Modèles PDF officiels** (hors dépôt : en-tête SAR, cachet). Dans le
   service → **Environment → Secret Files**, ajouter les trois fichiers avec
   exactement ces noms : `bon_pharmacie.pdf`, `bon_optique.pdf`,
   `lettre_garantie.pdf`. Render les place sous `/etc/secrets/`, dossier que
   `IPM_MODELES_DIR` désigne déjà. Sans eux, l'impression d'un bon répond 500 ;
   tout le reste fonctionne.

Une fois les deux fronts en ligne, revenir ici (**Environment**) et renseigner
`DJANGO_CORS_ORIGINS` avec leurs deux origines exactes, séparées par une
virgule, sans `/` final :

```
https://ipm-app-phi.vercel.app,https://ipm-mobile.vercel.app
```

Render redéploie seul après la modification.

## 2. Application IPM sur Vercel (projet n° 1)

Fichier : `vercel.json` à la racine (build Vite vers `build/`, repli SPA pour
`BrowserRouter`, en-têtes de cache).

1. Sur <https://vercel.com/new> : importer le dépôt GitHub.
2. **Root Directory** : laisser la racine. Framework détecté : Vite.
3. **Environment Variables** :
   - `VITE_API_BASE` = `https://<api>/api` (adresse Render, **avec `/api`**,
     sans `/` final). Elle prime sur le `/api` de `.env.production`, qui reste
     réservé à IIS.
4. **Deploy**, puis noter l'adresse (`https://<projet>.vercel.app`). Le nom du
   projet se change dans **Settings → General** ; l'adresse suit.

## 3. IPM Mobile sur Vercel (projet n° 2)

Fichier : `pwa/vercel.json` (build vers `dist/`, `sw.js` jamais mis en cache
par le navigateur, repli SPA). `pwa/scripts/ecrire-config.mjs` tourne après
chaque build (`postbuild`) et écrit l'adresse de l'API dans `dist/config.json`
quand `IPM_API_BASE` est définie ; `public/config.json` garde `/api` pour le
développement.

1. <https://vercel.com/new> : importer **le même dépôt** une seconde fois
   (Vercel accepte plusieurs projets par dépôt).
2. **Root Directory** : `pwa` (bouton *Edit* à côté du dépôt). Framework : Vite.
3. **Environment Variables** :
   - `IPM_API_BASE` = `https://<api>/api`.
4. **Deploy**, puis noter l'adresse.

`pwa/.npmrc` fait installer les paquets depuis le miroir npmmirror : cela
fonctionne tel quel sur Vercel (le verrou `package-lock.json` fige les
empreintes).

## 4. Boucler : CORS

Retour sur Render → `ipm-api` → **Environment** → `DJANGO_CORS_ORIGINS` avec les
deux adresses Vercel (étape 1, dernier paragraphe). Tant que ce n'est pas fait,
les fronts se chargent mais chaque appel API échoue dans le navigateur
(« blocked by CORS policy »).

Pour les prévisualisations Vercel (une adresse par branche), ajouter la
variable `DJANGO_CORS_ORIGIN_REGEXES`, par exemple
`^https://ipm-app-[a-z0-9-]+\.vercel\.app$`.

## Vérification

- Application : `https://<app>/login` → se connecter avec l'email et le mot de
  passe du compte créé à l'étape 1 ; les listes de *Données de base* se
  remplissent.
- PWA : `https://<mobile>/` sur un téléphone → « Ajouter à l'écran d'accueil »
  est proposé (HTTPS, service worker actif) ; l'identification demande un
  participant existant (`remplir_donnees_demo` ou `seed_equipe_dsi` pour un
  jeu d'essai, à lancer depuis le **Shell** du service Render :
  `python manage.py remplir_donnees_demo`).

## Vraies données (reprise LAMPS)

Le dump PostgreSQL de l'application d'origine (`lamps.dump`, hors dépôt) est
chargé dans la base Render **dans un schéma à part, `lamps`** : le schéma
`public` reste celui de Django. Rien dans l'application ne lit `lamps`
directement ; il sert de base d'analyse et de source aux commandes de reprise.

Depuis un poste autorisé (Render → base `ipm-db` → *Access Control*, ajouter
l'IP du poste), avec `psql` et le pilote `psycopg2` installés :

1. `pg_restore --no-owner --no-privileges -f lamps.sql lamps.dump`, puis
   réécrire `public.` en `lamps.` dans le SQL (hors lignes de données), retirer
   les fonctions C de pgcrypto (`$libdir`) et `SET transaction_timeout`, et
   charger : `psql "<chaîne externe>" -v ON_ERROR_STOP=1 --single-transaction -f lamps_schema.sql`.
2. Exporter les deux tables que lisent les commandes de reprise, en latin-1 :
   `\copy (select * from lamps.fournisseurs) to 'lamps-fournisseurs.csv' csv header`
   et de même pour `lamps.plancompta` (exporter en UTF-8 puis convertir si un
   caractère typographique bloque).
3. Lancer les commandes contre Render, depuis `backend/` :
   `DATABASE_URL=<chaîne externe> python manage.py importer_adherents --fichier lamps-plancompta.csv`
   et `… importer_fournisseurs_soins --fichier lamps-fournisseurs.csv --purge`.

Fait le 26 octobre 2026 : 4 adhérents réels, 411 fournisseurs de soins réels.
Les participants et bénéficiaires réels n'ont pas de commande de reprise à ce
jour (`lamps.participants`, `lamps.beneficiaires`).

Ces données sont nominatives : retirer l'IP du poste de l'*Access Control*
après l'opération, et ne jamais commiter le dump ni les CSV.

## Mises à jour

Chaque `git push` sur `main` redéploie ce qui a changé : Render suit
`backend/` (tout commit redéploie le service), Vercel ne reconstruit un projet
que si son dossier a bougé (`ignoreCommand` dans chaque `vercel.json`).

## Points à connaître

- **Palier gratuit de Render** : le service s'endort après 15 min sans trafic
  et met 30 à 60 s à répondre au premier appel suivant. La base PostgreSQL
  gratuite **expire 30 jours après sa création** (ses données avec) ; passer
  au palier payant avant, ou exporter.
- **Disque éphémère** : rien d'écrit sur le disque du service ne survit à un
  déploiement. La base est à part (PostgreSQL), les modèles PDF en Secret
  Files ; l'application n'écrit rien d'autre.
- **Police Arial Black** absente sous Linux : l'en-tête des bons se compose en
  Helvetica gras (repli prévu dans `impression.py`).
- **Console d'administration** : `https://<api>/admin/`, avec le compte créé à
  l'étape 1. Les formulaires fonctionnent derrière le proxy de Render grâce à
  `SECURE_PROXY_SSL_HEADER` et `CSRF_TRUSTED_ORIGINS` (réglés d'office sur le
  nom Render).
- **Nom de domaine propre** : sur Render, l'ajouter en *Custom Domain* puis
  compléter `DJANGO_ALLOWED_HOSTS` et `DJANGO_CSRF_TRUSTED_ORIGINS` ; sur
  Vercel, l'ajouter au projet puis le reporter dans `DJANGO_CORS_ORIGINS`.
