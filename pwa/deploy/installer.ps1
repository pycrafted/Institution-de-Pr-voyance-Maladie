<#
    Installation IIS du PWA « IPM Mobile » — à ne faire qu'une fois.

    Crée ou remet d'aplomb, sans rien casser si on le relance :
      - le pool d'applications « IPM-Mobile » (No Managed Code) ;
      - le site « IPM-Mobile » (C:\inetpub\ipm-mobile), en HTTPS sur *:8443 ;
      - un binding HTTPS *:443 sur le site « IPM » existant, pour que le PWA
        joigne l'API en HTTPS (le binding HTTP :80 n'est pas touché) ;
      - le certificat sur ces deux ports ;
      - les règles de pare-feu entrantes 443 et 8443 (profils Domaine, Privé) ;
      - les droits de lecture de « IIS AppPool\IPM-Mobile » sur la racine.

    Le HTTPS n'est pas un luxe ici : sans lui, un téléphone refuse d'installer
    l'application et n'active pas le service worker (mode hors-ligne).

    Le certificat se désigne de deux façons :
      -Empreinte <empreinte>  certificat déjà présent dans
                              Cert:\LocalMachine\My (importé à la main) ;
      -Pfx <chemin>           le script importe lui-même le fichier .pfx ; le
                              mot de passe est demandé en saisie masquée, il
                              n'apparaît ni à l'écran ni dans l'historique.

    Usage (PowerShell en administrateur) :
        .\pwa\deploy\installer.ps1 -Empreinte 0123ABCD...
        .\pwa\deploy\installer.ps1 -Pfx C:\deploy\IPM\pfx\wildcard2_sar_sn.pfx

    Ensuite : .\pwa\deploy\publier.ps1 (voir pwa\deploy\INSTALLATION.md).
#>

[CmdletBinding()]
param(
    # Empreinte (thumbprint) du certificat dans Cert:\LocalMachine\My. Les
    # espaces et caractères invisibles d'un copier-coller depuis la console
    # des certificats sont tolérés.
    [string] $Empreinte,

    # Fichier .pfx à importer dans Cert:\LocalMachine\My.
    [string] $Pfx,

    # Mot de passe du .pfx, pour un usage non interactif. Absent : demandé en
    # saisie masquée (Read-Host -AsSecureString).
    [System.Security.SecureString] $MotDePasse,

    # Nom sous lequel les téléphones joignent le serveur : le certificat doit
    # le couvrir (directement ou par un nom générique *.sar.sn).
    [string] $NomHote = 'sar-integration.sar.sn',

    [string] $Site = 'IPM-Mobile',
    [string] $Pool = 'IPM-Mobile',
    [string] $Racine = 'C:\inetpub\ipm-mobile',
    [int]    $PortPwa = 8443,

    # Site existant qui relaie /api vers Django, et son futur port HTTPS.
    [string] $SiteApi = 'IPM',
    [int]    $PortApi = 443
)

$ErrorActionPreference = 'Stop'

function Etape([string] $texte) { Write-Host "== $texte" -ForegroundColor Cyan }

# --- 0. Préalables -------------------------------------------------------

# Sans certificat, inutile d'aller plus loin : on explique comment l'obtenir
# plutôt que de créer un site à moitié configuré.
if (-not $Empreinte -and -not $Pfx) {
    $pfxProjet = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'pfx\wildcard2_sar_sn.pfx'
    Write-Host ''
    Write-Host 'Aucun certificat indiqué : installation interrompue, rien n''a été modifié.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Deux possibilités (PowerShell en administrateur) :'
    Write-Host ''
    Write-Host '  1. Laisser le script importer le .pfx (le mot de passe sera demandé) :'
    Write-Host "       $PSCommandPath -Pfx $pfxProjet"
    Write-Host ''
    Write-Host '  2. Importer le .pfx soi-même, puis relancer avec son empreinte :'
    Write-Host '       $mdp = Read-Host ''Mot de passe du pfx'' -AsSecureString'
    Write-Host "       Import-PfxCertificate -FilePath $pfxProjet -CertStoreLocation Cert:\LocalMachine\My -Password `$mdp"
    Write-Host '       Get-ChildItem Cert:\LocalMachine\My | Format-List Subject, DnsNameList, NotAfter, Thumbprint'
    Write-Host "       $PSCommandPath -Empreinte <Thumbprint>"
    Write-Host ''
    exit 1
}
if ($Empreinte -and $Pfx) { throw 'Indiquer -Empreinte OU -Pfx, pas les deux.' }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ce script modifie IIS, le magasin de certificats et le pare-feu : lancez PowerShell en administrateur.'
}

