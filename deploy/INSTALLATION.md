# Déploiement IPM sur IIS

> Hébergement cloud (fronts sur Vercel, API sur Render) : voir [CLOUD.md](CLOUD.md).

Mise en réseau local de l'application sur le serveur **SAR-INTEGRATION**
(10.113.243.179), en HTTP sur le port 80.

## Principe

Une seule origine, un seul port :

```
http://10.113.243.179/          → C:\inetpub\ipm            (front, fichiers statiques)
http://10.113.243.179/static/*  → backend\staticfiles       (habillage de /admin/)
http://10.113.243.179/api/*     ─┐ proxy inverse (ARR)
http://10.113.243.179/admin/*   ─┘ → http://127.0.0.1:8000  (Django + waitress)
```

Le front et l'API partageant l'origine, aucune requête n'est inter-origine :
pas de CORS à régler, rien à reconstruire si l'adresse du serveur change —
l'URL de l'API est le chemin relatif `/api` (cf. `.env.production`).

Django écoute sur 127.0.0.1 seulement : il n'est joignable qu'à travers IIS.

Aucune règle de repli SPA n'est nécessaire : l'application navigue en
`HashRouter` (`/#/participants`), donc IIS ne voit jamais qu'une seule URL.

## Prérequis

Installés une fois pour toutes :

```powershell
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
choco install urlrewrite iis-arr nssm -y
```

## Installation — à ne faire qu'une fois

Tout ce qui suit se lance dans **PowerShell en administrateur**.

### 1. Activer le proxy inverse

```powershell
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'

# Django doit voir l'hôte demandé par le navigateur (10.113.243.179) et non
# « 127.0.0.1:8000 » : c'est cet en-tête qu'il compare à ALLOWED_HOSTS.
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'preserveHostHeader' -Value 'True'
```

### 2. Créer le site

```powershell
Import-Module WebAdministration

# Le site par défaut occupe le port 80.
Stop-Website 'Default Web Site'
Set-ItemProperty 'IIS:\Sites\Default Web Site' -Name serverAutoStart -Value $false

New-Item -ItemType Directory -Force -Path C:\inetpub\ipm | Out-Null

# « No Managed Code » : le site ne sert que des fichiers et un proxy, ASP.NET
# n'a rien à y faire.
New-WebAppPool -Name 'IPM'
Set-ItemProperty 'IIS:\AppPools\IPM' -Name managedRuntimeVersion -Value ''

New-Website -Name 'IPM' -PhysicalPath 'C:\inetpub\ipm' -Port 80 -ApplicationPool 'IPM'

# Les statiques de Django restent dans l'arborescence du projet : un répertoire
# virtuel évite de les dupliquer à chaque publication.
New-WebVirtualDirectory -Site 'IPM' -Name 'static' `
  -PhysicalPath 'C:\deploy\IPM\backend\staticfiles'

# Droits de lecture pour le pool d'applications.
icacls C:\inetpub\ipm /grant 'IIS AppPool\IPM:(OI)(CI)(RX)' /T
icacls C:\deploy\IPM\backend\staticfiles /grant 'IIS AppPool\IPM:(OI)(CI)(RX)' /T
```

### 3. Django en service Windows

waitress remplace le serveur de développement ; NSSM le déclare en service,
ce qui le fait redémarrer au démarrage de la machine et après un incident.

```powershell
New-Item -ItemType Directory -Force -Path C:\deploy\IPM\backend\logs | Out-Null

nssm install IPM-Backend `
  'C:\deploy\IPM\backend\venv\Scripts\waitress-serve.exe' `
  '--listen=127.0.0.1:8000 config.wsgi:application'

# manage.py et db.sqlite3 se résolvent depuis ce dossier.
nssm set IPM-Backend AppDirectory C:\deploy\IPM\backend
nssm set IPM-Backend DisplayName 'IPM - Backend Django'
nssm set IPM-Backend Description 'API Django de l''application IPM, servie par waitress.'
nssm set IPM-Backend Start SERVICE_AUTO_START
nssm set IPM-Backend AppStdout C:\deploy\IPM\backend\logs\service.log
nssm set IPM-Backend AppStderr C:\deploy\IPM\backend\logs\service.log
nssm set IPM-Backend AppRotateFiles 1

Start-Service IPM-Backend
```

### 4. Ouvrir le pare-feu

```powershell
New-NetFirewallRule -DisplayName 'IPM - HTTP 80' -Direction Inbound `
  -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain
```

### 5. Publier

```powershell
C:\deploy\IPM\deploy\publier.ps1
```

## Publications suivantes

Après toute modification du code, une seule commande — elle reconstruit le
front, rassemble les statiques, recopie vers la racine du site et redémarre le
backend :

```powershell
C:\deploy\IPM\deploy\publier.ps1
```

## Vérification

```powershell
Invoke-WebRequest http://10.113.243.179/ -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://10.113.243.179/api/donnees-de-base/types-beneficiaires/ -UseBasicParsing | Select-Object StatusCode
```

Depuis un poste du réseau : <http://10.113.243.179/>

## Points à connaître

- **Le site est ouvert à tout le réseau local, sans authentification.** Le
  frontend attend `/api/auth/login/`, `/api/auth/me/` et `/api/auth/logout/`
  (cf. `src/services/api.js`), mais le backend ne monte que
  `api/donnees-de-base/` : il n'y a pas encore d'API d'authentification, et DRF
  est configuré en `AllowAny`. À traiter avant tout usage avec de vraies
  données.
- **HTTP en clair.** Pas de certificat, donc pas de HTTPS : les échanges sont
  lisibles sur le réseau. `manage.py check --deploy` le signale par quatre
  avertissements (`SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT`,
  `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`), tous liés à cette absence.
- **SQLite.** Convient à quelques utilisateurs simultanés ; au-delà, les
  écritures concurrentes se bloquent entre elles et il faudra passer à
  PostgreSQL.
- **`backend\.env` n'est pas versionné** (il porte la clé secrète). Le
  reconstituer à partir de `backend\.env.example` sur un nouveau serveur.

## Journaux

| Quoi | Où |
| --- | --- |
| Backend Django | `C:\deploy\IPM\backend\logs\service.log` |
| Accès IIS | `C:\inetpub\logs\LogFiles\W3SVC<id>\` |
| État du service | `Get-Service IPM-Backend` |
