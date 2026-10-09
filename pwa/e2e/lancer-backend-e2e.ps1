<#
.SYNOPSIS
  Lance un Django de test pour les scénarios e2e d'IPM Mobile, sur une COPIE
  de la base (jamais backend/db.sqlite3, partagée avec le serveur de test).

.DESCRIPTION
  - copie backend/db.sqlite3 dans -Dossier (hors du dépôt) ;
  - écrit un module de réglages qui importe config.settings et ne change que
    la base, DEBUG et les origines CORS de vite preview ;
  - crée dans la copie un agent IPM « e2e.staff » et affiche son jeton, pour
    vérifier que le bon créé au mobile apparaît dans GET /api/bons-pharmacie/ ;
  - sert Django avec waitress sur 127.0.0.1:-Port (8010 par défaut), sans
    toucher au service IPM-Backend (8000).
  Ctrl+C arrête le serveur. La copie reste dans -Dossier pour examen.

.EXAMPLE
  .\e2e\lancer-backend-e2e.ps1
  # puis, dans un autre terminal, dans pwa\ :
  $env:IPM_API_CIBLE = 'http://127.0.0.1:8010'
  $env:IPM_E2E_JETON_STAFF = '<jeton affiché>'
  npm run e2e
#>
param(
    [int]$Port = 8010,
    [string]$Dossier = (Join-Path $env:TEMP 'ipm-mobile-e2e')
)

$ErrorActionPreference = 'Stop'
$backend = Resolve-Path (Join-Path $PSScriptRoot '..\..\backend')
$python = Join-Path $backend 'venv\Scripts\python.exe'

New-Item -ItemType Directory -Force $Dossier | Out-Null
$copie = Join-Path $Dossier 'base-e2e.sqlite3'
Copy-Item (Join-Path $backend 'db.sqlite3') $copie -Force

# Le module de réglages vit à côté de la copie, pas dans le dépôt.
$cheminCopie = $copie -replace '\\', '/'
$reglages = @"
# Réglages e2e : COPIE de la base (écrit par pwa/e2e/lancer-backend-e2e.ps1).
from config.settings import *  # noqa
DATABASES['default']['NAME'] = r'$cheminCopie'
DEBUG = True
ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
CORS_ALLOWED_ORIGINS = ['http://127.0.0.1:4174', 'http://localhost:4174']
"@
[IO.File]::WriteAllText((Join-Path $Dossier 'reglages_e2e.py'), $reglages)

$env:PYTHONPATH = "$Dossier;$(Join-Path $backend 'apps');$backend"
$env:DJANGO_SETTINGS_MODULE = 'reglages_e2e'

# Agent IPM de test, créé DANS LA COPIE uniquement.
$jeton = @'
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
agent, _ = get_user_model().objects.get_or_create(username='e2e.staff')
agent.is_staff = True
agent.set_unusable_password()
agent.save()
print(Token.objects.get_or_create(user=agent)[0].key)
'@ | & $python -
Write-Host "Copie de la base : $copie"
Write-Host "IPM_E2E_JETON_STAFF = $jeton"
Write-Host "Django de test sur http://127.0.0.1:$Port (Ctrl+C pour arrêter)"

# waitress journalise sur stderr : sous PowerShell 5.1, avec une sortie
# redirigée et ErrorActionPreference à Stop, la première ligne de journal
# deviendrait une erreur fatale qui arrête le serveur.
$ErrorActionPreference = 'Continue'
Push-Location $backend
try {
    & $python -m waitress --listen="127.0.0.1:$Port" config.wsgi:application
} finally {
    Pop-Location
}
