#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const ROOT = path.join(__dirname, '..');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const CHECKPOINT_FILE = path.join(ROOT, 'memory', 'checkpoint.json');
const LOG_FILE = path.join(ROOT, 'logs', 'checkpoint.log');

const INTERVAL_MS = 5 * 60 * 1000; // 5 menit

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function simpanCheckpoint() {
  try {
    const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));

    const id = checkpoint.last_id + 1;
    const entry = {
      id,
      ts: dayjs().toISOString(),
      snapshot: {
        omzet_harian: memory.harian?.omzet || 0,
        total_tx: memory.harian?.total_transaksi || 0,
        stok_kritis: memory.harian?.stok_kritis || [],
        ai_provider: memory.ai?.provider_aktif || 'unknown',
      },
    };

    checkpoint.checkpoints.push(entry);
    checkpoint.last_id = id;

    // Keep hanya max_keep checkpoint
    if (checkpoint.checkpoints.length > checkpoint.max_keep) {
      checkpoint.checkpoints = checkpoint.checkpoints.slice(-checkpoint.max_keep);
    }

    // Update last_checkpoint di memory
    memory.last_checkpoint = entry.ts;
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));

    log(`✅ Checkpoint #${id} disimpan`);
  } catch (err) {
    log(`❌ Checkpoint gagal: ${err.message}`);
  }
}

if (process.argv.includes('--once')) {
  simpanCheckpoint();
} else {
  log(`Memory checkpoint aktif — interval: 5 menit`);
  simpanCheckpoint(); // Jalankan sekali langsung
  setInterval(simpanCheckpoint, INTERVAL_MS);

  process.on('SIGTERM', () => { log('Checkpoint dihentikan'); process.exit(0); });
  process.on('SIGINT', () => { log('Checkpoint dihentikan'); process.exit(0); });
}
