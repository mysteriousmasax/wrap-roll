param(
  [string]$Branch = 'main',
  [int]$DebounceSeconds = 3
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
  throw "Git repository not found: $Root"
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $Root
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::DirectoryName -bor [IO.NotifyFilters]::LastWrite
$watcher.Filter = '*'
$watcher.EnableRaisingEvents = $true

$subscriptions = @(
  Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier 'wraproll.changed'
  Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier 'wraproll.created'
  Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier 'wraproll.deleted'
  Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier 'wraproll.renamed'
)

$lastStatus = ''
Write-Host "Auto-publish watching $Root" -ForegroundColor Green
Write-Host "Every settled change will be committed and pushed to origin/$Branch." -ForegroundColor Yellow

function Publish-Changes {
  $status = (& git status --porcelain=v1 | Out-String).Trim()
  if (-not $status) { return }

  & git add -A
  if ($LASTEXITCODE -ne 0) { Write-Warning 'git add failed.'; return }

  $message = "chore: auto-publish $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  & git commit -m $message
  if ($LASTEXITCODE -ne 0) { Write-Warning 'git commit failed; changes remain local.'; return }

  & git push origin $Branch
  if ($LASTEXITCODE -ne 0) { Write-Warning 'git push failed; commit remains local.'; return }

  Write-Host "Published $message" -ForegroundColor Green
  return $status
}

$lastStatus = Publish-Changes

try {
  while ($true) {
    $event = Wait-Event -Timeout 2
    if (-not $event) { continue }
    Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue

    $relativePath = ($event.SourceEventArgs.FullPath.Substring($Root.Length)).TrimStart('\')
    if ($relativePath -eq '.git' -or $relativePath.StartsWith('.git\')) { continue }

    Wait-Event -Timeout $DebounceSeconds | Out-Null
    Get-Event | Where-Object { $_.SourceIdentifier -like 'wraproll.*' } | ForEach-Object {
      Remove-Event -EventIdentifier $_.EventIdentifier -ErrorAction SilentlyContinue
    }

    $status = (& git status --porcelain=v1 | Out-String).Trim()
    if (-not $status -or $status -eq $lastStatus) { continue }
    $publishedStatus = Publish-Changes
    if ($publishedStatus) { $lastStatus = $publishedStatus }
  }
}
finally {
  $watcher.EnableRaisingEvents = $false
  $subscriptions | Unregister-Event -ErrorAction SilentlyContinue
  $watcher.Dispose()
}
