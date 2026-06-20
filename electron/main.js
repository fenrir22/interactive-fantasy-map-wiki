const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

const SERVER_PORT = 3000;

// In packaged app, __dirname points inside app.asar, use process.resourcesPath
const isPackaged = app.isPackaged;
const resourcesDir = isPackaged ? process.resourcesPath : __dirname;
const dataPath = process.env.DATA_PATH || path.join(app.getPath('userData'), 'data');

let mainWindow = null;
let serverProcess = null;

function log(msg) { console.log(`[Aetherion] ${msg}`); }

function waitForServer(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http.get(`http://localhost:${port}`, (res) => {
        resolve(res.statusCode);
      }).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Server timeout'));
        setTimeout(check, 300);
      });
    }
    check();
  });
}

function seedFiles() {
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
  try {
    const seedPath = path.join(resourcesDir, 'seed-data.js');
    log(`Loading seed from: ${seedPath}`);
    const seed = require(seedPath);
    let count = 0;
    for (const [rel, data] of Object.entries(seed)) {
      const dst = path.join(dataPath, rel);
      if (!fs.existsSync(dst)) {
        const dir = path.dirname(dst);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dst, data.t || Buffer.from(data.b, 'base64'));
        count++;
      }
    }
    log(`Seeded ${count} new files to ${dataPath}`);
  } catch (e) {
    log(`Seed error: ${e.message}`);
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(resourcesDir, 'server-bundle.js');
    log(`Server script: ${serverScript}`);
    log(`DATA_PATH: ${dataPath}`);
    log(`Packaged: ${isPackaged}`);

    serverProcess = fork(serverScript, [], {
      env: {
        ...process.env,
        DATA_PATH: dataPath,
        PORT: String(SERVER_PORT)
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    serverProcess.stdout.on('data', (d) => log(`Server: ${d.toString().trim()}`));
    serverProcess.stderr.on('data', (d) => log(`Server err: ${d.toString().trim()}`));

    serverProcess.on('error', (err) => {
      log(`Server process error: ${err.message}`);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      log(`Server exited with code ${code}`);
      if (code !== 0 && !mainWindow) reject(new Error(`Server exited ${code}`));
    });

    waitForServer(SERVER_PORT, 15000).then(() => {
      log('Server is ready');
      resolve();
    }).catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Aetherion',
    backgroundColor: '#080c1a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', () => {
    if (serverProcess) serverProcess.kill();
  });
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#080c1a',
    resizable: false,
    skipTaskbar: true
  });
  splash.loadFile(path.join(resourcesDir, 'splash.html'));
  return splash;
}

app.whenReady().then(async () => {
  const splash = createSplash();
  try {
    seedFiles();
    await startServer();
    createWindow();
    mainWindow.once('ready-to-show', () => {
      splash.close();
      mainWindow.show();
    });
  } catch (err) {
    log(`Fatal: ${err.message}`);
    splash.close();
    dialog.showErrorBox('Aetherion', `Failed to start:\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
