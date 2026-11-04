# Captura el contenido de la ventana de Audionave y resume su contenido.
param([string]$ProcessName = "audionave", [string]$Out = "$env:TEMP\audionave-window.png")

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "proceso no encontrado"; exit 1 }

$hwnd = $proc.MainWindowHandle
if ($hwnd -eq 0) { Write-Output "sin ventana principal"; exit 1 }

$rect = New-Object WinCap+RECT
[void][WinCap]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
Write-Output "ventana: $w x $h"

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
# PW_RENDERFULLCONTENT = 2 (necesario para contenido de WebView2)
[void][WinCap]::PrintWindow($hwnd, $hdc, 2)
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

# Resumen numerico
$buckets = @{}
$white = 0
$dark = 0
$sumR = 0.0; $sumG = 0.0; $sumB = 0.0
$total = 0
for ($y = 0; $y -lt $h; $y += 3) {
  for ($x = 0; $x -lt $w; $x += 3) {
    $c = $bmp.GetPixel($x, $y)
    $total++
    $sumR += $c.R; $sumG += $c.G; $sumB += $c.B
    if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) { $white++ }
    if ($c.R -lt 60 -and $c.G -lt 60 -and $c.B -lt 70) { $dark++ }
    $key = "{0},{1},{2}" -f ([int]($c.R/16)), ([int]($c.G/16)), ([int]($c.B/16))
    if ($buckets.ContainsKey($key)) { $buckets[$key]++ } else { $buckets[$key] = 1 }
  }
}
$reddish = 0
for ($y = 0; $y -lt $h; $y += 3) {
  for ($x = 0; $x -lt $w; $x += 3) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.R -gt ($c.G + 40) -and $c.R -gt ($c.B + 40) -and $c.R -gt 90) { $reddish++ }
  }
}

$bmp.Dispose()

Write-Output ("muestras: " + $total)
Write-Output ("media RGB: {0:N0},{1:N0},{2:N0}" -f ($sumR/$total), ($sumG/$total), ($sumB/$total))
Write-Output ("casi blanco: {0:P1}" -f ($white/$total))
Write-Output ("casi negro:  {0:P1}" -f ($dark/$total))
Write-Output ("colores distintos (16 niveles): " + $buckets.Count)
Write-Output ("pixeles rojizos (avisos de error): {0:P2}" -f ($reddish/$total))

$top = $buckets.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5
Write-Output "tonos dominantes (proporcion):"
foreach ($t in $top) { Write-Output ("   " + $t.Key + " -> " + ("{0:P1}" -f ($t.Value/$total))) }
Write-Output ("guardado en " + $Out)
