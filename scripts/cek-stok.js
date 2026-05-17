#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const dayjs = require('dayjs');

const isTest = process.argv.includes('--test');
const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(__dirname, '..', 'memory', 'kios-memory.json');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'stok.log');

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function bacaStok() {
  const file = path.join(DATA_DIR, 'stok.csv');
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
}

function kategorikanStok(stok) {
  const kritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
  const rendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));
  const aman = stok.filter(s => Number(s.stok) > Number(s.stok_minimum));
  return { kritis, rendah, aman };
}

function tampilkanStok(stok) {
  const { kritis, rendah, aman } = kategorikanStok(stok);

  console.log('\n📦 STATUS STOK KIOS DESA MAJU');
  console.log('='.repeat(55));

  if (kritis.length > 0) {
    console.log('\n🔴 KRITIS (perlu restock segera):');
    kritis.forEach(s => {
      console.log(`  ⚠️  ${s.nama.padEnd(25)} sisa: ${String(s.stok).padStart(3)} ${s.satuan}`);
    });
  }

  if (rendah.length > 0) {
    console.log('\n🟡 RENDAH (restock minggu ini):');
    rendah.forEach(s => {
      console.log(`  ⬇️  ${s.nama.padEnd(25)} sisa: ${String(s.stok).padStart(3)} ${s.satuan}`);
    });
  }

  if (aman.length > 0) {
    console.log('\n🟢 AMAN:');
    aman.forEach(s => {
      console.log(`  ✅  ${s.nama.padEnd(25)} sisa: ${String(s.stok).padStart(3)} ${s.satuan}`);
    });
  }

  console.log('\n' + '='.repeat(55));
  console.log(`Total: ${stok.length} produk | Kritis: ${kritis.length} | Rendah: ${rendah.length} | Aman: ${aman.length}`);
  console.log('='.repeat(55) + '\n');

  return { kritis, rendah, aman };
}

function main() {
  log('Cek stok dimulai');
  const stok = bacaStok();
  const hasil = tampilkanStok(stok);

  // Update memory
  const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  memory.harian.stok_kritis = hasil.kritis.map(s => s.nama);
  if (hasil.kritis.length > 0) {
    memory.alert.pending.push({
      tipe: 'stok_kritis',
      data: hasil.kritis.map(s => `${s.nama} (sisa: ${s.stok})`),
      waktu: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    });
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));

  if (hasil.kritis.length > 0) {
    log(`ALERT: ${hasil.kritis.length} produk kritis — ${hasil.kritis.map(s => s.nama).join(', ')}`);
    process.exit(2); // Exit code 2 = ada stok kritis
  }

  log('Cek stok selesai — semua aman');
}

main();
