<#
    Publication du PWA « IPM Mobile » sur IIS.

    À relancer après chaque modification du code du PWA : le script réinstalle
    les dépendances à l'identique (npm ci), reconstruit l'application, recopie
    le résultat vers la racine du site IPM-Mobile, puis y dépose web.config et
    un config.json qui pointe vers l'API passée en -ApiBase.

    Le site lui-même (pool, bindings HTTPS, certificat, pare-feu) est créé une
    fois pour toutes par pwa\deploy\installer.ps1 — voir
    pwa\deploy\INSTALLATION.md.

    Le backend n'est PAS redémarré : le PWA ne contient aucun code serveur.
    Si l'API a changé, c'est deploy\publier.ps1 (application IPM) qu'il faut
    relancer.

    Usage (PowerShell en administrateur) :
        .\pwa\deploy\publier.ps1 -IgnorerSslNpm
        .\pwa\deploy\publier.ps1 -ApiBase https://ipm.exemple.sn/api
        .\pwa\deploy\publier.ps1 -SansNpmCi        # build seul, dépendances déjà là
#>

[CmdletBinding()]
param(
    # Adresse de l'API IPM vue depuis le téléphone, écrite dans config.json.
    # Doit être en HTTPS : une page HTTPS ne peut pas appeler une API en HTTP
    # (contenu mixte bloqué par le navigateur). Un chemin relatif (« /api »)
    # n'a de sens que si le PWA et l'API partagent un jour la même origine.
    [string] $ApiBase = 'https://sar-integration.sar.sn/api',

    # Racine du site IIS. Volontairement distincte de l'arborescence source :
    # IIS ne doit servir que le résultat du build, jamais le code.
    [string] $RacineSite = 'C:\inetpub\ipm-mobile',

    # Saute « npm ci » (publication rapide quand node_modules est à jour).
    [switch] $SansNpmCi,

    # Le pare-feu Fortinet intercepte le TLS de registry.npmjs.org avec un
    # certificat que npm ne reconnaît pas. Ce commutateur désactive la
    # vérification SSL de npm LE TEMPS DE « npm ci » seulement, par variable
    # d'environnement (jamais écrite dans un .npmrc). Le risque reste borné :
    # package-lock.json fige l'empreinte d'intégrité de chaque paquet, et npm
    # refuse tout paquet dont le contenu ne correspond pas.
    [switch] $IgnorerSslNpm
)

$ErrorActionPreference = 'Stop'

$pwa = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $pwa 'dist'

Write-Host "== PWA : $pwa" -ForegroundColor Cyan

# --- 0. Contrôle de -ApiBase ---------------------------------------------
# Vérifié avant tout travail : une adresse fausse ne se voit qu'une fois
# l'application ouverte sur un téléphone, par un « réseau indisponible ».
$ApiBase = $ApiBase.Trim().TrimEnd('/')
$origineApi = $null
if ($ApiBase -match '^https?://') {
    $uri = [Uri] $ApiBase
    if ($uri.Scheme -ne 'https') {
        Write-Warning "ApiBase est en HTTP ($ApiBase) : le navigateur bloquera ces appels depuis une page HTTPS."
    }
    # L'origine (schéma + hôte + port éventuel) est ce qu'attend la CSP.
    $origineApi = $uri.GetLeftPart([UriPartial]::Authority)
}
elseif (-not $ApiBase.StartsWith('/')) {
    throw "ApiBase doit être une URL absolue (https://…/api) ou un chemin commençant par « / » : '$ApiBase'"
}
Write-Host "== API : $ApiBase" -ForegroundColor Cyan

# --- 1. Dépendances et build ---------------------------------------------
Push-Location $pwa
try {
    if (-not $SansNpmCi) {
        # « npm ci » et non « npm install » : installe exactement ce que fige
        # package-lock.json, sans jamais le modifier.
        Write-Host '== npm ci' -ForegroundColor Cyan
        $sslAvant = $env:npm_config_strict_ssl
        if ($IgnorerSslNpm) { $env:npm_config_strict_ssl = 'false' }
        try {
            & npm ci
            if ($LASTEXITCODE -ne 0) {
                $aide = if ($IgnorerSslNpm) { '' } else { ' (derrière le Fortinet, relancer avec -IgnorerSslNpm)' }
                throw "npm ci a échoué (code $LASTEXITCODE)$aide"
            }
        }
        finally {
            # La variable ne doit pas survivre à la commande : on restaure
            # l'état précédent, qu'elle ait existé ou non.
            if ($null -eq $sslAvant) { Remove-Item Env:\npm_config_strict_ssl -ErrorAction SilentlyContinue }
            else { $env:npm_config_strict_ssl = $sslAvant }
        }
    }

    Write-Host '== npm run build' -ForegroundColor Cyan
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué (code $LASTEXITCODE)" }
}
finally { Pop-Location }

