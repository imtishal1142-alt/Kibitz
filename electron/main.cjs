// Kibitz desktop shell: the same app as the website, in its own window, with files served from the app itself.
//
//  * The app is served from a private app://kibitz/ address backed by the packaged "dist" folder. A custom address
//    (rather than file://) lets the chess engine's WebAssembly load with the right content type and gives the app a
//    stable origin for its stored data.
//  * The page runs with contextIsolation, no Node access and the sandbox on. The preload script exposes only the
//    backup functions in preload.cjs.
//  * Links to other sites open in the system browser; the window itself never leaves the app.
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { writeBackup } = require('./backup.cjs');

const SCHEME = 'app';
const HOST = 'kibitz';
const ORIGIN = `${SCHEME}://${HOST}`;
const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
const configPath = () => path.join(app.getPath('userData'), 'desktop-config.json');
const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
};
const writeConfig = (c) => fs.writeFileSync(configPath(), JSON.stringify(c, null, 2));

/** Resolve a request path inside dist, or null if it would escape it. */
function resolveInDist(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return null;
  return file;
}

function serveApp(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('not found', { status: 404 });
  let file = resolveInDist(url.pathname);
  if (!file) return new Response('forbidden', { status: 403 });
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const body = fs.readFileSync(file);
    return new Response(body, { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

// Node reports the origin of a custom address as "null", so compare scheme and host instead.
const isAppUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === `${SCHEME}:` && x.host === HOST;
  } catch {
    return false;
  }
};
const fromApp = (event) => isAppUrl(event.senderFrame?.url ?? '');

function registerIpc() {
  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.handle('backup:folder', (e) => (fromApp(e) ? (readConfig().backupFolder ?? null) : null));
  ipcMain.handle('backup:choose', async (e) => {
    if (!fromApp(e)) return null;
    const res = await dialog.showOpenDialog(win, { title: 'Choose a folder for Kibitz backups', properties: ['openDirectory', 'createDirectory'], defaultPath: readConfig().backupFolder ?? app.getPath('documents') });
    if (res.canceled || !res.filePaths[0]) return null;
    writeConfig({ ...readConfig(), backupFolder: res.filePaths[0] });
    return res.filePaths[0];
  });
  ipcMain.handle('backup:write', (e, name, text, keep) => {
    if (!fromApp(e)) throw new Error('Not allowed.');
    return writeBackup(readConfig().backupFolder, name, text, keep);
  });
  ipcMain.handle('backup:reveal', async (e) => {
    if (!fromApp(e)) return;
    const f = readConfig().backupFolder;
    if (f) await shell.openPath(f);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#262522',
    title: 'Kibitz',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  void win.loadURL(`${ORIGIN}/index.html`);
  win.on('closed', () => {
    win = null;
  });
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }])] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveApp);
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
