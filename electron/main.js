const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3000;
const isDev = process.env.ELECTRON_DEV === '1';
let mainWindow;
let nextProcess;

function waitForServer(retries = 80) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const attempt = () => {
      const req = http.get(`http://localhost:${PORT}/api/stok`, (res) => {
        if (res.statusCode < 500) { res.resume(); resolve(); }
        else { res.resume(); retry(); }
      });
      req.on('error', retry);
      req.setTimeout(800, () => { req.destroy(); retry(); });
      function retry() {
        if (++count >= retries) reject(new Error('Server tidak bisa start setelah 40 detik.'));
        else setTimeout(attempt, 500);
      }
    };
    attempt();
  });
}

function startNext() {
  const dashDir = path.join(__dirname, '..', 'dashboard');
  const cmd = isDev ? 'npm' : 'node';
  const args = isDev ? ['run', 'dev'] : ['.next/standalone/server.js'];

  nextProcess = spawn(cmd, args, {
    cwd: dashDir,
    shell: false,
    env: { ...process.env, PORT: String(PORT), HOSTNAME: '0.0.0.0' },
    stdio: 'pipe',
    detached: false,
  });

  nextProcess.stderr?.on('data', (d) => process.stderr.write(d));
  nextProcess.on('error', (err) => {
    dialog.showErrorBox('Gagal Menjalankan Server', `Next.js error: ${err.message}`);
  });
  nextProcess.on('exit', (code) => {
    if (code && code !== 0 && mainWindow) {
      mainWindow.webContents.loadURL(
        `data:text/html,<h2 style="font-family:sans-serif;color:#dc2626;padding:2rem">Server berhenti (kode ${code}). Tutup dan buka ulang aplikasi.</h2>`
      );
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Kios Desa Maju',
    backgroundColor: '#f0fdf4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  startNext();

  const splash = new BrowserWindow({
    width: 380,
    height: 220,
    frame: false,
    backgroundColor: '#14532d',
    resizable: false,
    center: true,
  });

  splash.loadURL(
    `data:text/html,<!DOCTYPE html><html><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:%2314532d;color:white;font-family:system-ui,sans-serif;gap:8px"><div style="font-size:3rem">🏪</div><div style="font-size:1.1rem;font-weight:700;letter-spacing:.5px">Kios Desa Maju</div><div style="font-size:.8rem;opacity:.6;margin-top:4px">Memuat sistem...</div></body></html>`
  );

  try {
    await waitForServer();
  } catch (e) {
    splash.close();
    dialog.showErrorBox('Gagal Memuat', e.message + '\n\nPastikan dependensi sudah terinstall:\ncd dashboard && npm install');
    app.quit();
    return;
  }

  splash.close();
  createWindow();
});

app.on('window-all-closed', () => {
  killNext();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('will-quit', killNext);

function killNext() {
  if (!nextProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', nextProcess.pid, '/f', '/t']);
    } else {
      nextProcess.kill('SIGTERM');
    }
  } catch {}
  nextProcess = null;
}
