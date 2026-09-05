@echo off
setlocal

set "ROOT=%~dp0"
set "NODE=%ROOT%.node\node-v20.18.0-win-x64\node.exe"
set "VITE=%ROOT%node_modules\vite\bin\vite.js"
set "SERVER=%ROOT%server\index.js"
set "CLOUDFLARED=%ROOT%cloudflared.exe"
set "TUNNEL_SCRIPT=%ROOT%open-cloudflare-tunnel.ps1"
set "DATA_DIR=%LOCALAPPDATA%\WrapRollPOS"
set "DB_PATH=%DATA_DIR%\wraproll.db"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DB_PATH%" if exist "%ROOT%server\db\wraproll.db" copy /Y "%ROOT%server\db\wraproll.db" "%DB_PATH%" >nul

if not exist "%NODE%" (
  echo Could not find the bundled Node runtime.
  echo Expected: %NODE%
  pause
  exit /b 1
)

if not exist "%VITE%" (
  echo Frontend dependencies are missing. Run npm install in the project first.
  pause
  exit /b 1
)

if not exist "%CLOUDFLARED%" (
  echo Downloading the official Cloudflare Tunnel client...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CLOUDFLARED%'"
  if errorlevel 1 (
    echo Cloudflare download failed. Install cloudflared manually and run this file again.
    pause
    exit /b 1
  )
)

echo Starting Wrap ^& Roll backend...
start "Wrap & Roll API" powershell.exe -NoProfile -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; & '%NODE%' '%SERVER%'"

echo Starting Wrap ^& Roll frontend...
start "Wrap & Roll Website" powershell.exe -NoProfile -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; & '%NODE%' '%VITE%' --host 0.0.0.0"

echo Waiting for the frontend to become ready...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ready=$false; 1..30 | ForEach-Object { if (-not $ready) { try { $response=Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready=$true } } catch {}; if (-not $ready) { ping.exe -n 2 127.0.0.1 | Out-Null } } }; if (-not $ready) { Write-Host 'Frontend did not become ready in time.' -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo The frontend did not start, so the public tunnel was not opened.
  pause
  exit /b 1
)

echo Starting Cloudflare public tunnel...
start "Wrap & Roll Public Link" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TUNNEL_SCRIPT%" -CloudflaredPath "%CLOUDFLARED%"

echo.
echo Services are starting in separate windows.
echo Keep all three windows open while using the website, FOH, and KDS.
echo The Cloudflare window will open the public https://...trycloudflare.com link automatically.
echo.
pause