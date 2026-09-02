param(
  [int]$Port = 3000,
  [int]$FohX = [int]::MinValue,
  [int]$FohY = [int]::MinValue,
  [int]$KdsX = [int]::MinValue,
  [int]$KdsY = [int]::MinValue,
  [string]$BrowserPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $BrowserPath) {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  $BrowserPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $BrowserPath) { throw 'Chrome or Edge was not found. Pass -BrowserPath to a browser executable.' }

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
if ($screens.Count -lt 2) { throw 'Two monitors were not detected. Connect both FOH and KDS monitors, then run the launcher again.' }
if ($FohX -eq [int]::MinValue) { $FohX = $screens[0].Bounds.X }
if ($FohY -eq [int]::MinValue) { $FohY = $screens[0].Bounds.Y }
if ($KdsX -eq [int]::MinValue) { $KdsX = $screens[1].Bounds.X }
if ($KdsY -eq [int]::MinValue) { $KdsY = $screens[1].Bounds.Y }

$url = "http://localhost:$Port"
$profileRoot = Join-Path $env:LOCALAPPDATA 'WrapRollPOS\browser-profiles'
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null

Start-Process -FilePath $BrowserPath -ArgumentList @('--app', "$url/pos", '--start-fullscreen', "--window-position=$FohX,$FohY", "--user-data-dir=$(Join-Path $profileRoot 'foh')")
Start-Process -FilePath $BrowserPath -ArgumentList @('--app', "$url/kds", '--start-fullscreen', "--window-position=$KdsX,$KdsY", "--user-data-dir=$(Join-Path $profileRoot 'kds')")

Write-Host "FOH: $url/pos"
Write-Host "KDS: $url/kds"