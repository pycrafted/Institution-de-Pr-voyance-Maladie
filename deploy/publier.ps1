<#
    Publication de l'application IPM sur IIS.

    À relancer après chaque modification du code : le script reconstruit le
    front, rassemble les fichiers statiques de Django, recopie le tout vers la
    racine du site et redémarre le service backend.

    L'installation initiale (rôle IIS, modules, site, service) est décrite dans
    deploy\INSTALLATION.md et ne se fait qu'une fois.

    Usage (PowerShell en administrateur) :
        .\deploy\publier.ps1
#>

[CmdletBinding()]
param(
    # Racine du site IIS. Volontairement distincte de l'arborescence source :
    # IIS ne doit servir que le résultat du build, jamais le code.
    [string] $RacineSite = 'C:\inetpub\ipm',

    # Nom du service Windows qui porte Django (créé à l'installation).
    [string] $Service = 'IPM-Backend'
)

$ErrorActionPreference = 'Stop'

$projet = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projet 'backend\venv\Scripts\python.exe'

Write-Host "== Projet : $projet" -ForegroundColor Cyan

# --- 1. Front ------------------------------------------------------------
# Vide build\ puis le reconstruit. .env.production fournit VITE_API_BASE=/api.
Write-Host '== Build du front' -ForegroundColor Cyan
Push-Location $projet
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué (code $LASTEXITCODE)" }
}
finally { Pop-Location }

# --- 2. Statiques de Django ---------------------------------------------
# Alimente backend\staticfiles, publié par IIS sous /static/ (répertoire
# virtuel) : c'est ce qui habille la console d'administration.
Write-Host '== collectstatic' -ForegroundColor Cyan
& $python (Join-Path $projet 'backend\manage.py') collectstatic --noinput | Select-Object -Last 1

# --- 3. Copie vers la racine du site -------------------------------------
# /MIR reflète les suppressions : un fichier retiré du build disparaît du site,
# et les anciens bundles au nom haché ne s'accumulent pas. web.config est exclu
# de la synchronisation puis recopié depuis deploy\, sa source de vérité — sans
# cela, /MIR l'effacerait à chaque publication.
Write-Host "== Copie vers $RacineSite" -ForegroundColor Cyan
if (-not (Test-Path $RacineSite)) { New-Item -ItemType Directory -Path $RacineSite -Force | Out-Null }

& robocopy (Join-Path $projet 'build') $RacineSite /MIR /XF web.config /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy renvoie 0-7 en cas de succès (8 et au-delà = erreur réelle).
if ($LASTEXITCODE -ge 8) { throw "robocopy a échoué (code $LASTEXITCODE)" }

Copy-Item (Join-Path $PSScriptRoot 'web.config') $RacineSite -Force

# --- 4. Redémarrage du backend -------------------------------------------
# Le code Python est chargé au démarrage du processus : sans redémarrage, le
# service continuerait de servir la version précédente.
if (Get-Service $Service -ErrorAction SilentlyContinue) {
    Write-Host "== Redémarrage du service $Service" -ForegroundColor Cyan
    Restart-Service $Service
}
else {
    Write-Warning "Service '$Service' introuvable — backend non redémarré (voir deploy\INSTALLATION.md)."
}

Write-Host '== Publication terminée' -ForegroundColor Green
