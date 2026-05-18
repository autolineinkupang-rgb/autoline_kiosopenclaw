const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3000;
const isDev = process.env.ELECTRON_DEV === '1';
let mainWindow;
let nextProcess;

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const attempt = () => {
      http.get(`http://localhost:${PORT}/api/stok`, (res) => {
        if (res.statusCode < 500) resolve();
        else retry();
      }).on('error', retry);
      function retry() {
        if (++count >= retries) reject(new Error('Server tidak mau start'));
        else setTimeout(attempt, 500);
      }
    };
    attempt();
  });
}

function startNext() {
  const dashDir = path.join(__dirname, '..', 'dashboard');

  // standalone output: gunakan node server.js, bukan "next start"
  const cmd = isDev ? 'npm' : 'node';
  const args = isDev
    ? ['run', 'dev']
    : ['.next/standalone/server.js'];

  nextProcess = spawn(cmd, args, {
    cwd: dashDir,
    shell: false,
    env: { ...process.env, PORT: String(PORT), HOSTNAME: '0.0.0.0' },
    stdio: 'pipe',
  });
  nextProcess.stderr?.on('data', (d) => process.stderr.write(d));
  nextProcess.on('error', (err) => console.log('Next.js error:', err.message));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Kios Desa Cerdas',
    backgroundColor: '#f0fdf4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  startNext();

  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    backgroundColor: '#166534',
    resizable: false,
  });
  splash.loadURL(
    `data:text/html,<!DOCTYPE html><html><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:%23166534;color:white;font-family:system-ui,sans-serif"><div style="font-size:3.5em">🏪</div><h2 style="margin:12px 0 6px;font-size:1.2em">Kios Desa Cerdas</h2><p style="margin:0;opacity:.65;font-size:.85em">Memuat sistem...</p></body></html>`
  );

  await waitForServer().catch((e) => console.error(e.message));
  splash.close();
  createWindow();
});

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  app.quit();
});

app.on('will-quit', () => {
  if (nextProcess) nextProcess.kill();
});
