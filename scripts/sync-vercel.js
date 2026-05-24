#!/usr/bin/env node
'use strict';

/**
 * sync-vercel.js — Sync data lokal (VPS) ke Upstash Redis
 *
 * Dashboard di Vercel baca dari Upstash, jadi data selalu sinkron dengan bot VPS.
 * Jalankan via cron tiap 1 menit:
 *   * * * * * cd /home/ubuntu/kios-openclaw && node scripts/sync-vercel.js >> logs/sync-vercel.log 2>&1
 *
 * Atau panggil manual dari bot setiap transaksi (lihat signal/bot-handler.js).
 *
 * ENV yang dibutuhkan di .env:
 *   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=xxx
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const redis = require('./redis');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');

const FILES = [
  { file: 'stok.csv',       key: 'kios:stok',       format: 'csv'  },
  { file: 'transaksi.csv',  key: 'kios:transaksi',  format: 'csv'  },
  { file: 'pembelian.csv',  key: 'kios:pembelian',  format: 'csv'  },
  { file: 'price-history.csv', key: 'kios:price_history', format: 'csv' },
];

function ts() { return new Date().toISOString(); }

async function pushCsv(filename, key) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`[${ts()}] [skip] ${filename} tidak ada`);
    return { ok: false, rows: 0 };
  }
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const data = parse(content, { columns: true, skip_empty_lines: true });
    const ok = await redis.set(key, data);
    console.log(`[${ts()}] [${ok ? 'ok' : 'FAIL'}] ${key}: ${data.length} rows`);
    return { ok, rows: data.length };
  } catch (e) {
    console.error(`[${ts()}] [error] ${key}:`, e.message);
    return { ok: false, error: e.message };
  }
}

async function pushMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return { ok: false };
  try {
    const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    const ok = await redis.set('kios:memory', data);
    console.log(`[${ts()}] [${ok ? 'ok' : 'FAIL'}] kios:memory`);
    return { ok };
  } catch (e) {
    console.error(`[${ts()}] [error] memory:`, e.message);
    return { ok: false, error: e.message };
  }
}

async function pushHeartbeat() {
  // Marker: kapan data terakhir sinkron — dashboard bisa tampilkan "Last sync: X menit lalu"
  return redis.set('kios:sync_ts', new Date().toISOString());
}

async function main() {
  if (!redis.tersedia()) {
    console.error(`[${ts()}] UPSTASH_REDIS_REST_URL atau _TOKEN belum diset di .env. Sync dibatalkan.`);
    process.exit(1);
  }

  const results = await Promise.all([
    ...FILES.map(f => pushCsv(f.file, f.key)),
    pushMemory(),
    pushHeartbeat(),
  ]);

  const totalOk = results.filter(r => r?.ok).length;
  console.log(`[${ts()}] Sync selesai: ${totalOk}/${results.length} berhasil`);
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { pushCsv, pushMemory, main };
