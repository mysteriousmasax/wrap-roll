param(
  [string]$InstallPath = 'C:\WrapRollPOS'
)

$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Remove-Item -LiteralPath (Join-Path $InstallPath 'dist') -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath $Source -Force | Where-Object { $_.Name -ne '.git' } | Copy-Item -Destination $InstallPath -Recurse -Force

Write-Host "Installed to $InstallPath" -ForegroundColor Green
Write-Host 'Run start-pos.ps1 from the installation folder, then launch-displays.ps1.'