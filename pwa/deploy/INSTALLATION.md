# Déploiement du PWA « IPM Mobile » sur IIS

Mise en ligne de l'application mobile des bons de pharmacie sur le serveur
**SAR-INTEGRATION** (10.113.243.179), en HTTPS.

## Principe

Deux origines distinctes, comme en production future :

```
https://sar-integration.sar.sn:8443/     → C:\inetpub\ipm-mobile   (site « IPM-Mobile », PWA statique)
https://sar-integration.sar.sn/api/*     → site « IPM » (binding :443 ajouté)
                                           → proxy inverse (ARR) → http://127.0.0.1:8000 (Django)
http://10.113.243.179/                   → site « IPM », inchangé (HTTP :80)
```

- Le PWA ne contient **aucun relais vers Django** : il lit l'adresse de l'API
  au démarrage dans `/config.json` (écrit par `publier.ps1 -ApiBase`). Il
  pourra donc être hébergé ailleurs sans reconstruction.
- PWA et API n'ayant pas la même origine (le port diffère), le navigateur
  applique le CORS : l'origine `https://sar-integration.sar.sn:8443` doit
  figurer dans `DJANGO_CORS_ORIGINS` (`backend\.env`).
- **HTTPS obligatoire** : sans lui, un téléphone n'installe pas l'application
  et n'active pas le service worker (mode hors-ligne). Le certificat est le
  générique `*.sar.sn` (`pfx\wildcard2_sar_sn.pfx`) ; il couvre
  `sar-integration.sar.sn`, **pas l'adresse IP** : les téléphones doivent
  utiliser le nom.
- Ionic navigue en `BrowserRouter` (`/bons/12`) : `web.config` renvoie
  `index.html` pour toute URL qui n'est pas un fichier (repli SPA).

## Prérequis

Déjà en place pour le site IPM (voir `deploy\INSTALLATION.md`) :

- IIS, avec les modules **URL Rewrite** (requis par le repli SPA) et **ARR** ;
- le site « IPM » et le service `IPM-Backend` ;
- Node.js et npm (build du PWA).

