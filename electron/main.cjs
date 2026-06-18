'use strict';
const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const IS_DEV = !!process.env.ELECTRON_DEV;
const SERVER_PORT = parseInt(process.env.PORT || '3001', 10);

let serverProcess = null;
let mainWindow = null;

// --- Backend server ---
function startServer() {
  // In packaged app, server lives under resources/; in dev, one level up
  const prodPath = path.join(process.resourcesPath, 'server', 'index.js');
  const devPath  = path.join(__dirname, '..', 'server', 'index.js');
  const script   = fs.existsSync(prodPath) ? prodPath : devPath;

  const nodeBin = process.execPath; // use Electron's bundled Node
  serverProcess = spawn(nodeBin, [script], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', d => console.log('[server]', d.toString().trim()));
  serverProcess.stderr.on('data', d => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', code => console.log(`[server] exited with code ${code}`));
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = http.get(`http://localhost:${SERVER_PORT}/api/auth`, res => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n <= 0) return reject(new Error('Server did not start in time'));
        setTimeout(() => attempt(n - 1), 300);
      });
      req.end();
    }
    attempt(retries);
  });
}

// --- Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 820,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#111b21',
    show: false,
    icon: path.join(__dirname, '..', 'client', 'public', 'icon-512.png'),
    title: 'VYRE',
  });

  Menu.setApplicationMenu(buildMenu());

  const url = IS_DEV
    ? 'http://localhost:5173'
    : `http://localhost:${SERVER_PORT}`;

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in default browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });

  if (IS_DEV) mainWindow.webContents.openDevTools();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(IS_DEV ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}

// --- Lifecycle ---
app.whenReady().then(async () => {
  if (!IS_DEV) {
    startServer();
    try {
      await waitForServer();
      console.log('Backend ready.');
    } catch (e) {
      console.error('Backend failed to start:', e.message);
    }
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killServer();
    app.quit();
  }
});

app.on('before-quit', killServer);

function killServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}
