'use strict';

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const redis = require('../scripts/redis');
const learning = require('./learning-engine');
const { callSkill } = require('../signal/bridge');

const BASE_FILE    = path.join(__dirname, '..', 'data', 'base-patterns.json');
const SOURCES_FILE = path.join(__dirname, '..', 'data', 'sources-regional.json');
const bus          = require('../scripts/event-bus');

function loadBase() {
  try { return JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')); } catch { return {}; }
}

function loadSources() {
  try { return JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')); } catch { return {}; }
}

function formatSumberMonitoring() {
  const sources = loadSources();
  const ringkasan = sources.ringkasan_sumber || {};
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `📡 *SUMBER MONITOR HARGA NAIK*\n`;
  msg += `📍 Rote Ndao & NTT\n`;
  msg += div + '\n\n';

  msg += `⚡ *Real-Time (Update Harian)*\n`;
  msg += `• Panel Badan Pangan → ${ringkasan.harga_naik_hari_ini}\n`;
  msg += `• PIHPS Bank Indonesia → ${ringkasan.perbandingan_minggu_ini}\n`;
  msg += `• ANTARA Kupang → ${ringkasan.berita_penyebab_kenaikan}\n\n`;

  msg += `📊 *Bulanan*\n`;
  msg += `• BPS NTT → ${ringkasan.komoditas_paling_naik_bulan_ini}\n\n`;

  msg += `📰 *Berita & Pemda*\n`;
  msg += `• Operasi pasar/bazar → ${ringkasan.operasi_pasar_bazar_murah}\n\n`;

  msg += `🎯 *Harga spesifik Rote Ndao:*\n`;
  msg += ringkasan.harga_rote_ndao_realtime;
  return msg;
}

function rp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function wita(fmt = 'DD/MM/YYYY') {
  return dayjs(new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)).format(fmt);
}

// Ambil stok kita dari CSV
function getStokKita() {
  const r = callSkill('stok', 'cek', {});
  return r.ok ? r.data.stok : [];
}

// Update harga referensi pasar (dari input admin)
async function updateHargaMarket(produk, hargaMarket) {
  const base = loadBase();
  const refs = base.harga_referensi || {};
  const key = produk.toLowerCase();
  const existing = refs[key] || { min: hargaMarket, max: hargaMarket, satuan: 'pcs' };
  // Keep range: if new price outside range, extend it
  const naik = hargaMarket > existing.max * 1.05;
  existing.min = Math.min(existing.min, hargaMarket);
  existing.max = Math.max(existing.max, hargaMarket);
  refs[key] = existing;
  base.harga_referensi = refs;
  fs.writeFileSync(BASE_FILE, JSON.stringify(base, null, 2));
  await learning.savePriceHistory(produk, null, hargaMarket);
  if (naik) bus.kirim('harga:naik', { produk, lama: existing.max, baru: hargaMarket });
  return { ok: true, produk, hargaMarket };
}

// Bandingkan harga kita vs referensi pasar
function analyzeHarga(item, refs) {
  const key = item.nama.toLowerCase();
  // Try to find matching reference (substring match)
  let ref = refs[key];
  if (!ref) {
    for (const [k, v] of Object.entries(refs)) {
      if (key.includes(k) || k.includes(key.split(' ')[0])) { ref = v; break; }
    }
  }
  if (!ref) return null;

  const kita = Number(item.harga_jual);
  const midMarket = (ref.min + ref.max) / 2;
  const selisih = kita - midMarket;
  const persen = Math.round((selisih / midMarket) * 100);

  let status, saran;
  if (kita < ref.min * 0.95) {
    status = '🔥 Terlalu murah!';
    saran = `Naikkan ke ${rp(Math.round(ref.min * 1.02))}`;
  } else if (kita > ref.max * 1.05) {
    status = '⚠️ Terlalu mahal!';
    saran = `Turunkan ke ${rp(Math.round(ref.max))}`;
  } else {
    status = '✅ Kompetitif';
    saran = null;
  }

  return { item: item.nama, kita, marketMin: ref.min, marketMax: ref.max, status, saran, persen };
}

async function risetHargaTop(n = 10) {
  const stok = getStokKita();
  const base = loadBase();
  const refs = base.harga_referensi || {};
  const analisis = [];

  for (const item of stok.slice(0, Math.min(stok.length, 30))) {
    const a = analyzeHarga(item, refs);
    if (a) analisis.push(a);
  }

  // Sort: masalah harga dulu
  analisis.sort((a, b) => {
    const warn = x => x.status.includes('🔥') || x.status.includes('⚠️');
    return warn(b) ? 1 : warn(a) ? -1 : 0;
  });

  return analisis.slice(0, n);
}

function formatMarketIntel(analisis, tipe = 'harian') {
  if (!analisis.length) return '📊 Belum ada data referensi harga pasar kak.\nKetik: *update harga pasar [produk] [harga]* untuk tambahkan.';

  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  const judulMap = { harian: 'TOP 10 HARGA', mingguan: 'INTELIJEN HARGA MINGGUAN' };
  let msg = `📊 *${judulMap[tipe] || 'INTELIJEN HARGA PASAR'}*\n`;
  msg += `📍 Rote Barat Laut, Rote Ndao\n`;
  msg += `📅 ${wita('dddd, DD/MM/YYYY')} | WITA\n`;
  msg += `📌 Referensi: Pasar Baa + Distributor Kupang + ongkir\n`;
  msg += `🔍 Cek harga naik: panelharga.badanpangan.go.id\n`;
  msg += div + '\n';

  let potensiTambahan = 0;
  for (const a of analisis) {
    msg += `\n*${a.item}*\n`;
    msg += `Harga kita:  ${rp(a.kita)}\n`;
    msg += `Harga pasar: ${rp(a.marketMin)}–${rp(a.marketMax)}\n`;
    msg += `Status:      ${a.status}\n`;
    if (a.saran) {
      msg += `Saran:       ${a.saran}\n`;
      if (a.status.includes('🔥')) potensiTambahan += (a.marketMin - a.kita) * 10;
    }
  }

  if (potensiTambahan > 0) {
    msg += `\n${div}\n`;
    msg += `💡 Potensi tambahan untung:\n`;
    msg += `+${rp(Math.round(potensiTambahan))}/hari jika disesuaikan\n`;
    msg += `\nMau aku update harga otomatis?\n`;
    msg += `Ketik *YA UPDATE* atau *PILIH MANUAL*`;
  }

  return msg;
}

function formatHargaSatuProduk(a) {
  if (!a) return null;
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `📊 *Info Harga: ${a.item}*\n${div}\n`;
  msg += `Harga kita:  ${rp(a.kita)}\n`;
  msg += `Harga pasar: ${rp(a.marketMin)}–${rp(a.marketMax)}\n`;
  msg += `Status:      ${a.status}\n`;
  if (a.saran) msg += `Saran:       ${a.saran}\n`;
  return msg;
}

module.exports = { risetHargaTop, updateHargaMarket, analyzeHarga, loadBase, formatMarketIntel, formatHargaSatuProduk, formatSumberMonitoring };
