#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const dayjs = require('dayjs');
const axios = require('axios');

const PHONE = process.env.SIGNAL_NUMBER || process.env.SIGNAL_PHONE_NUMBER;
const GROUP_ID = process.env.SIGNAL_GROUP_ID;
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';
const TZ = process.env.KIOS_TIMEZONE || 'Asia/Makassar';
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'signal-error.log');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function rp(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

// --- Ambil data laporan dari CSV ---

function bacaCsv(namaFile) {
  const file = path.join(DATA_DIR, namaFile);
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content || content.split('\n').length <= 1) return [];
  return parse(content, { columns: true, skip_empty_lines: true });
}

function hitungLaporan(tanggal) {
  const transaksi = bacaCsv('transaksi.csv');
  const stok = bacaCsv('stok.csv');

  const hari = transaksi.filter(t => t.tanggal === tanggal);
  const omzet = hari.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const totalTx = hari.length;

  const hitungProduk = {};
  hari.forEach(t => {
    hitungProduk[t.nama_produk] = (hitungProduk[t.nama_produk] || 0) + Number(t.qty || 0);
  });
  const top3 = Object.entries(hitungProduk)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nama]) => nama);

  const stokKritis = stok
    .filter(s => Number(s.stok) <= Number(s.stok_kritis))
    .map(s => `${s.nama} (sisa ${s.stok} ${s.satuan})`);

  const target = Number(process.env.OMZET_TARGET_HARIAN || 500000);
  const persen = omzet > 0 ? Math.round((omzet / target) * 100) : 0;

  return { omzet, totalTx, top3, stokKritis, target, persen };
}

// --- Opsional: simpan/ambil cache laporan dari Upstash Redis ---

async function simpanKeRedis(key, value) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await axios.post(`${url}/set/${key}`, { value: JSON.stringify(value) }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
  } catch {
    // Redis cache opsional — tidak fatal
  }
}

// --- Format pesan laporan ---

function formatLaporan(tanggal, data) {
  const { omzet, totalTx, top3, stokKritis, target, persen } = data;
  const tglFmt = dayjs(tanggal).format('DD MMMM YYYY');

  let msg = `📊 *LAPORAN KIOS CERDAS*\n`;
  msg += `📅 Tanggal: ${tglFmt}\n\n`;
  msg += `💰 Penjualan Hari Ini: ${rp(omzet)}\n`;
  msg += `📦 Transaksi: ${totalTx} kali\n`;
  msg += `🎯 Target: ${persen}% dari ${rp(target)}\n`;

  if (top3.length) {
    msg += `🏆 Terlaris: ${top3.join(', ')}\n`;
  }

  if (stokKritis.length) {
    msg += `\n⚠️ Stok Hampir Habis:\n`;
    stokKritis.forEach(s => { msg += `  • ${s}\n`; });
    msg += `Segera restock ya kak! 🛒`;
  } else {
    msg += `\n✅ Semua stok aman!`;
  }

  msg += `\n\nSemangat kak! 💪`;
  return msg;
}

// --- Kirim ke Signal ---

function kirimKeGrup(teks) {
  if (!PHONE || !GROUP_ID) {
    log('SIGNAL_NUMBER atau SIGNAL_GROUP_ID tidak diset — tampilkan preview:');
    console.log('\n' + '='.repeat(50));
    console.log(teks);
    console.log('='.repeat(50) + '\n');
    return false;
  }

  const r = spawnSync(SIGNAL_CLI, [
    '-u', PHONE, 'send', '-g', GROUP_ID, '-m', teks.slice(0, 4096),
  ], { encoding: 'utf8', timeout: 15000 });

  if (r.error || r.status !== 0) {
    log(`Gagal kirim laporan: ${r.error?.message || r.stderr}`);
    return false;
  }
  log('Laporan terkirim ke grup!');
  return true;
}

async function main() {
  log('=== KIRIM LAPORAN DIMULAI ===');

  const tanggal = dayjs().format('YYYY-MM-DD');
  let data;

  try {
    data = hitungLaporan(tanggal);
  } catch (err) {
    log(`Gagal baca data: ${err.message}`);
    process.exit(1);
  }

  const laporan = formatLaporan(tanggal, data);
  const terkirim = kirimKeGrup(laporan);

  if (terkirim) {
    await simpanKeRedis(`laporan:${tanggal}`, { ...data, dikirim_at: new Date().toISOString() });
  }

  log(`=== SELESAI — omzet: ${rp(data.omzet)}, tx: ${data.totalTx} ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
