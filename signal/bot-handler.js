#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const dayjs = require('dayjs');

const { parsePerintah, validasiPerintah } = require('./message-parser');
const Formatter = require('./response-formatter');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const LOG_FILE = path.join(ROOT, 'logs', 'signal.log');

const PHONE = process.env.SIGNAL_PHONE_NUMBER;
const RECIPIENT = process.env.SIGNAL_RECIPIENT;
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
  try {
    execSync(`${SIGNAL_CLI} -u "${PHONE}" send -m "${teks.replace(/"/g, '\\"')}" "${penerima}"`, {
      timeout: 10000,
    });
    log(`✅ Pesan terkirim ke ${penerima}`);
    return true;
  } catch (err) {
    log(`❌ Gagal kirim pesan: ${err.message}`);
    return false;
  }
}

function bacaStok() {
  return parse(fs.readFileSync(path.join(DATA_DIR, 'stok.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true,
  });
}

function cariProduk(nama, stok) {
  const q = nama.toLowerCase();
  return stok.find(s =>
    s.nama.toLowerCase().includes(q) ||
    s.id === q
  );
}

function catatJual(produk, qty) {
  const stok = bacaStok();
  const item = cariProduk(produk, stok);
  if (!item) return { ok: false, error: `Produk "${produk}" tidak ditemukan` };

  const sisaSekarang = Number(item.stok);
  if (sisaSekarang < qty) return { ok: false, error: `Stok tidak cukup (ada: ${sisaSekarang})` };

  // Update stok
  const stokBaru = stok.map(s => {
    if (s.id === item.id) return { ...s, stok: sisaSekarang - qty, last_update: dayjs().format('YYYY-MM-DD') };
    return s;
  });
  const header = Object.keys(stok[0]);
  fs.writeFileSync(path.join(DATA_DIR, 'stok.csv'), stringify(stokBaru, { header: true, columns: header }));

  // Catat transaksi
  const tx = {
    id: `TX${Date.now()}`,
    tanggal: dayjs().format('YYYY-MM-DD'),
    jam: dayjs().format('HH:mm:ss'),
    produk_id: item.id,
    nama_produk: item.nama,
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
  const txHeader = txContent.split('\n')[0];
  const newLine = Object.values(tx).join(',');
  fs.writeFileSync(txFile, txContent + '\n' + newLine + '\n');

  return { ok: true, item, qty, total: tx.total, sisa: sisaSekarang - qty };
}

async function prosesPerintah(teks) {
  const parsed = parsePerintah(teks);
  const valid = validasiPerintah(parsed);

  if (!valid.valid) return Formatter.error(valid.error);

  switch (parsed.tipe) {
    case 'STOK': {
      const stok = bacaStok();
      return Formatter.stokRingkas(stok);
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
      exec(`node ${path.join(ROOT, 'scripts/backup.js')}`);
      return '💾 Backup dimulai...';
    }
    case 'AI_CHAT': {
      return '🤖 Pertanyaan AI belum diimplementasi. Ketik *bantuan* untuk daftar perintah.';
    }
    default: return Formatter.bantuan();
  }
}

async function main() {
  log('Signal bot handler dimulai');

  if (!PHONE) {
    log('SIGNAL_PHONE_NUMBER tidak diset — mode demo');
    // Demo: proses beberapa perintah contoh
    const contoh = ['stok', 'laporan', 'bantuan', 'status'];
    for (const c of contoh) {
      console.log(`\n> ${c}`);
      const resp = await prosesPerintah(c);
      console.log(resp);
    }
    return;
  }

  // Cek signal-cli tersedia
  try {
    const { execSync: chk } = require('child_process');
    chk(`which ${SIGNAL_CLI} 2>/dev/null || ${SIGNAL_CLI} --version`, { timeout: 3000 });
  } catch {
    log('❌ signal-cli tidak ditemukan — jalankan dalam mode demo');
    log('Install: https://github.com/AsamK/signal-cli/releases');
    const contoh = ['stok', 'laporan', 'bantuan'];
    for (const c of contoh) {
      const resp = await prosesPerintah(c);
      console.log(`\n> ${c}\n${resp}`);
    }
    return;
  }

  // Mode produksi: listen via signal-cli
  log(`Listening untuk pesan dari ${RECIPIENT}...`);
  const proc = require('child_process').spawn(SIGNAL_CLI, [
    '-u', PHONE, 'receive', '--ignore-stories',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let buffer = '';
  proc.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.includes('Body:')) {
        const teks = line.replace('Body:', '').trim();
        log(`Pesan masuk: ${teks}`);
        try {
          const resp = await prosesPerintah(teks);
          kirimPesan(resp);
        } catch (err) {
          log(`Error proses: ${err.message}`);
          kirimPesan(Formatter.error(err.message));
        }
      }
    }
  });

  proc.on('close', () => { log('signal-cli berhenti'); });
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