# Garde-fou avant /MIR : robocopy reflète la source, y compris vide. Un build
# incomplet viderait le site et casserait l'application sur tous les
# téléphones au prochain lancement.
foreach ($f in 'index.html', 'sw.js', 'manifest.webmanifest') {
    if (-not (Test-Path (Join-Path $dist $f))) {
        throw "Build incomplet : $f absent de $dist — publication annulée, le site n'a pas été touché."
    }
}

# --- 2. Copie vers la racine du site -------------------------------------
# /MIR reflète les suppressions : un fichier retiré du build disparaît du site,
# et les anciens bundles au nom haché ne s'accumulent pas. web.config et
# config.json sont exclus de la synchronisation (ni copiés, ni supprimés) puis
# écrits juste après depuis pwa\deploy\ et -ApiBase : le config.json du build
# est celui du développement.
Write-Host "== Copie vers $RacineSite" -ForegroundColor Cyan
if (-not (Test-Path $RacineSite)) { New-Item -ItemType Directory -Path $RacineSite -Force | Out-Null }

& robocopy $dist $RacineSite /MIR /XF web.config config.json /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy renvoie 0-7 en cas de succès (8 et au-delà = erreur réelle).
if ($LASTEXITCODE -ge 8) { throw "robocopy a échoué (code $LASTEXITCODE)" }

# UTF-8 sans BOM pour les deux fichiers écrits : c'est ce qu'attendent le
# navigateur (config.json) et IIS (web.config).
$utf8 = New-Object System.Text.UTF8Encoding($false)

# --- 3. config.json ------------------------------------------------------
# On part du config.json du build (pwa\public\config.json) pour conserver les
# éventuelles autres clés, et on n'y remplace que apiBase.
$configSource = Join-Path $dist 'config.json'
$config = [ordered]@{}
if (Test-Path $configSource) {
    $lu = Get-Content $configSource -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $lu.PSObject.Properties) { $config[$p.Name] = $p.Value }
}
$config['apiBase'] = $ApiBase
[IO.File]::WriteAllText((Join-Path $RacineSite 'config.json'), ($config | ConvertTo-Json -Depth 10), $utf8)
Write-Host "== config.json écrit (apiBase = $ApiBase)" -ForegroundColor Cyan

# --- 4. web.config -------------------------------------------------------
# Recopié depuis pwa\deploy\, sa source de vérité. La CSP n'autorise les appels
# réseau que vers l'origine de l'API : on y met celle de -ApiBase, pour qu'un
# changement d'adresse ne se traduise pas par des appels silencieusement
# bloqués par le navigateur.
$webConfig = New-Object System.Xml.XmlDocument
$webConfig.PreserveWhitespace = $true   # garde la mise en page et les commentaires
$webConfig.LoadXml((Get-Content (Join-Path $PSScriptRoot 'web.config') -Raw -Encoding UTF8))
$csp = $webConfig.SelectSingleNode("/configuration/system.webServer/httpProtocol/customHeaders/add[@name='Content-Security-Policy']")
if ($null -eq $csp) { throw 'En-tête Content-Security-Policy introuvable dans pwa\deploy\web.config.' }

$directives = foreach ($d in ($csp.GetAttribute('value') -split ';')) {
    $d = $d.Trim()
    if ($d -like 'connect-src*') {
        # Sources fixes du PWA, plus l'origine de l'API si elle est ailleurs.
        # Le calcul d'itinéraire de la carte (OSRM) est une source fixe : il ne
        # dépend pas de l'adresse de l'API.
        $sources = @("connect-src 'self' blob: data: https://router.project-osrm.org")
        if ($origineApi) { $sources += $origineApi }
        $sources -join ' '
    }
    elseif ($d) { $d }
}
$csp.SetAttribute('value', ($directives -join '; '))

$sortie = New-Object System.IO.StringWriter
$webConfig.Save($sortie)
# XmlDocument.Save(StringWriter) annonce encoding="utf-16" : on rétablit la
# déclaration réelle du fichier écrit.
$texte = $sortie.ToString() -replace '^<\?xml[^>]*\?>', '<?xml version="1.0" encoding="UTF-8"?>'
[IO.File]::WriteAllText((Join-Path $RacineSite 'web.config'), $texte, $utf8)
Write-Host "== web.config recopié (connect-src : $(if ($origineApi) { $origineApi } else { "'self'" }))" -ForegroundColor Cyan

Write-Host '== Publication terminée' -ForegroundColor Green
Write-Host '   Les téléphones la téléchargent seuls : appliquée au prochain lancement de l''application, ou tout de suite par le bouton « Recharger » du toast de mise à jour.'
