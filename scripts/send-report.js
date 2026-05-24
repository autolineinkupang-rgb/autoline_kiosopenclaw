#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const dayjs = require('dayjs');
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;
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

// --- Kirim ke Telegram ---

async function kirimKeGrup(teks) {
  if (!BOT_TOKEN || !GROUP_ID) {
    log('TELEGRAM_BOT_TOKEN atau TELEGRAM_GROUP_ID tidak diset — tampilkan preview:');
    console.log('\n' + '='.repeat(50));
    console.log(teks);
    console.log('='.repeat(50) + '\n');
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const text = teks.slice(0, 4096);
  try {
    await axios.post(url, { chat_id: GROUP_ID, text, parse_mode: 'Markdown', disable_web_page_preview: true }, { timeout: 15000 });
    log('Laporan terkirim ke grup!');
    return true;
  } catch (e) {
    // Markdown ditolak → kirim ulang plain text agar laporan tetap sampai
    try {
      await axios.post(url, { chat_id: GROUP_ID, text, disable_web_page_preview: true }, { timeout: 15000 });
      log('Laporan terkirim ke grup (plain)!');
      return true;
    } catch (e2) {
      log(`Gagal kirim laporan: ${e2.response?.data?.description || e2.message}`);
      return false;
    }
  }
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
  const terkirim = await kirimKeGrup(laporan);

  if (terkirim) {
    await simpanKeRedis(`laporan:${tanggal}`, { ...data, dikirim_at: new Date().toISOString() });
  }

  log(`=== SELESAI — omzet: ${rp(data.omzet)}, tx: ${data.totalTx} ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