Le nom `sar-integration.sar.sn` doit se résoudre en 10.113.243.179 sur les
téléphones (DNS de l'entreprise ou Wi-Fi interne).

## Installation — à ne faire qu'une fois

Tout ce qui suit se lance dans **PowerShell en administrateur**.

### 1. Importer le certificat et créer le site

Au choix :

```powershell
# a) Le script importe le .pfx ; le mot de passe est demandé en saisie masquée.
C:\deploy\IPM\pwa\deploy\installer.ps1 -Pfx C:\deploy\IPM\pfx\wildcard2_sar_sn.pfx
```

```powershell
# b) Import manuel, puis installation avec l'empreinte du certificat.
$mdp = Read-Host 'Mot de passe du pfx' -AsSecureString
Import-PfxCertificate -FilePath C:\deploy\IPM\pfx\wildcard2_sar_sn.pfx `
  -CertStoreLocation Cert:\LocalMachine\My -Password $mdp
Get-ChildItem Cert:\LocalMachine\My | Format-List Subject, DnsNameList, NotAfter, Thumbprint

C:\deploy\IPM\pwa\deploy\installer.ps1 -Empreinte <Thumbprint>
```

Le script est idempotent : on peut le relancer sans risque, par exemple au
renouvellement du certificat (il remplace alors le certificat sur les deux
ports). Il :

1. vérifie le certificat — clé privée présente, non expiré, couvre
   `sar-integration.sar.sn` — et range ses intermédiaires dans le magasin
   « Autorités intermédiaires » pour qu'IIS présente la chaîne complète aux
   téléphones ;
2. crée le pool « IPM-Mobile » (No Managed Code) et le site « IPM-Mobile »
   (`C:\inetpub\ipm-mobile`, https `*:8443`) ;
3. ajoute un binding https `*:443` au site « IPM » avec le même certificat
   (le binding HTTP :80 n'est pas touché) ;
4. ouvre le pare-feu en entrée sur 443 et 8443 (profils Domaine et Privé) ;
5. donne à `IIS AppPool\IPM-Mobile` le droit de lecture sur la racine ;
6. démarre le site et teste la négociation TLS sur les deux adresses.

Lancé sans `-Empreinte` ni `-Pfx`, il s'arrête sans rien modifier et rappelle
ces deux commandes.

Une fois le certificat importé, **sortir le .pfx de l'arborescence du
projet** (il contient la clé privée ; `pfx/` est ignoré par git, mais le
fichier n'a rien à faire sur le serveur).

### 2. Autoriser l'origine du PWA côté Django

Dans `backend\.env` :

```
DJANGO_CORS_ORIGINS=...,https://sar-integration.sar.sn:8443,https://sar-integration.sar.sn
```

puis redémarrer le backend (`Restart-Service IPM-Backend`, ou
`deploy\publier.ps1`).

### 3. Publier

```powershell
C:\deploy\IPM\pwa\deploy\publier.ps1 -IgnorerSslNpm
```

## Publications suivantes

Après toute modification du PWA :

```powershell
C:\deploy\IPM\pwa\deploy\publier.ps1 -IgnorerSslNpm
```

Le script installe les dépendances à l'identique (`npm ci`), reconstruit
l'application (`npm run build` → `pwa\dist`), vérifie que le build contient
`index.html`, `sw.js` et `manifest.webmanifest`, puis recopie le tout vers
`C:\inetpub\ipm-mobile` (`robocopy /MIR`). Il y écrit ensuite :

- `web.config`, depuis `pwa\deploy\web.config` (source de vérité), avec la
  directive `connect-src` de la CSP ajustée à l'origine de l'API ;
- `config.json`, avec `apiBase` = `-ApiBase`.

Options :

| Option | Effet |
| --- | --- |
| `-ApiBase <url>` | Adresse de l'API écrite dans `config.json` (défaut `https://sar-integration.sar.sn/api`). Doit être en HTTPS. |
| `-IgnorerSslNpm` | Désactive la vérification SSL de npm **le temps de `npm ci` seulement** : le pare-feu Fortinet intercepte le TLS de registry.npmjs.org. Les empreintes d'intégrité de `package-lock.json` restent vérifiées. |
| `-SansNpmCi` | Saute `npm ci` (dépendances déjà à jour). |
| `-RacineSite <dossier>` | Racine du site (défaut `C:\inetpub\ipm-mobile`). |

Le backend n'est pas redémarré : le PWA ne contient aucun code serveur. Les
téléphones prennent la nouvelle version au lancement suivant de
l'application (le service worker se met à jour de lui-même).

## Vérification

```powershell
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'
Invoke-WebRequest https://sar-integration.sar.sn:8443/ -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://sar-integration.sar.sn:8443/manifest.webmanifest -UseBasicParsing | Select-Object StatusCode, @{n='Type';e={$_.Headers['Content-Type']}}
Invoke-WebRequest https://sar-integration.sar.sn:8443/config.json -UseBasicParsing | Select-Object -ExpandProperty Content
# Repli SPA : une route profonde renvoie index.html (200), un fichier absent une vraie 404.
Invoke-WebRequest https://sar-integration.sar.sn:8443/bons/1 -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://sar-integration.sar.sn/api/mobile/identification/ -Method Options `
  -Headers @{ Origin = 'https://sar-integration.sar.sn:8443'; 'Access-Control-Request-Method' = 'POST' } `
  -UseBasicParsing | Select-Object StatusCode, @{n='CORS';e={$_.Headers['Access-Control-Allow-Origin']}}
```

Sur un téléphone du réseau : ouvrir <https://sar-integration.sar.sn:8443/>,
puis « Installer l'application » (Android) ou « Partager → Sur l'écran
d'accueil » (iPhone, depuis Safari).

## En-têtes servis

| Fichiers | Cache |
| --- | --- |
| `sw.js`, `index.html`, `config.json`, `manifest.webmanifest` et tout le reste | `no-cache` : revérifiés à chaque usage (réponse 304 légère si inchangés) |
| `/assets/*` (noms hachés) | `max-age` un an, `immutable` |

Sécurité : `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (caméra, micro,
géolocalisation… refusés ; le partage reste permis), `X-Frame-Options: DENY`
et une `Content-Security-Policy` qui n'autorise que les scripts du site, le
worker de pdf.js et les appels vers l'origine de l'API.

## Points à connaître

- **Pas de HSTS.** `Strict-Transport-Security` vaut pour tout le nom d'hôte,
  tous ports confondus : il forcerait aussi le HTTPS sur le site IPM (port 80),
  ce qui n'est pas décidé.
- **Django ne sait pas que la requête est arrivée en HTTPS** : IIS relaie en
  HTTP vers 127.0.0.1:8000. Sans conséquence pour une API à jeton (pas de
  cookie de session ni de CSRF) ; à traiter (`X-Forwarded-Proto` +
  `SECURE_PROXY_SSL_HEADER`) si Django doit un jour produire des URL
  absolues en `https://`.
- **Le certificat ne couvre pas l'adresse IP.** `https://10.113.243.179:8443/`
  affichera une alerte de sécurité ; seul le nom est valable.
- **Renouvellement du certificat** : importer le nouveau .pfx avec
  `installer.ps1 -Pfx ...` ; les deux ports basculent sur le nouveau
  certificat.
- **Pare-feu Fortinet et npm** : `-IgnorerSslNpm` est une variable
  d'environnement éphémère, jamais un `.npmrc`. Le jour où le certificat
  racine Fortinet est installé (`npm config set cafile ...`), l'option
  devient inutile.

## Journaux

| Quoi | Où |
| --- | --- |
| Accès IIS | `C:\inetpub\logs\LogFiles\W3SVC<id>\` (id : `(Get-Website IPM-Mobile).Id`) |
| Liaisons TLS | `netsh http show sslcert` |
| État du site | `Get-WebsiteState IPM-Mobile` |
