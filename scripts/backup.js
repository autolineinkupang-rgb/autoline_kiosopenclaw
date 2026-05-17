#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'backup.log');
const BACKUP_DIR = path.join(ROOT, 'backups');

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

function main() {
  log('Backup dimulai');

  const tanggal = dayjs().format('YYYY-MM-DD');
  const backupDir = path.join(BACKUP_DIR, tanggal);

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  const filesToBackup = [
    ['data/stok.csv', 'stok.csv'],
    ['data/transaksi.csv', 'transaksi.csv'],
    ['data/pulsa.csv', 'pulsa.csv'],
    ['memory/kios-memory.json', 'kios-memory.json'],
    ['memory/checkpoint.json', 'checkpoint.json'],
  ];

  let berhasil = 0;
  filesToBackup.forEach(([src, dest]) => {
    const ok = copyFile(path.join(ROOT, src), path.join(backupDir, dest));
    if (ok) { berhasil++; log(`✅ Backup: ${dest}`); }
    else log(`⚠️  Skip (tidak ada): ${src}`);
  });

  // Hapus backup lebih dari 7 hari
  const semua = fs.readdirSync(BACKUP_DIR).sort();
  if (semua.length > 7) {
    const hapus = semua.slice(0, semua.length - 7);
    hapus.forEach(dir => {
      const fullPath = path.join(BACKUP_DIR, dir);
      fs.rmSync(fullPath, { recursive: true, force: true });
      log(`🗑️  Hapus backup lama: ${dir}`);
    });
  }

  log(`Backup selesai — ${berhasil}/${filesToBackup.length} file`);
}

main();
