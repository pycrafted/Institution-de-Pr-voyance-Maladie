# Detoure le logo IPM : le fond creme devient transparent, l'image est
# recadree sur le dessin, puis reduite a la taille utile de l'en-tete.
#
# System.Drawing plutot que Pillow : rien a installer, et le Fortinet
# re-signe le TLS des depots de paquets.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Sortie,
    [int]$HauteurCible = 120
)

Add-Type -AssemblyName System.Drawing

$image = [System.Drawing.Bitmap]::FromFile($Source)
$largeur = $image.Width
$hauteur = $image.Height

# Le fond se lit aux quatre coins : il est uniforme, et aucun trait du logo
# ne les touche.
$coins = @(
    $image.GetPixel(2, 2), $image.GetPixel($largeur - 3, 2),
    $image.GetPixel(2, $hauteur - 3), $image.GetPixel($largeur - 3, $hauteur - 3)
)
$fondR = [int](($coins | ForEach-Object { $_.R } | Measure-Object -Average).Average)
$fondV = [int](($coins | ForEach-Object { $_.G } | Measure-Object -Average).Average)
$fondB = [int](($coins | ForEach-Object { $_.B } | Measure-Object -Average).Average)
Write-Output "fond detecte : R=$fondR V=$fondV B=$fondB"

# Copie en 32 bits pour disposer d'une couche alpha.
$copie = New-Object System.Drawing.Bitmap $largeur, $hauteur, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$dessin = [System.Drawing.Graphics]::FromImage($copie)
$dessin.DrawImage($image, 0, 0, $largeur, $hauteur)
$dessin.Dispose()
$image.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $largeur, $hauteur
$verrou = $copie.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$octets = $verrou.Stride * $hauteur
$tampon = New-Object byte[] $octets
[System.Runtime.InteropServices.Marshal]::Copy($verrou.Scan0, $tampon, 0, $octets)

# Transparence progressive : sous $bas, c'est du fond ; au-dessus de $haut,
# c'est du dessin ; entre les deux, un degrade. Sans cette zone de transition,
# les bords anticreneles garderaient un lisere creme.
$bas = 12
$haut = 46
$minX = $largeur; $maxX = -1; $minY = $hauteur; $maxY = -1

for ($y = 0; $y -lt $hauteur; $y++) {
    $ligne = $y * $verrou.Stride
    for ($x = 0; $x -lt $largeur; $x++) {
        $i = $ligne + $x * 4
        $dB = [Math]::Abs($tampon[$i] - $fondB)
        $dV = [Math]::Abs($tampon[$i + 1] - $fondV)
        $dR = [Math]::Abs($tampon[$i + 2] - $fondR)
        $ecart = [Math]::Max($dB, [Math]::Max($dV, $dR))

        if ($ecart -le $bas) {
            $alpha = 0
        } elseif ($ecart -ge $haut) {
            $alpha = 255
        } else {
            $alpha = [int](255 * ($ecart - $bas) / ($haut - $bas))
        }
        $tampon[$i + 3] = [byte]$alpha

        if ($alpha -gt 8) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($tampon, 0, $verrou.Scan0, $octets)
$copie.UnlockBits($verrou)

if ($maxX -lt 0) { throw "Aucun pixel opaque : le seuil est trop haut." }
Write-Output "dessin trouve de ($minX,$minY) a ($maxX,$maxY)"

# Recadrage sur le dessin, avec une marge d'un pour cent pour ne pas raser
# les bords anticreneles.
$marge = [int]([Math]::Max($maxX - $minX, $maxY - $minY) * 0.01) + 1
$cx = [Math]::Max(0, $minX - $marge)
$cy = [Math]::Max(0, $minY - $marge)
$cl = [Math]::Min($largeur - $cx, $maxX - $minX + 1 + 2 * $marge)
$ch = [Math]::Min($hauteur - $cy, $maxY - $minY + 1 + 2 * $marge)
$cadre = New-Object System.Drawing.Rectangle $cx, $cy, $cl, $ch
$coupe = $copie.Clone($cadre, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$copie.Dispose()

# Reduction a la hauteur utile : l'en-tete affiche 40 px, on garde trois fois
# plus pour les ecrans a forte densite.
$ratio = $HauteurCible / $coupe.Height
$nl = [int]([Math]::Round($coupe.Width * $ratio))
$final = New-Object System.Drawing.Bitmap $nl, $HauteurCible, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($final)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($coupe, 0, 0, $nl, $HauteurCible)
$g.Dispose()
$coupe.Dispose()

$final.Save($Sortie, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "ecrit : $Sortie ($nl x $HauteurCible)"
$final.Dispose()