Import-Module WebAdministration

# web.config du PWA utilise <rewrite> (repli SPA) : sans le module, IIS
# répondrait 500.19 à toutes les requêtes du site.
if (-not (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue)) {
    throw 'Module IIS URL Rewrite absent (choco install urlrewrite -y), requis par pwa\deploy\web.config.'
}

# --- 1. Certificat -------------------------------------------------------

# Vrai si le certificat couvre $nom, directement ou par un nom générique :
# « *.sar.sn » couvre « sar-integration.sar.sn » (un seul niveau, comme le
# font les navigateurs).
function Couvre-Nom($certificat, [string] $nom) {
    $suffixe = ($nom -split '\.', 2)[1]   # sar-integration.sar.sn -> sar.sn
    foreach ($dns in $certificat.DnsNameList) {
        $n = $dns.Unicode
        if ($n -ieq $nom) { return $true }
        if ($suffixe -and $n.StartsWith('*.') -and $n.Substring(2) -ieq $suffixe) { return $true }
    }
    return $false
}

if ($Pfx) {
    Etape "Import du certificat $Pfx"
    $Pfx = (Resolve-Path $Pfx).Path
    if (-not $MotDePasse) { $MotDePasse = Read-Host "Mot de passe de $(Split-Path -Leaf $Pfx)" -AsSecureString }
    try {
        $importes = @(Import-PfxCertificate -FilePath $Pfx -CertStoreLocation Cert:\LocalMachine\My -Password $MotDePasse)
    }
    catch {
        throw "Import du .pfx impossible (mot de passe erroné ?) : $($_.Exception.Message)"
    }
    # Le .pfx peut contenir toute la chaîne ; le certificat du serveur est
    # celui qui porte la clé privée.
    $candidats = @($importes | Where-Object { $_.HasPrivateKey })
    if ($candidats.Count -gt 1) { $candidats = @($candidats | Where-Object { Couvre-Nom $_ $NomHote }) }
    if ($candidats.Count -ne 1) { throw "Impossible de désigner le certificat serveur parmi les $($importes.Count) certificats du .pfx : relancer avec -Empreinte." }
    $Empreinte = $candidats[0].Thumbprint
    Write-Host "   Importé : $Empreinte"
}

