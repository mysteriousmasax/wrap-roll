const { app, BrowserWindow, dialog, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = Number(process.env.WRAP_ROLL_PORT || 3100);
let serverProcess;

function requestHealth() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${PORT}/api/health`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await requestHealth()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function startServer() {
  const packagedServerRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server')
    : path.join(app.getAppPath(), 'server');
  const runtimeRoot = app.isPackaged ? path.join(app.getPath('userData'), 'runtime') : app.getAppPath();
  const serverRoot = app.isPackaged ? path.join(runtimeRoot, 'server') : packagedServerRoot;
  if (app.isPackaged) {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.cpSync(packagedServerRoot, serverRoot, { recursive: true });
    fs.cpSync(path.join(process.resourcesPath, 'node_modules'), path.join(runtimeRoot, 'node_modules'), { recursive: true });
  }
  const serverEntry = path.join(serverRoot, 'index.js');
  const databasePath = path.join(app.getPath('userData'), 'data', 'wraproll.db');
  const clientDistPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'dist') : path.join(app.getAppPath(), 'dist');
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      DB_PATH: databasePath,
      CLIENT_DIST_PATH: clientDistPath,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  serverProcess.on('exit', (code) => {
    if (code && !app.isQuitting) dialog.showErrorBox('Wrap & Roll POS stopped', `The local POS service stopped unexpectedly (code ${code}).`);
  });
}

async function createWindow() {
  const appUrl = app.isPackaged ? 'https://wrapandrolltz.com/login' : `http://127.0.0.1:${PORT}/login`;
  if (!app.isPackaged) {
    startServer();
    const ready = await waitForServer();
    if (!ready) {
      dialog.showErrorBox('Wrap & Roll POS could not start', 'The local POS service did not become ready. Restart the application and try again.');
      app.quit();
      return;
    }
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#fffdfa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(appUrl);
  window.once('ready-to-show', () => window.show());
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  serverProcess?.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});