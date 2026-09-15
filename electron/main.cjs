const { app, BrowserWindow, dialog, session, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = Number(process.env.WRAP_ROLL_PORT || 3100);
let serverProcess;
let posWindows = [];
const hasSingleInstance = app.requestSingleInstanceLock();

if (!hasSingleInstance) {
  app.quit();
}

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

function requestJson(route) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${PORT}${route}`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(body || '{}') }); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(1500, () => request.destroy(new Error('Local POS request timed out')));
    request.on('error', reject);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await requestHealth()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureBranchSetup() {
  try {
    const status = await requestJson('/api/desktop/branch-status');
    if (status.data.configured) return true;
  } catch {}

  const setupWindow = new BrowserWindow({
    width: 560,
    height: 620,
    resizable: false,
    title: 'Wrap & Roll Branch Setup',
    backgroundColor: '#fffdfa',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await setupWindow.loadURL(`http://127.0.0.1:${PORT}/desktop-setup`);
  let completed = false;
  await new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const status = await requestJson('/api/desktop/branch-status');
        if (status.data.configured) {
          completed = true;
          clearInterval(timer);
          if (!setupWindow.isDestroyed()) setupWindow.close();
          resolve();
        }
      } catch {}
    }, 500);
    setupWindow.on('closed', () => {
      clearInterval(timer);
      if (!completed && !app.isQuitting) app.quit();
      resolve();
    });
  });
  return !app.isQuitting;
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

async function createWindow(role, bounds, partition) {
  const appUrl = `http://127.0.0.1:${PORT}/${role}`;

  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: false,
    title: role === 'pos' ? 'Wrap & Roll POS · FOH' : 'Wrap & Roll POS · KDS',
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#fffdfa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition,
    },
  });

  await window.loadURL(appUrl);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    posWindows = posWindows.filter((entry) => entry !== window);
  });
  posWindows.push(window);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  startServer();
  const ready = await waitForServer();
  if (!ready) {
    dialog.showErrorBox('Wrap & Roll POS could not start', 'The local POS service did not become ready. Restart the application and try again.');
    app.quit();
    return;
  }
  if (!(await ensureBranchSetup())) return;
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((display) => display.id !== primary.id) || primary;
  const primaryBounds = primary.bounds;
  const fohBounds = displays.length > 1
    ? primaryBounds
    : { x: primaryBounds.x, y: primaryBounds.y, width: Math.floor(primaryBounds.width / 2), height: primaryBounds.height };
  const kdsBounds = displays.length > 1
    ? secondary.bounds
    : { x: primaryBounds.x + Math.floor(primaryBounds.width / 2), y: primaryBounds.y, width: primaryBounds.width - Math.floor(primaryBounds.width / 2), height: primaryBounds.height };
  await createWindow('pos', fohBounds, 'persist:wrap-roll-foh');
  await createWindow('kds', kdsBounds, 'persist:wrap-roll-kds');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow('pos', fohBounds, 'persist:wrap-roll-foh');
      createWindow('kds', kdsBounds, 'persist:wrap-roll-kds');
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  serverProcess?.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});