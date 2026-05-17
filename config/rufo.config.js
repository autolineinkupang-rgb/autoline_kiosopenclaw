// Ruflo Task Batching Configuration
// Optimalkan eksekusi untuk koneksi < 10 Mbps

module.exports = {
  version: "1.0",

  batch: {
    enabled: true,
    maxConcurrent: 3,        // Max 3 task paralel (hemat RAM 8GB)
    delayBetweenMs: 200,     // Jeda antar task (hindari rate limit)
    retryFailed: true,
    maxRetry: 2,
  },

  cache: {
    enabled: true,
    ttlSeconds: 300,         // Cache 5 menit (sesuai jadwal checkpoint)
    targets: [
      "config/openclaw.json",
      "config/agent-kios.yaml",
      "data/stok.csv",
    ],
    strategy: "file-hash",   // Cek hash, skip re-read jika tidak berubah
  },

  diff: {
    enabled: true,
    sendDiffOnly: true,      // Hemat bandwidth desa
    minDiffSizeBytes: 100,   // Kirim full jika perubahan < 100 bytes
  },

  progress: {
    file: ".rufo-progress.json",
    autoSave: true,
    continueOnError: true,   // Lanjut ke task berikut jika 1 error
  },

  tasks: {
    // Task dengan prioritas tinggi
    priority: ["laporan_harian", "cek_stok", "alert_signal"],

    // Task yang bisa dibatch bersamaan
    batchGroups: {
      data_init: ["stok.csv", "pulsa.csv", "transaksi.csv", "memory init"],
      scripts_init: ["laporan-harian.js", "cek-stok.js", "backup.js"],
      signal_init: ["bot-handler.js", "message-parser.js", "response-formatter.js"],
    },
  },

  network: {
    timeout: 8000,
    compress: true,
    maxRetry: 3,
    backoffMs: [1000, 2000, 5000],  // Exponential backoff
  },

  logging: {
    level: "info",           // error | warn | info | debug
    file: "logs/rufo.log",
    maxSizeMB: 10,
    rotateDays: 7,
  },
};
