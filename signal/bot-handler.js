#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const cron = require('node-cron');
const { parsePerintah, validasiPerintah } = require('./message-parser');
const Formatter = require('./response-formatter');
const { prosesAI } = require('./ai-handler');
const { callSkill } = require('./bridge');
const { sanitizeInput, cekRateLimit, isPhoneAllowed } = require('../scripts/security');

const ROOT = path.join(__dirname, '..');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const LOG_FILE = path.join(ROOT, 'logs', 'signal.log');

// Support SIGNAL_NUMBER (baru) dan SIGNAL_PHONE_NUMBER (lama)
const PHONE = process.env.SIGNAL_NUMBER || process.env.SIGNAL_PHONE_NUMBER;
const RECIPIENT = process.env.SIGNAL_RECIPIENT;
const GROUP_ID = process.env.SIGNAL_GROUP_ID;
const WHITELIST = process.env.SIGNAL_WHITELIST || RECIPIENT || '';
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function kirimPesan(teks, penerima = RECIPIENT) {
  if (!PHONE || !penerima) {
    log('Signal tidak dikonfigurasi — pesan tidak terkirim');
    console.log('[SIGNAL PREVIEW]:', teks);
    return false;
  }

  const pesan = teks.slice(0, 4096);
  const hasil = spawnSync(SIGNAL_CLI, ['-u', PHONE, 'send', '-m', pesan, penerima], {
    timeout: 10000, encoding: 'utf8',
  });

  if (hasil.error || hasil.status !== 0) {
    log(`Gagal kirim pesan: ${hasil.error?.message || hasil.stderr}`);
    return false;
  }

  log(`Pesan terkirim ke ${penerima}`);
  return true;
}

function kirimKeGrup(teks) {
  if (!PHONE || !GROUP_ID) {
    log('SIGNAL_GROUP_ID belum diset — jalankan npm run signal:setup dulu');
    return false;
  }
  const pesan = teks.slice(0, 4096);
  const hasil = spawnSync(SIGNAL_CLI, ['-u', PHONE, 'send', '-g', GROUP_ID, '-m', pesan], {
    timeout: 10000, encoding: 'utf8',
  });
  if (hasil.error || hasil.status !== 0) {
    log(`Gagal kirim ke grup: ${hasil.error?.message || hasil.stderr}`);
    return false;
  }
  log('Pesan terkirim ke grup');
  return true;
}

async function kirimLaporanOtomatis() {
  log('Mengirim laporan malam otomatis...');
  try {
    const r = callSkill('laporan', 'ringkas', {});
    if (!r.ok) { log(`Laporan gagal: ${r.error}`); return; }
    const laporan = Formatter.laporanRingkas(r.data);
    kirimKeGrup(laporan);
  } catch (err) {
    log(`Error laporan otomatis: ${err.message}`);
  }
}

