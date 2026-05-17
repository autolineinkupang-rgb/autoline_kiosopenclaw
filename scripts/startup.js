#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'startup.log');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const PROGRESS_FILE = path.join(ROOT, '.rufo-progress.json');
const setupOnly = process.argv.includes('--setup-only');

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function updateProgress(stage, status, detail = '') {
  let prog = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try { prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  prog[stage] = { status, detail, ts: dayjs().toISOString() };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(prog, null, 2));
}

function cekDependencies() {
  const required = ['config/openclaw.json', 'data/stok.csv', 'memory/kios-memory.json'];
  const missing = required.filter(f => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length > 0) {
    log(`❌ File tidak ditemukan: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

function jalankanService(nama, script, args = []) {
  return new Promise((resolve) => {
    log(`🚀 Menjalankan: ${nama}`);
    const proc = spawn('node', [path.join(ROOT, script), ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    proc.stdout.on('data', d => process.stdout.write(`[${nama}] ${d}`));
    proc.stderr.on('data', d => process.stderr.write(`[${nama}] ERROR: ${d}`));

    proc.on('close', (code) => {
      if (code === 0 || code === 2) { // 2 = stok kritis (normal)
        log(`✅ ${nama} selesai (exit: ${code})`);
        updateProgress(nama, 'completed', `exit ${code}`);
      } else {
        log(`⚠️  ${nama} exit dengan kode ${code}`);
        updateProgress(nama, 'warning', `exit ${code}`);
      }
      resolve(code);
    });

    proc.on('error', (err) => {
      log(`❌ ${nama} error: ${err.message}`);
      updateProgress(nama, 'failed', err.message);
      resolve(-1);
    });
  });
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  KIOS OPENCLAW — SISTEM MANAJEMEN KIOS DESA');
  console.log('  Powered by Groq Llama 4 Scout + Gemini 2.0 Flash');
  console.log('='.repeat(60) + '\n');

  log('System startup dimulai');
  updateProgress('startup', 'running');

  if (!cekDependencies()) {
    log('Jalankan setup terlebih dahulu');
    process.exit(1);
  }

  // Update startup time di memory
  const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  memory.system.startup_time = dayjs().toISOString();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));

  if (setupOnly) {
    log('Setup-only mode — tidak menjalankan service');
    updateProgress('startup', 'completed', 'setup-only');
    return;
  }

  // Jalankan cek stok dulu
  await jalankanService('cek-stok', 'scripts/cek-stok.js');

  // Laporan awal
  await jalankanService('laporan-harian', 'scripts/laporan-harian.js', ['--test']);

  // Jalankan memory checkpoint sebagai background process
  log('🔄 Menjalankan memory checkpoint (background)...');
  const checkpoint = spawn('node', [path.join(ROOT, 'scripts/memory-checkpoint.js')], {
    stdio: 'ignore',
    detached: true,
  });
  checkpoint.unref();
  log(`✅ Checkpoint berjalan di background (PID: ${checkpoint.pid})`);

  updateProgress('startup', 'completed');
  log('\n✅ Sistem Kios Desa siap beroperasi!\n');
  console.log('Gunakan `npm run laporan` untuk laporan manual');
  console.log('Gunakan `npm run cek-stok` untuk cek stok');
  console.log('Dashboard: npm run dashboard\n');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