$Empreinte = ($Empreinte -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
if ($Empreinte.Length -ne 40) { throw "Empreinte invalide : 40 caractères hexadécimaux attendus, $($Empreinte.Length) reçus." }

$cert = Get-Item "Cert:\LocalMachine\My\$Empreinte" -ErrorAction SilentlyContinue
if (-not $cert) { throw "Certificat $Empreinte introuvable dans Cert:\LocalMachine\My (l'importer d'abord, ou utiliser -Pfx)." }

Etape "Certificat $Empreinte"
Write-Host "   Sujet    : $($cert.Subject)"
Write-Host "   Noms     : $(($cert.DnsNameList | ForEach-Object { $_.Unicode }) -join ', ')"
Write-Host "   Émetteur : $($cert.Issuer)"
Write-Host "   Expire   : $($cert.NotAfter)"

# Refus nets : IIS accepterait le binding, mais les téléphones refuseraient la
# connexion, avec un message qui n'aiderait personne à trouver la cause.
if (-not $cert.HasPrivateKey) { throw 'Ce certificat n''a pas de clé privée dans le magasin : IIS ne peut pas s''en servir.' }
if ($cert.NotAfter -lt (Get-Date)) { throw "Certificat expiré depuis le $($cert.NotAfter)." }
if (-not (Couvre-Nom $cert $NomHote)) { throw "Le certificat ne couvre pas $NomHote : les navigateurs le refuseraient." }
if ($cert.NotAfter -lt (Get-Date).AddDays(30)) { Write-Warning "Le certificat expire dans moins de 30 jours ($($cert.NotAfter))." }

# Chaîne de confiance. Un téléphone ne connaît que les autorités racines
# publiques : le serveur doit lui présenter les certificats intermédiaires.
# HTTP.sys les cherche dans le magasin « Autorités intermédiaires » (CA) de la
# machine ; on les y range, qu'ils viennent du .pfx ou d'un import manuel.
$chaine = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$chaine.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
$chaineValide = $chaine.Build($cert)

$magasinCA = New-Object System.Security.Cryptography.X509Certificates.X509Store('CA', 'LocalMachine')
$magasinCA.Open('ReadWrite')
try {
    for ($i = 1; $i -lt $chaine.ChainElements.Count; $i++) {
        $maillon = $chaine.ChainElements[$i].Certificate
        if ($maillon.Subject -ne $maillon.Issuer) {
            # Add ne fait rien si le certificat y est déjà.
            $magasinCA.Add($maillon)
            Write-Host "   Intermédiaire : $($maillon.Subject)"
        }
    }
}
finally { $magasinCA.Close() }

if (-not $chaineValide) {
    $raisons = ($chaine.ChainStatus | ForEach-Object { $_.StatusInformation.Trim() }) -join ' / '
    Write-Warning "Chaîne de confiance incomplète ou non reconnue par ce serveur : $raisons"
    Write-Warning 'Les téléphones risquent de refuser le site. Vérifier que le .pfx contient les intermédiaires et que l''autorité racine est publique.'
}

# --- 2. Pool et site IPM-Mobile ------------------------------------------

# Aucun autre site ne doit déjà écouter sur ces ports : IIS refuserait de
# démarrer l'un des deux, sans message explicite.
foreach ($port in $PortPwa, $PortApi) {
    $proprietaire = if ($port -eq $PortPwa) { $Site } else { $SiteApi }
    foreach ($s in Get-ChildItem IIS:\Sites) {
        if ($s.Name -eq $proprietaire) { continue }
        foreach ($b in $s.Bindings.Collection) {
            if ($b.bindingInformation -match ":$port`:") {
                throw "Le port $port est déjà utilisé par le site IIS « $($s.Name) » ($($b.protocol) $($b.bindingInformation))."
            }
        }
    }
    # HTTP.sys (processus System, PID 4) est le seul écouteur légitime.
    $autres = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 4 }
    if ($autres) { Write-Warning "Un autre programme (PID $($autres[0].OwningProcess)) écoute déjà sur le port $port." }
}

Etape "Pool d'applications $Pool"
if (-not (Test-Path "IIS:\AppPools\$Pool")) { New-WebAppPool -Name $Pool | Out-Null }
# « No Managed Code » : le site ne sert que des fichiers, ASP.NET n'a rien à
# y faire.
Set-ItemProperty "IIS:\AppPools\$Pool" -Name managedRuntimeVersion -Value ''

Etape "Site $Site ($Racine, https *:$PortPwa)"
if (-not (Test-Path $Racine)) { New-Item -ItemType Directory -Path $Racine -Force | Out-Null }
if (-not (Test-Path "IIS:\Sites\$Site")) {
    New-Website -Name $Site -PhysicalPath $Racine -ApplicationPool $Pool -Port $PortPwa -Ssl | Out-Null
}
else {
    Set-ItemProperty "IIS:\Sites\$Site" -Name physicalPath -Value $Racine
    Set-ItemProperty "IIS:\Sites\$Site" -Name applicationPool -Value $Pool
}

# Ajoute le binding https *:<port> au site s'il manque, puis y associe le
# certificat. L'association vit dans HTTP.sys (0.0.0.0:<port>), pas dans IIS :
# elle est remplacée si elle désigne un autre certificat (renouvellement).
function Lier-Https([string] $nomSite, [int] $port) {
    $binding = Get-WebBinding -Name $nomSite -Protocol https -Port $port | Where-Object { $_.bindingInformation -eq "*:${port}:" }
    if (-not $binding) {
        New-WebBinding -Name $nomSite -Protocol https -IPAddress '*' -Port $port | Out-Null
        $binding = Get-WebBinding -Name $nomSite -Protocol https -Port $port | Where-Object { $_.bindingInformation -eq "*:${port}:" }
    }
    $existant = Get-Item "IIS:\SslBindings\0.0.0.0!$port" -ErrorAction SilentlyContinue
    if ($existant -and $existant.Thumbprint -ne $Empreinte) {
        Remove-Item "IIS:\SslBindings\0.0.0.0!$port"
        $existant = $null
    }
    if (-not $existant) { $binding.AddSslCertificate($Empreinte, 'My') }
    Write-Host "   https *:$port -> $nomSite (certificat $Empreinte)"
}

