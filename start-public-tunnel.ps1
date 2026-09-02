param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cloudflared = Join-Path $Root 'cloudflared.exe'
$TargetUrl = "http://127.0.0.1:$Port"
$UrlPattern = '(?i)https://[a-z0-9-]+\.trycloudflare\.com(?:/[^\s]*)?'

if (-not (Test-Path -LiteralPath $Cloudflared)) {
  Write-Host 'Downloading Cloudflare Quick Tunnel...' -ForegroundColor Yellow
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $Cloudflared
}

Write-Host "Hosting $TargetUrl publicly with a temporary Cloudflare URL..." -ForegroundColor Green
$opened = $false
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $Cloudflared tunnel --url $TargetUrl 2>&1 | ForEach-Object {
  $line = $_.ToString()
  Write-Host $line
  if (-not $opened -and $line -match $UrlPattern) {
    $publicUrl = $Matches[0].TrimEnd([char[]]@('.', ',', ';', ')', ']', '"', "'"))
    $opened = $true
    Write-Host "Opening $publicUrl in the default browser profile..." -ForegroundColor Green
    Start-Process -FilePath $publicUrl
  }
}
$ErrorActionPreference = $previousErrorActionPreference