#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PHONE = process.env.SIGNAL_NUMBER || process.env.SIGNAL_PHONE_NUMBER;
const RECIPIENT = process.env.SIGNAL_RECIPIENT;
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';
const ENV_FILE = path.join(__dirname, '..', '.env');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'signal-error.log');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function simpanEnvVar(key, value) {
  let content = '';
  try { content = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* buat baru */ }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

function cekSignalCli() {
  const r = spawnSync(SIGNAL_CLI, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (r.error) {
    log(`signal-cli tidak ditemukan: ${r.error.message}`);
    log('Panduan install: https://github.com/AsamK/signal-cli/releases');
    process.exit(1);
  }
  log(`signal-cli tersedia: ${(r.stdout + r.stderr).trim()}`);
}

function buatGrup() {
  log(`Membuat grup "Kios Cerdas HQ" dengan anggota ${RECIPIENT}...`);

  // signal-cli >= 0.11 pakai updateGroup (tanpa --group-id = buat baru)
  // Gunakan -o json untuk output yang mudah di-parse
  const r = spawnSync(SIGNAL_CLI, [
    '-o', 'json',
    '-u', PHONE,
    'updateGroup',
    '--name', 'Kios Cerdas HQ',
    '--member', RECIPIENT,
  ], { encoding: 'utf8', timeout: 30000 });

  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  log(`stdout: ${stdout || '(kosong)'}`);
  if (stderr) log(`stderr: ${stderr}`);

  if (r.error) {
    log(`Error: ${r.error.message}`);
    return null;
  }

  // Parse JSON output dari signal-cli
  for (const line of stdout.split('\n')) {
    try {
      const json = JSON.parse(line.trim());
      // Format: {"groupId":"...","...":"..."} atau {"result":{"groupId":"..."}}
      const gid = json.groupId || json.result?.groupId || json.id || json.result?.id;
      if (gid) return gid;
    } catch { /* bukan JSON, coba pattern */ }
  }

  // Fallback: regex terhadap seluruh output
  const allOutput = stdout + '\n' + stderr;
  const patterns = [
    /groupId["\s:]+([A-Za-z0-9+/=]{20,})/,
    /id["\s:]+([A-Za-z0-9+/=]{20,})/,
    /"([A-Za-z0-9+/=]{30,})"/,
    /^([A-Za-z0-9+/=]{20,})$/m,
  ];
  for (const pat of patterns) {
    const m = allOutput.match(pat);
    if (m) return m[1].trim();
  }

  log('Tidak bisa parse group ID secara otomatis.');
  log('Set manual di .env: SIGNAL_GROUP_ID=<id dari output di atas>');
  return null;
}

function kirimKegrup(teks, groupId) {
  const r = spawnSync(SIGNAL_CLI, [
    '-u', PHONE, 'send', '-g', groupId, '-m', teks,
  ], { encoding: 'utf8', timeout: 15000 });

  if (r.error || r.status !== 0) {
    log(`Gagal kirim ke grup: ${r.error?.message || r.stderr}`);
    return false;
  }
  log('Pesan sambutan terkirim ke grup!');
  return true;
}

function main() {
  log('=== SIGNAL SETUP DIMULAI ===');

  if (!PHONE) { log('FATAL: SIGNAL_NUMBER tidak diset di .env'); process.exit(1); }
  if (!RECIPIENT) { log('FATAL: SIGNAL_RECIPIENT tidak diset di .env'); process.exit(1); }

  cekSignalCli();

  let groupId = process.env.SIGNAL_GROUP_ID;
  if (groupId) {
    log(`Grup sudah ada: ${groupId} — skip pembuatan`);
  } else {
    groupId = buatGrup();
    if (!groupId) {
      log('Setup grup gagal. Cek logs/signal-error.log untuk detail.');
      process.exit(1);
    }
    log(`Grup berhasil dibuat, ID: ${groupId}`);
    simpanEnvVar('SIGNAL_GROUP_ID', groupId);
    log('SIGNAL_GROUP_ID disimpan ke .env');
  }

  const sambutan =
    'Halo kak! 👋 Grup Kios Cerdas udah siap nih!\n' +
    'Aku bakal kirim laporan dan notifikasi di sini ya 📊\n' +
    'Ketik *bantuan* kalau mau lihat perintah yang bisa aku lakukan!';

  kirimKegrup(sambutan, groupId);
  log('=== SETUP SELESAI ===');
}

main();
