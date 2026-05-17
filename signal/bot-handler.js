#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const dayjs = require('dayjs');

const { parsePerintah, validasiPerintah } = require('./message-parser');
const Formatter = require('./response-formatter');
const { sanitizeInput, buatBarisCsvAman, cekRateLimit, isPhoneAllowed } = require('../scripts/security');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const LOG_FILE = path.join(ROOT, 'logs', 'signal.log');

const PHONE = process.env.SIGNAL_PHONE_NUMBER;
const RECIPIENT = process.env.SIGNAL_RECIPIENT;
// SIGNAL_WHITELIST: nomor-nomor yang boleh beri perintah, pisah koma
const WHITELIST = process.env.SIGNAL_WHITELIST || RECIPIENT || '';
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// AMAN: gunakan spawnSync dengan array args — tidak melalui shell
// Sebelumnya: execSync(`... -m "${teks}"`) → rentan command injection
function kirimPesan(teks, penerima = RECIPIENT) {
  if (!PHONE || !penerima) {
    log('Signal tidak dikonfigurasi — pesan tidak terkirim');
    console.log('[SIGNAL PREVIEW]:', teks);
    return false;
  }

  // Batasi panjang pesan agar tidak overload signal-cli
  const pesan = teks.slice(0, 4096);

  const hasil = spawnSync(SIGNAL_CLI, [
    '-u', PHONE,
    'send',
    '-m', pesan,
    penerima,
  ], { timeout: 10000, encoding: 'utf8' });

  if (hasil.error || hasil.status !== 0) {
    log(`❌ Gagal kirim pesan: ${hasil.error?.message || hasil.stderr}`);
    return false;
  }

  log(`✅ Pesan terkirim ke ${penerima}`);
  return true;
}