Lier-Https $Site $PortPwa

# --- 3. HTTPS sur le site IPM (API) --------------------------------------
# Une page HTTPS ne peut appeler qu'une API HTTPS. On ajoute :443 au site
# existant ; ses règles de relais /api -> Django valent pour tous ses
# bindings, et le HTTP :80 reste en place pour les postes de l'IPM.
Etape "HTTPS sur le site $SiteApi (https *:$PortApi)"
if (Test-Path "IIS:\Sites\$SiteApi") {
    Lier-Https $SiteApi $PortApi
}
else {
    Write-Warning "Site « $SiteApi » introuvable : l'API n'est pas exposée en HTTPS (voir deploy\INSTALLATION.md)."
}

# --- 4. Pare-feu ---------------------------------------------------------
# Profils Domaine et Privé : le serveur n'est pas destiné à être joint depuis
# un réseau public.
function Ouvrir-Port([string] $nom, [int] $port) {
    $regle = Get-NetFirewallRule -DisplayName $nom -ErrorAction SilentlyContinue
    if ($regle) {
        $regle | Set-NetFirewallRule -Direction Inbound -Action Allow -Profile Domain, Private -Enabled True
        $regle | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $port
    }
    else {
        New-NetFirewallRule -DisplayName $nom -Direction Inbound -Protocol TCP -LocalPort $port `
            -Action Allow -Profile Domain, Private | Out-Null
    }
    Write-Host "   $nom"
}

Etape 'Pare-feu'
Ouvrir-Port "IPM - HTTPS $PortApi" $PortApi
Ouvrir-Port "IPM Mobile - HTTPS $PortPwa" $PortPwa

# --- 5. Droits -----------------------------------------------------------
# L'identité du pool n'existe qu'une fois le pool créé : d'où cette étape en
# fin de parcours. (OI)(CI) : les fichiers déposés plus tard par publier.ps1
# héritent du droit.
Etape "Droits de lecture pour IIS AppPool\$Pool"
& icacls $Racine /grant "IIS AppPool\${Pool}:(OI)(CI)(RX)" /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls a échoué (code $LASTEXITCODE)" }

# --- 6. Démarrage et contrôle --------------------------------------------
Etape 'Démarrage'
if ((Get-WebAppPoolState -Name $Pool).Value -ne 'Started') { Start-WebAppPool -Name $Pool }
if ((Get-WebsiteState -Name $Site).Value -ne 'Started') { Start-Website -Name $Site }

# Une réponse HTTP quelconque (même 403/404 tant que rien n'est publié) prouve
# que la négociation TLS aboutit avec ce certificat. PowerShell 5.1 ne propose
# pas TLS 1.2 par défaut : on l'active pour ce contrôle.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
foreach ($url in "https://${NomHote}:$PortPwa/", "https://$NomHote/api/") {
    try {
        $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 15
        Write-Host "   $url -> $($r.StatusCode)"
    }
    catch [System.Net.WebException] {
        if ($_.Exception.Response) { Write-Host "   $url -> $([int] $_.Exception.Response.StatusCode) (TLS correct)" }
        else { Write-Warning "$url : $($_.Exception.Message)" }
    }
}

Write-Host ''
Write-Host '== Installation terminée' -ForegroundColor Green
Write-Host "   Étape suivante : $(Join-Path $PSScriptRoot 'publier.ps1') -IgnorerSslNpm"
if ($Pfx -and $Pfx -like "$(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))*") {
    Write-Host "   Le .pfx importé peut maintenant quitter l'arborescence du projet ($Pfx) : il contient la clé privée." -ForegroundColor Yellow
}
