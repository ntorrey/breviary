# Generates the PNG app icons (same design as icons/icon.svg) using .NET System.Drawing.
# Run from the project folder:  pwsh tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

function RoundRect([System.Drawing.Graphics]$g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($r -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF $x, $y, $w, $h)) }
  else {
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
  }
  $g.FillPath($brush, $p)
}

function MakeIcon([int]$size, [string]$path, [bool]$maskable = $false, [bool]$square = $false) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 512.0
  $burgundy = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#7a1f1a'))
  $cream = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f7f3ea'))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#e2cc84'))
  $red = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#b3261e'))
  $radius = if ($maskable -or $square) { 0 } else { 112 * $s }
  RoundRect $g $burgundy 0 0 $size $size $radius
  # Maskable icons keep artwork inside the central 80% safe zone.
  $k = if ($maskable) { 0.78 } else { 1.0 }
  $o = (512 - 512 * $k) / 2
  function T([float]$v) { return ($o + $v * $k) * $s }
  function L([float]$v) { return $v * $k * $s }
  RoundRect $g $cream (T 112) (T 96) (L 288) (L 320) (L 20)
  RoundRect $g $gold (T 112) (T 96) (L 36) (L 320) (L 12)
  RoundRect $g $burgundy (T 252) (T 150) (L 28) (L 200) (L 6)
  RoundRect $g $burgundy (T 206) (T 200) (L 120) (L 28) (L 6)
  RoundRect $g $red (T 330) (T 380) (L 22) (L 80) 0
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$dir = Join-Path $PSScriptRoot '..\icons'
MakeIcon 192 (Join-Path $dir 'icon-192.png')
MakeIcon 512 (Join-Path $dir 'icon-512.png')
MakeIcon 512 (Join-Path $dir 'icon-maskable-512.png') $true
MakeIcon 180 (Join-Path $dir 'apple-touch-icon.png') $false $true
Write-Output 'Icons written.'