function bacaStok() {
  return parse(fs.readFileSync(path.join(DATA_DIR, 'stok.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true,
  });
}

function cariProduk(nama, stok) {
  const q = nama.toLowerCase().trim();
  return stok.find(s =>
    s.nama.toLowerCase().includes(q) || s.id.toLowerCase() === q
  );
}

function catatJual(produk, qty) {
  const stok = bacaStok();
  const item = cariProduk(produk, stok);
  if (!item) return { ok: false, error: `Produk tidak ditemukan` }; // jangan echo input user ke error detail

  const sisaSekarang = Number(item.stok);
  if (sisaSekarang < qty) return { ok: false, error: `Stok tidak cukup (ada: ${sisaSekarang})` };

  // Update stok
  const stokBaru = stok.map(s => {
    if (s.id === item.id) return { ...s, stok: sisaSekarang - qty, last_update: dayjs().format('YYYY-MM-DD') };
    return s;
  });
  const header = Object.keys(stok[0]);
  fs.writeFileSync(path.join(DATA_DIR, 'stok.csv'), stringify(stokBaru, { header: true, columns: header }));

  // Catat transaksi — gunakan buatBarisCsvAman cegah CSV injection
  const tx = {
    id: `TX${Date.now()}`,
    tanggal: dayjs().format('YYYY-MM-DD'),
    jam: dayjs().format('HH:mm:ss'),
    produk_id: item.id,
    nama_produk: item.nama,           // sudah dari file CSV (trusted)
    kategori: item.kategori,
    qty,
    harga_satuan: item.harga_jual,
    total: qty * Number(item.harga_jual),
    metode_bayar: 'tunai',
    kasir: 'signal-bot',
    catatan: '',
  };

  const txFile = path.join(DATA_DIR, 'transaksi.csv');
  const txContent = fs.readFileSync(txFile, 'utf8').trim();
  // Gunakan csv-stringify (bukan string join manual) — aman dari injection
  const baris = stringify([Object.values(tx)]);
  fs.writeFileSync(txFile, txContent + '\n' + baris.trim() + '\n');

  return { ok: true, item, qty, total: tx.total, sisa: sisaSekarang - qty };
}

async function prosesPerintah(teks) {
  const parsed = parsePerintah(teks);
  const valid = validasiPerintah(parsed);
  if (!valid.valid) return Formatter.error(valid.error);

  switch (parsed.tipe) {
    case 'STOK': {
      return Formatter.stokRingkas(bacaStok());
    }
    case 'LAPORAN': {
      const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      return Formatter.laporanRingkas({
        sesi: 'Harian', tanggal: dayjs().format('DD/MM/YYYY'),
        omzet: memory.harian?.omzet || 0,
        totalTx: memory.harian?.total_transaksi || 0,
        top3: [], stokKritis: memory.harian?.stok_kritis || [],
      });
    }
    case 'JUAL': {
      const hasil = catatJual(parsed.produk, parsed.qty);
      if (!hasil.ok) return Formatter.error(hasil.error);
      return Formatter.konfirmasiJual(hasil.item.nama, hasil.qty, hasil.total, hasil.sisa);
    }
    case 'BANTUAN': return Formatter.bantuan();
    case 'STATUS': {
      const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      return Formatter.status(memory);
    }
    case 'BACKUP': {
      // Gunakan spawn (bukan exec/shell) untuk hindari injection
      spawn(process.execPath, [path.join(ROOT, 'scripts/backup.js')], { stdio: 'ignore', detached: true }).unref();
      return '💾 Backup dimulai...';
    }
    case 'AI_CHAT':
      return '🤖 Ketik *bantuan* untuk daftar perintah.';
    default:
      return Formatter.bantuan();
  }
}

async function main() {
  log('Signal bot handler dimulai');

  if (!PHONE) {
    log('SIGNAL_PHONE_NUMBER tidak diset — mode demo');
    for (const c of ['stok', 'laporan', 'bantuan']) {
      console.log(`\n> ${c}`);
      console.log(await prosesPerintah(c));
    }
    return;
  }

  // Cek signal-cli tersedia — gunakan spawnSync, bukan shell string
  const cek = spawnSync(SIGNAL_CLI, ['--version'], { timeout: 3000, encoding: 'utf8' });
  if (cek.error) {
    log('❌ signal-cli tidak ditemukan — mode demo');
    log('Install: https://github.com/AsamK/signal-cli/releases');
    for (const c of ['stok', 'laporan', 'bantuan']) {
      console.log(await prosesPerintah(c));
    }
    return;
  }

  log(`Listening... Whitelist: ${WHITELIST || '(kosong)'}`);

  const proc = spawn(SIGNAL_CLI, ['-u', PHONE, 'receive', '--ignore-stories'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let currentSender = null; // Pengirim envelope saat ini

  proc.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      // Catat pengirim dari baris Envelope
      const envelopeMatch = line.match(/^Envelope from:\s*(\+\d+)/);
      if (envelopeMatch) {
        currentSender = envelopeMatch[1];
        continue;
      }

      if (!line.startsWith('Body:')) continue;

      // Verifikasi pengirim — tolak jika tidak ada di whitelist
      if (!isPhoneAllowed(currentSender, WHITELIST)) {
        log(`⛔ Pesan ditolak dari ${currentSender || 'unknown'} (tidak di whitelist)`);
        currentSender = null;
        continue;
      }

      // Rate limiting per pengirim
      if (!cekRateLimit(currentSender)) {
        log(`⏱️ Rate limit tercapai untuk ${currentSender}`);
        kirimPesan('⏱️ Terlalu banyak perintah. Coba lagi 1 menit.', currentSender);
        currentSender = null;
        continue;
      }

      // Sanitasi input sebelum diproses
      const teksRaw = line.replace('Body:', '').trim();
      const teks = sanitizeInput(teksRaw);

      if (!teks) { currentSender = null; continue; }

      log(`📨 Pesan dari ${currentSender}: ${teks}`);

      try {
        const resp = await prosesPerintah(teks);
        kirimPesan(resp, currentSender);
      } catch (err) {
        log(`Error proses: ${err.message}`);
        kirimPesan('❌ Terjadi kesalahan. Coba lagi.', currentSender); // jangan kirim detail error ke user
      }

      currentSender = null;
    }
  });

  proc.stderr.on('data', (d) => log(`[signal-cli stderr] ${d.toString().trim()}`));
  proc.on('close', () => log('signal-cli berhenti'));
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
