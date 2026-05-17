#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = process.env.KIOS_TIMEZONE || 'Asia/Makassar';
const isTest = process.argv.includes('--test');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(__dirname, '..', 'memory', 'kios-memory.json');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'laporan.log');

function log(msg) {
  const ts = dayjs().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function bacaTransaksi() {
  const file = path.join(DATA_DIR, 'transaksi.csv');
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content || content.split('\n').length <= 1) return [];
  return parse(content, { columns: true, skip_empty_lines: true });
}

function bacaStok() {
  const file = path.join(DATA_DIR, 'stok.csv');
  const content = fs.readFileSync(file, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true });
}

function hitungLaporan(transaksi, stok, tanggal) {
  const hari = transaksi.filter(t => t.tanggal === tanggal);
  const omzet = hari.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const totalTx = hari.length;

  const produkCount = {};
  hari.forEach(t => {
    produkCount[t.nama_produk] = (produkCount[t.nama_produk] || 0) + Number(t.qty || 0);
  });
  const top3 = Object.entries(produkCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nama, qty]) => `${nama} (${qty}x)`);

  const stokKritis = stok
    .filter(s => Number(s.stok) <= Number(s.stok_kritis))
    .map(s => `${s.nama} (sisa: ${s.stok})`);

  return { omzet, totalTx, top3, stokKritis };
}

function formatRupiah(angka) {
  return 'Rp ' + Number(angka).toLocaleString('id-ID');
}

async function tanyaAI(prompt) {
  const Groq = require('groq-sdk');
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const res = await client.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content || '';
  } catch (err) {
    log(`Groq gagal (${err.message}), coba Gemini...`);
    return tanyaGemini(prompt);
  }
}

async function tanyaGemini(prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function main() {
  log('=== LAPORAN HARIAN DIMULAI ===');

  const sekarang = dayjs().tz(TZ);
  const tanggal = sekarang.format('YYYY-MM-DD');
  const jam = sekarang.hour();
  const sesi = jam < 10 ? 'Pagi' : jam < 16 ? 'Siang' : 'Malam';

  const transaksi = bacaTransaksi();
  const stok = bacaStok();
  const { omzet, totalTx, top3, stokKritis } = hitungLaporan(transaksi, stok, tanggal);

  const target = Number(process.env.OMZET_TARGET_HARIAN || 500000);
  const persen = omzet > 0 ? Math.round((omzet / target) * 100) : 0;

  const prompt = `Buat laporan kios singkat untuk laporan ${sesi} (${tanggal}):
- Total transaksi hari ini: ${totalTx} transaksi
- Omzet: ${formatRupiah(omzet)} (${persen}% dari target ${formatRupiah(target)})
- Produk terlaris: ${top3.length ? top3.join(', ') : 'belum ada'}
- Stok kritis (perlu restock): ${stokKritis.length ? stokKritis.join(', ') : 'aman semua'}
Format: cocok untuk WhatsApp/Signal, pakai emoji, max 150 kata.`;

  let laporan = '';
  if (isTest && !process.env.GROQ_API_KEY?.startsWith('gsk_A')) {
    // Mode test tanpa API call
    laporan = `📊 LAPORAN ${sesi.toUpperCase()} - ${tanggal}
Total transaksi: ${totalTx}
Omzet: ${formatRupiah(omzet)}
Target: ${persen}%
Stok kritis: ${stokKritis.length || 0} item
Status: ✅ Sistem berjalan normal`;
  } else {
    laporan = await tanyaAI(prompt);
  }

  console.log('\n' + '='.repeat(50));
  console.log(laporan);
  console.log('='.repeat(50) + '\n');

  // Update memory
  const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  memory.harian = { tanggal, total_transaksi: totalTx, omzet, stok_kritis: stokKritis };
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));

  log(`Laporan ${sesi} selesai — omzet: ${formatRupiah(omzet)}`);
}

main().catch(err => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
