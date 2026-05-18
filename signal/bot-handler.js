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
const { prosesAI } = require('./ai-handler');
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

function catatJual(produk, qty, metode) {
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

  const tanggal = dayjs().format('YYYY-MM-DD');
  const jam = dayjs().format('HH:mm:ss');
  const total = qty * Number(item.harga_jual);

  const txFile = path.join(DATA_DIR, 'transaksi.csv');
  const txData = parse(fs.readFileSync(txFile, 'utf8'), { columns: true, skip_empty_lines: true });
  const maxId = txData.reduce((max, r) => Math.max(max, parseInt(r.id?.replace(/\D/g, '') || '0')), 0);

  // session_id kosong untuk transaksi tunggal via Signal
  const tx = {
    id: `TRX-${String(maxId + 1).padStart(4, '0')}`,
    tanggal, jam,
    produk_id: item.id,
    nama_produk: item.nama,
    kategori: item.kategori,
    qty,
    harga_satuan: item.harga_jual,
    total,
    metode_bayar: metode || 'tunai',
    kasir: 'signal-bot',
    catatan: '',
    session_id: '',
  };

  const TX_HEADERS = ['id','tanggal','jam','produk_id','nama_produk','kategori','qty','harga_satuan','total','metode_bayar','kasir','catatan','session_id'];
  const tmp = txFile + '.tmp';
  const lines = [TX_HEADERS.join(','), ...txData.map(r => TX_HEADERS.map(h => {
    const v = String(r[h] ?? '');
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(',')), TX_HEADERS.map(h => {
    const v = String(tx[h] ?? '');
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(',')].join('\n') + '\n';
  fs.writeFileSync(tmp, lines, 'utf8');
  fs.renameSync(tmp, txFile);

  return { ok: true, item, qty, total, sisa: sisaSekarang - qty };
}

function catatBeli(namaProduk, qty, hargaBeli) {
  const stok = bacaStok();
  const item = cariProduk(namaProduk, stok);
  if (!item) return { ok: false, error: 'Produk tidak ditemukan' };

  const tanggal = dayjs().format('YYYY-MM-DD');
  const stokBaru = stok.map(s => {
    if (s.id !== item.id) return s;
    const stokUpdated = { ...s, stok: Number(s.stok) + qty, last_update: tanggal };
    if (hargaBeli > 0) stokUpdated.harga_beli = String(hargaBeli);
    return stokUpdated;
  });

  const STOK_HEADERS = ['id','nama','kategori','satuan','stok','harga_beli','harga_jual','stok_minimum','stok_kritis','supplier','last_update','has_exp','exp_date'];
  const stokFile = path.join(DATA_DIR, 'stok.csv');
  const stokLines = [STOK_HEADERS.join(','), ...stokBaru.map(r => STOK_HEADERS.map(h => {
    const v = String(r[h] ?? '');
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(','))].join('\n') + '\n';
  const stokTmp = stokFile + '.tmp';
  fs.writeFileSync(stokTmp, stokLines, 'utf8');
  fs.renameSync(stokTmp, stokFile);

  // Catat ke pembelian.csv
  const pemFile = path.join(DATA_DIR, 'pembelian.csv');
  const pemData = fs.existsSync(pemFile)
    ? parse(fs.readFileSync(pemFile, 'utf8'), { columns: true, skip_empty_lines: true })
    : [];
  const maxPemId = pemData.reduce((max, r) => Math.max(max, parseInt(r.id?.replace(/\D/g,'') || '0')), 0);
  const pem = {
    id: `PEM-${String(maxPemId + 1).padStart(4, '0')}`,
    session_id: '',
    tanggal, jam: dayjs().format('HH:mm:ss'),
    produk_id: item.id, nama_produk: item.nama,
    qty: String(qty), harga_beli: String(hargaBeli),
    subtotal: String(qty * hargaBeli),
    supplier: item.supplier || '', kasir: 'signal-bot', catatan: '',
  };
  const PEM_HEADERS = ['id','session_id','tanggal','jam','produk_id','nama_produk','qty','harga_beli','subtotal','supplier','kasir','catatan'];
  const pemLines = [PEM_HEADERS.join(','), ...pemData.map(r => PEM_HEADERS.map(h => String(r[h]??'')).join(',')),
    PEM_HEADERS.map(h => { const v = String(pem[h]??''); return v.includes(',') ? `"${v}"` : v; }).join(',')
  ].join('\n') + '\n';
  fs.writeFileSync(pemFile, pemLines, 'utf8');

  const stokBawaanItem = stokBaru.find(s => s.id === item.id);
  return { ok: true, item, qty, hargaBeli, stokBaru: stokBawaanItem?.stok };
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
      const hasil = catatJual(parsed.produk, parsed.qty, parsed.metode);
      if (!hasil.ok) return Formatter.error(hasil.error);
      return Formatter.konfirmasiJual(hasil.item.nama, hasil.qty, hasil.item.satuan, hasil.total, hasil.sisa, parsed.metode);
    }
    case 'BELI': {
      const hasil = catatBeli(parsed.produk, parsed.qty, parsed.harga);
      if (!hasil.ok) return Formatter.error(hasil.error);
      return Formatter.konfirmasiBeli(hasil.item.nama, hasil.qty, hasil.item.satuan, hasil.hargaBeli, hasil.stokBaru);
    }
    case 'EXP': {
      return Formatter.ringkasanExp(bacaStok());
    }
    case 'CARI': {
      const stok = bacaStok();
      const produk = cariProduk(parsed.produk, stok);
      if (!produk) return Formatter.error('Produk tidak ditemukan');
      return Formatter.detailProduk(produk);
    }
    case 'HARGA': {
      const stok = bacaStok();
      const produk = cariProduk(parsed.produk, stok);
      if (!produk) return Formatter.error('Produk tidak ditemukan');
      return `💲 *${produk.nama}*\nHarga jual: Rp ${Number(produk.harga_jual).toLocaleString('id-ID')}\nStok: ${produk.stok} ${produk.satuan}`;
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
    case 'AI_CHAT': {
      const stokAI = bacaStok();
      const memoryAI = (() => {
        try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
      })();
      const aiResult = await prosesAI({ teks: parsed.teks, stok: stokAI, memory: memoryAI });

      if (aiResult.tipe === 'AI_RESPONS') return aiResult.teks;

      // AI memilih aksi — validasi dan eksekusi
      const validAI = validasiPerintah(aiResult);
      if (!validAI.valid) return Formatter.error(validAI.error);

      if (aiResult.tipe === 'JUAL') {
        const hasil = catatJual(aiResult.produk, aiResult.qty, aiResult.metode);
        if (!hasil.ok) return Formatter.error(hasil.error);
        return Formatter.konfirmasiJual(hasil.item.nama, hasil.qty, hasil.item.satuan, hasil.total, hasil.sisa, aiResult.metode);
      }
      if (aiResult.tipe === 'BELI') {
        const hasil = catatBeli(aiResult.produk, aiResult.qty, aiResult.harga);
        if (!hasil.ok) return Formatter.error(hasil.error);
        return Formatter.konfirmasiBeli(hasil.item.nama, hasil.qty, hasil.item.satuan, hasil.hargaBeli, hasil.stokBaru);
      }
      return Formatter.bantuan();
    }
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
