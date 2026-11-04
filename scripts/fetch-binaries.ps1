# Audionave — obtiene yt-dlp.exe y ffmpeg.exe para embeberlos en la app.
# Se almacenan en src-tauri/binaries/ (gitignored). Se llaman desde el bundle.
# Requiere: internet. Uso: pwsh ./scripts/fetch-binaries.ps1 [-Force]

param([switch]$Force)

$ErrorActionPreference = "Stop"
$dst = Join-Path $PSScriptRoot "..\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

function Get-WithRetry {
  param([string]$Url, [string]$Out)
  for ($i = 1; $i -le 3; $i++) {
    try {
      Write-Host "  descargando $Url ..."
      Invoke-WebRequest -Uri $Url -OutFile $Out -UseBasicParsing
      return
    } catch {
      if ($i -eq 3) { throw }
      Write-Host "  reintento $i/3 ..."
      Start-Sleep -Seconds 3
    }
  }
}

$yt = Join-Path $dst "yt-dlp.exe"
if (-not (Test-Path $yt) -or $Force) {
  Get-WithRetry -Url "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -Out $yt
} else { Write-Host "yt-dlp.exe ya presente (usa -Force para sobrescribir)." }

$ffmpegZip = Join-Path $env:TEMP "ffmpeg-w64.zip"
$ffmpegBin = Join-Path $dst "ffmpeg.exe"
if (-not (Test-Path $ffmpegBin) -or $Force) {
  Get-WithRetry -Url "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" -Out $ffmpegZip
  Write-Host "  extrayendo ffmpeg.exe ..."
  Expand-Archive -Path $ffmpegZip -DestinationPath (Join-Path $env:TEMP "ffmpeg-extract") -Force
  $found = Get-ChildItem -Path (Join-Path $env:TEMP "ffmpeg-extract") -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
  if (-not $found) { throw "no se encontró ffmpeg.exe dentro del zip" }
  Copy-Item -Path $found.FullName -Destination $ffmpegBin -Force
} else { Write-Host "ffmpeg.exe ya presente (usa -Force para sobrescribir)." }

Write-Host "`nListo. Binarios:"
Get-ChildItem $dst | Select-Object Name, Length | Format-Table