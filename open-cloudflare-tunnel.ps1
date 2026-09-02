param(
  [Parameter(Mandatory = $true)]
  [string]$CloudflaredPath,

  [string]$TargetUrl = 'http://localhost:5173'
)

$opened = $false
$urlPattern = '(?i)https://[a-z0-9-]+\.trycloudflare\.com(?:/[^\s]*)?'

Write-Host ''
Write-Host 'Your public Wrap & Roll website link will appear below:' -ForegroundColor Yellow
Write-Host ''

& $CloudflaredPath tunnel --url $TargetUrl 2>&1 | ForEach-Object {
  $line = $_.ToString()
  Write-Host $line

  if (-not $opened -and $line -match $urlPattern) {
    $publicUrl = $Matches[0].TrimEnd([char[]]@('.', ',', ';', ')', ']', '"', "'"))
    $websiteUrl = $publicUrl.TrimEnd('/') + '/'
    $opened = $true
    Write-Host "Opening $websiteUrl in your default browser..." -ForegroundColor Green
    try {
      Start-Process -FilePath 'explorer.exe' -ArgumentList $websiteUrl
    } catch {
      Start-Process -FilePath $websiteUrl
    }
  }
}

if (-not $opened) {
  Write-Host 'The tunnel stopped before a public URL was detected.' -ForegroundColor Red
}

Write-Host ''
Write-Host 'Press Ctrl+C to stop the public tunnel.' -ForegroundColor Yellow
Read-Host 'Press Enter to close this window'
