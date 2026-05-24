'use strict';

// Konfigurasi PM2 untuk menjalankan bot Kios Openclaw 24/7 di VPS Linux.
// Jalankan dari root project:  pm2 start config/ecosystem.config.js
// Satu proses ini sudah mencakup bot Telegram + node-cron (laporan terjadwal)
// + pemanggilan skill Python. Telegram pakai long polling, jadi TIDAK butuh
// port masuk / domain / webhook.

const path = require('path');
const ROOT = path.join(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'kios-bot',
      script: path.join(ROOT, 'signal', 'bot-handler.js'),
      cwd: ROOT,
      interpreter: 'node',

      // Selalu hidupkan ulang kalau crash, dengan jeda & backoff agar tidak nge-loop.
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '30s',

      // Batas memori — restart kalau bocor (Oracle Always Free ARM punya RAM cukup).
      max_memory_restart: '400M',

      // Satu instance (long polling Telegram tidak boleh dobel — bisa 409 conflict).
      instances: 1,
      exec_mode: 'fork',

      // Logging — timestamp + file terpisah di logs/.
      time: true,
      merge_logs: true,
      out_file: path.join(ROOT, 'logs', 'pm2-out.log'),
      error_file: path.join(ROOT, 'logs', 'pm2-error.log'),

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