async function prosesPerintah(teks) {
  const parsed = parsePerintah(teks);
  const valid = validasiPerintah(parsed);
  if (!valid.valid) return Formatter.error(valid.error);

  switch (parsed.tipe) {
    case 'STOK': {
      const r = callSkill('stok', 'cek', {});
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.stokRingkas(r.data.stok);
    }

    case 'LAPORAN': {
      const r = callSkill('laporan', 'ringkas', {});
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.laporanRingkas(r.data);
    }

    case 'JUAL': {
      const r = callSkill('stok', 'jual', {
        produk: parsed.produk, qty: parsed.qty, metode: parsed.metode,
      });
      if (!r.ok) return Formatter.error(r.error);
      const { item, qty, total, sisa, metode } = r.data;
      return Formatter.konfirmasiJual(item.nama, qty, item.satuan, total, sisa, metode);
    }

    case 'BELI': {
      const r = callSkill('stok', 'tambah', {
        produk: parsed.produk, qty: parsed.qty, harga: parsed.harga,
      });
      if (!r.ok) return Formatter.error(r.error);
      const { item, qty, harga_beli, stok_baru } = r.data;
      return Formatter.konfirmasiBeli(item.nama, qty, item.satuan, harga_beli, stok_baru);
    }

    case 'EXP': {
      const r = callSkill('stok', 'exp', {});
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.ringkasanExp(r.data.stok);
    }

    case 'CARI': {
      const r = callSkill('stok', 'cari', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.detailProduk(r.data.item);
    }

    case 'HARGA': {
      const r = callSkill('harga', 'cek', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      const { item } = r.data;
      return Formatter.infoHarga(item);
    }

    case 'BANTUAN':
      return Formatter.bantuan();

    case 'STATUS': {
      const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      return Formatter.status(memory);
    }

    case 'BACKUP': {
      spawn(process.execPath, [path.join(ROOT, 'scripts/backup.js')], {
        stdio: 'ignore', detached: true,
      }).unref();
      return 'Oke kak, backup udah dimulai nih! Ntar kalau selesai aku kasih tahu ya 💾';
    }

    case 'AI_CHAT': {
      const stokR = callSkill('stok', 'cek', {});
      const stokAI = stokR.ok ? stokR.data.stok : [];
      const memoryAI = (() => {
        try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
      })();

      const aiResult = await prosesAI({ teks: parsed.teks, stok: stokAI, memory: memoryAI });
      if (aiResult.tipe === 'AI_RESPONS') return aiResult.teks;

      const validAI = validasiPerintah(aiResult);
      if (!validAI.valid) return Formatter.error(validAI.error);

      if (aiResult.tipe === 'JUAL') {
        const r = callSkill('stok', 'jual', {
          produk: aiResult.produk, qty: aiResult.qty, metode: aiResult.metode,
        });
        if (!r.ok) return Formatter.error(r.error);
        const { item, qty, total, sisa, metode } = r.data;
        return Formatter.konfirmasiJual(item.nama, qty, item.satuan, total, sisa, metode);
      }
      if (aiResult.tipe === 'BELI') {
        const r = callSkill('stok', 'tambah', {
          produk: aiResult.produk, qty: aiResult.qty, harga: aiResult.harga,
        });
        if (!r.ok) return Formatter.error(r.error);
        const { item, qty, harga_beli, stok_baru } = r.data;
        return Formatter.konfirmasiBeli(item.nama, qty, item.satuan, harga_beli, stok_baru);
      }
      return Formatter.bantuan();
    }

    default:
      return Formatter.bantuan();
  }
}

async function main() {
  log('Kak Kios Signal bot dimulai');

  if (!PHONE) {
    log('SIGNAL_PHONE_NUMBER tidak diset — mode demo');
    for (const c of ['halo', 'stok mie goreng', 'stok', 'bantuan']) {
      console.log(`\n> ${c}`);
      console.log(await prosesPerintah(c));
    }
    return;
  }

  const cek = spawnSync(SIGNAL_CLI, ['--version'], { timeout: 3000, encoding: 'utf8' });
  if (cek.error) {
    log('signal-cli tidak ditemukan — mode demo');
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
  let currentSender = null;

  proc.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const envelopeMatch = line.match(/^Envelope from:\s*(\+\d+)/);
      if (envelopeMatch) { currentSender = envelopeMatch[1]; continue; }
      if (!line.startsWith('Body:')) continue;

      if (!isPhoneAllowed(currentSender, WHITELIST)) {
        log(`Pesan ditolak dari ${currentSender || 'unknown'} (tidak di whitelist)`);
        currentSender = null;
        continue;
      }

      if (!cekRateLimit(currentSender)) {
        log(`Rate limit tercapai untuk ${currentSender}`);
        kirimPesan('Sabar dulu ya kak, terlalu banyak perintah nih 😅 Coba lagi 1 menit ya!', currentSender);
        currentSender = null;
        continue;
      }

      const teksRaw = line.replace('Body:', '').trim();
      const teks = sanitizeInput(teksRaw);
      if (!teks) { currentSender = null; continue; }

      log(`Pesan dari ${currentSender}: ${teks}`);

      try {
        const resp = await prosesPerintah(teks);
        kirimPesan(resp, currentSender);
      } catch (err) {
        log(`Error proses: ${err.message}`);
        kirimPesan('Aduh, ada yang error nih kak 😅 Coba lagi bentar ya!', currentSender);
      }

      currentSender = null;
    }
  });

  proc.stderr.on('data', (d) => log(`[signal-cli stderr] ${d.toString().trim()}`));
  proc.on('close', () => log('signal-cli berhenti'));

  // Laporan otomatis setiap hari jam 20:00 WIB (UTC+8 = 12:00 UTC)
  cron.schedule('0 12 * * *', () => {
    kirimLaporanOtomatis();
  }, { timezone: 'UTC' });
  log('Cron laporan malam aktif (20:00 WIB)');
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
