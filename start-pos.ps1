param(
  [int]$Port = 3000,
  [string]$HostAddress = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = Join-Path $Root '.node\node-v20.18.0-win-x64\node.exe'
$Server = Join-Path $Root 'server\index.js'
$DistIndex = Join-Path $Root 'dist\index.html'
$SecretPath = Join-Path $Root 'server\db\pos-jwt-secret.txt'

if (-not (Test-Path -LiteralPath $Node)) { throw "Bundled Node runtime not found: $Node" }
if (-not (Test-Path -LiteralPath $DistIndex)) {
  Write-Host 'Production build not found. Building now...' -ForegroundColor Yellow
  & $Node (Join-Path $Root 'scripts\build-production.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
}

$env:NODE_ENV = 'production'
$env:PORT = $Port
$env:HOST = $HostAddress
if (-not $env:CORS_ORIGIN) { $env:CORS_ORIGIN = "http://localhost:$Port" }
if (-not $env:JWT_SECRET) {
  if (-not (Test-Path -LiteralPath $SecretPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SecretPath) | Out-Null
    $secretBytes = New-Object byte[] 48
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $random.GetBytes($secretBytes)
    $random.Dispose()
    [Convert]::ToBase64String($secretBytes) | Set-Content -LiteralPath $SecretPath -NoNewline
  }
  $env:JWT_SECRET = (Get-Content -LiteralPath $SecretPath -Raw).Trim()
}

Write-Host "Starting Wrap & Roll POS on http://localhost:$Port" -ForegroundColor Green
& $Node $Server