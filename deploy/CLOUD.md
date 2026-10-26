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
5. **Modèles PDF officiels** (hors dépôt : en-tête SAR, cachet). Les Secret
   Files de Render ne prennent que du texte : chaque PDF y est déposé **encodé
   en base64**, sous le nom du fichier suivi de `.b64` (`bon_pharmacie.pdf.b64`,
   `bon_optique.pdf.b64`, `lettre_garantie.pdf.b64`). Render les place sous
   `/etc/secrets/` (`IPM_MODELES_DIR`), et `documents/modeles.py` les décode au
   premier usage. Par l'API, depuis `backend/apps/documents/modeles/` :

   ```
   python -c "import base64,json,sys; print(json.dumps([{'name': n+'.b64', 'content': base64.b64encode(open(n,'rb').read()).decode()} for n in sys.argv[1:]]))" bon_pharmacie.pdf bon_optique.pdf lettre_garantie.pdf > secrets.json
   curl -X PUT -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" https://api.render.com/v1/services/<srv>/secret-files -d @secrets.json
   ```

   (`PUT` remplace la liste entière.) Sans eux, l'impression d'un bon répond
   503 « Modèle PDF absent » ; tout le reste fonctionne.

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

## Vraies données

Depuis le 26 octobre 2026, la base Render est une **restauration de `ipm_dev`**,
la base de développement aux vraies données (dump `dump/ipm_dev-20261023.dump`,
hors dépôt : `*.dump` et `*.sql` sont ignorés par git). Les seeds de
démonstration du build (`IPM_JEU_DEMO`) sont désactivés et doivent le rester.

Le dump LAMPS d'origine (`lamps.dump`, base `db_sar`) est aussi chargé dans la
même base, **dans un schéma à part `lamps`**, qui tient le rôle de la base
d'analyse `lamps_analyse` du poste de développement. Django ne regarde que
`public` (`search_path=public` dans `settings.py`) ; les commandes
`importer_*` peuvent lire `lamps` en passant `PGOPTIONS="-c search_path=lamps"`
et les options `--hote --port --base --utilisateur --motdepasse` de la base
Render elle-même.

### Remettre une nouvelle sauvegarde de `ipm_dev`

Depuis un poste autorisé (Render → `ipm-db` → *Access Control* : ajouter l'IP
du poste, la retirer après), avec `psql` :

```
pg_dump -Fp --no-owner --no-privileges ipm_dev > ipm_dev.sql    # sur le poste de dev
psql "<chaîne externe>" -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = current_user and pid <> pg_backend_pid()"
( echo "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; grep -v '^SET transaction_timeout' ipm_dev.sql )   | psql "<chaîne externe>" -v ON_ERROR_STOP=1 --single-transaction
```

Le schéma `lamps` n'est pas touché. Vérifier ensuite `python manage.py migrate --check`
avec `DATABASE_URL` : le dump doit porter les mêmes migrations que le code déployé.

Ces données sont nominatives : ne jamais commiter un dump, et retirer l'IP du
poste de l'*Access Control* après l'opération.

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
