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
const webSearch    = require('./web-search');
const urlSafety    = require('../scripts/url-safety');

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

// ── Ekstrak angka harga dari teks (Rp X atau angka ribuan) ────────────────────
function _extractHarga(teks) {
  const harga = [];
  const re = /(?:rp\.?\s*|harga\s*)?([\d]{3,}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi;
  let m;
  while ((m = re.exec(teks)) !== null) {
    const angka = parseInt(m[1].replace(/[.,]/g, ''), 10);
    if (angka >= 500 && angka <= 5_000_000) harga.push(angka);
  }
  return harga;
}

// ── Cari harga di Facebook via web search ────────────────────────────────────
async function risetHargaFacebook(produk) {
  const queries = [
    `harga "${produk}" site:facebook.com NTT OR "Rote Ndao"`,
    `jual ${produk} Rote Ndao facebook`,
    `harga ${produk} NTT facebook marketplace`,
  ];

  const semuaHasil = [];
  for (const q of queries) {
    const hasil = await webSearch.search(q);
    for (const h of hasil) {
      if (/facebook\.com/i.test(h.url || '') || /facebook/i.test(h.title || '')) {
        semuaHasil.push(h);
      }
    }
    if (semuaHasil.length >= 3) break;
  }

  // Fallback: ambil semua hasil query pertama jika tidak ada yang facebook
  if (!semuaHasil.length) {
    const fallback = await webSearch.search(`harga ${produk} Rote Ndao NTT terbaru`);
    semuaHasil.push(...fallback.slice(0, 3));
  }

  const allHarga = [];
  const potongan = [];
  for (const h of semuaHasil) {
    const teks = `${h.title} ${h.snippet} ${h.isiHalaman || ''}`;
    const ditemukan = _extractHarga(teks);
    allHarga.push(...ditemukan);
    if (h.snippet) potongan.push({ sumber: h.title || h.url || 'Facebook', teks: h.snippet.slice(0, 150) });
  }

  if (!allHarga.length) return { ok: false, produk, potongan };

  allHarga.sort((a, b) => a - b);
  const min = allHarga[0];
  const max = allHarga[allHarga.length - 1];
  const rata = Math.round(allHarga.reduce((s, x) => s + x, 0) / allHarga.length);
  return { ok: true, produk, min, max, rata, jumlah: allHarga.length, potongan };
}

// ── Tambah sumber URL baru (dipelajari dari user) ─────────────────────────────
function tambahSumberUrl(nama, url) {
  if (!url.startsWith('http')) return { ok: false, error: 'URL tidak valid' };
  const sources = loadSources();
  sources.sumber_tambahan = sources.sumber_tambahan || [];
  const sudahAda = sources.sumber_tambahan.some(s => s.url === url);
  if (sudahAda) return { ok: false, error: 'URL sudah terdaftar' };
  sources.sumber_tambahan.push({ nama: nama || url, url, ditambahkan: new Date().toISOString().slice(0, 10) });
  const tmp = SOURCES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sources, null, 2));
  fs.renameSync(tmp, SOURCES_FILE);
  return { ok: true, nama: nama || url, url };
}

// ── Format perbandingan harga Facebook vs referensi ───────────────────────────
function formatPerbandinganFb(produk, fb, hargaKita, hargaRef) {
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `📱 *Harga ${produk} di Facebook*\n${div}\n`;

  if (fb.ok) {
    msg += `Temuan FB: ${rp(fb.min)}–${rp(fb.max)} (rata: ${rp(fb.rata)})\n`;
    msg += `Dari ${fb.jumlah} harga ditemukan\n`;
  } else {
    msg += `Tidak ditemukan harga spesifik di Facebook\n`;
    if (fb.potongan?.length) {
      msg += `Hasil pencarian:\n`;
      fb.potongan.slice(0, 2).forEach(p => { msg += `• _${p.sumber}_: ${p.teks}\n`; });
    }
  }

  if (hargaRef) {
    msg += `\n*Harga referensi resmi:*\n`;
    msg += `${rp(hargaRef.min)}–${rp(hargaRef.max)}\n`;
  }
  if (hargaKita) {
    msg += `\n*Harga kita:* ${rp(hargaKita)}\n`;
    if (fb.ok) {
      const vs = hargaKita > fb.max * 1.05 ? '⚠️ Di atas harga FB' :
                 hargaKita < fb.min * 0.95 ? '🔥 Di bawah harga FB' : '✅ Sesuai harga FB';
      msg += `Status: ${vs}\n`;
    }
  }
  if (fb.potongan?.length && fb.ok) {
    msg += `\n_Sumber: ${fb.potongan.slice(0, 2).map(p => p.sumber).join(', ')}_`;
  }
  return msg;
}

// ── Riset harga dengan keamanan URL (owner-personal pipeline) ─────────────────
async function risetHargaIndonesia(produk) {
  const queries = [
    `harga ${produk} Indonesia terbaru site:.id`,
    `harga ${produk} NTT Rote Ndao`,
    `harga ${produk} pasar Indonesia ${new Date().getFullYear()}`,
  ];

  // Kumpulkan semua URL dari hasil pencarian
  const semuaHasil = [];
  for (const q of queries.slice(0, 2)) {
    const hasil = await webSearch.search(q);
    semuaHasil.push(...hasil.filter(h => h.url));
    if (semuaHasil.length >= 8) break;
  }

  // Periksa keamanan semua URL secara paralel
  const urls = semuaHasil.map(h => h.url).filter(Boolean);
  const cekAman = await urlSafety.periksaBanyakUrl(urls);
  const amanMap = Object.fromEntries(cekAman.map(c => [c.url, c]));

  // Ambil konten hanya dari URL aman
  const hasilAman = [];
  for (const h of semuaHasil) {
    const cek = amanMap[h.url];
    if (!cek?.aman) continue;

    let konten = h.snippet || '';
    if (cek.skor >= 70 && h.url) {
      const baca = await webSearch.bacaHalaman(cek.finalUrl).catch(() => null);
      if (baca) konten = baca.slice(0, 1200);
    }

    const hargaDitemukan = _extractHarga(konten);
    hasilAman.push({
      url    : cek.finalUrl,
      judul  : h.title || '',
      skor   : cek.skor,
      harga  : hargaDitemukan,
      potongan: konten.slice(0, 200),
    });
  }

  // Kumpulkan semua angka harga
  const semuaHarga = hasilAman.flatMap(h => h.harga);
  semuaHarga.sort((a, b) => a - b);

  const diblokir = cekAman.filter(c => !c.aman).length;
  return {
    produk,
    hasilAman,
    diblokir,
    total_url   : urls.length,
    harga_min   : semuaHarga[0] || null,
    harga_max   : semuaHarga[semuaHarga.length - 1] || null,
    harga_rata  : semuaHarga.length ? Math.round(semuaHarga.reduce((s, x) => s + x, 0) / semuaHarga.length) : null,
    jumlah_harga: semuaHarga.length,
  };
}

// ── Simpan hasil riset ke sumber + referensi harga (self-learning) ────────────
function simpanHasilRiset(riset) {
  const { produk, hasilAman, harga_min, harga_max, harga_rata } = riset;

  // Simpan URL aman baru ke sources-regional.json
  const sources  = loadSources();
  sources.sumber_tambahan = sources.sumber_tambahan || [];
  let urlBaru = 0;
  for (const h of hasilAman) {
    const sudah = sources.sumber_tambahan.some(s => s.url === h.url);
    if (!sudah && h.skor >= 65) {
      sources.sumber_tambahan.push({
        nama        : h.judul || h.url,
        url         : h.url,
        skor_aman   : h.skor,
        ditambahkan : new Date().toISOString().slice(0, 10),
        produk_terkait: produk,
      });
      urlBaru++;
    }
  }
  if (urlBaru > 0) {
    const tmp = SOURCES_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sources, null, 2));
    fs.renameSync(tmp, SOURCES_FILE);
  }

  // Update harga referensi di base-patterns.json
  let hargaDisimpan = false;
  if (harga_min && harga_max) {
    const base = loadBase();
    const refs = base.harga_referensi || {};
    const key  = produk.toLowerCase();
    const ada  = refs[key] || { min: harga_min, max: harga_max };
    refs[key]  = { min: Math.min(ada.min, harga_min), max: Math.max(ada.max, harga_max), updated: new Date().toISOString().slice(0, 10) };
    base.harga_referensi = refs;
    fs.writeFileSync(BASE_FILE, JSON.stringify(base, null, 2));
    hargaDisimpan = true;
    if (harga_rata > (ada.max || 0) * 1.05) {
      bus.kirim('harga:naik', { produk, lama: ada.max, baru: harga_rata });
    }
  }

  return { urlBaru, hargaDisimpan };
}

// ── Format hasil riset owner-personal ────────────────────────────────────────
function formatHasilRisetIndonesia(riset, simpan) {
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `🔍 *Riset Harga: ${riset.produk}*\n${div}\n`;
  msg += `📡 URL ditemukan: ${riset.total_url} | `;
  msg += `✅ Aman: ${riset.hasilAman.length} | `;
  msg += `🛡️ Diblokir: ${riset.diblokir}\n\n`;

  if (riset.harga_min) {
    msg += `💰 *Harga ditemukan (Indonesia):*\n`;
    msg += `  Min:  ${rp(riset.harga_min)}\n`;
    msg += `  Max:  ${rp(riset.harga_max)}\n`;
    msg += `  Rata: ${rp(riset.harga_rata)}\n`;
    msg += `  Dari ${riset.jumlah_harga} data harga\n\n`;
  } else {
    msg += `Tidak ditemukan harga spesifik.\n\n`;
  }

  if (riset.hasilAman.length) {
    msg += `📋 *Sumber aman (${riset.hasilAman.length}):*\n`;
    riset.hasilAman.slice(0, 3).forEach(h => {
      msg += `• [${h.skor}%] ${h.judul.slice(0, 45)}\n`;
    });
  }

  msg += `\n${div}\n`;
  msg += `🧠 *Dipelajari:*\n`;
  msg += `  📌 ${simpan.urlBaru} sumber baru disimpan\n`;
  msg += `  📊 Harga referensi ${simpan.hargaDisimpan ? 'diperbarui' : 'belum cukup data'}`;
  return msg;
}

module.exports = {
  risetHargaTop, updateHargaMarket, analyzeHarga, loadBase,
  formatMarketIntel, formatHargaSatuProduk, formatSumberMonitoring,
  risetHargaFacebook, tambahSumberUrl, formatPerbandinganFb,
  risetHargaIndonesia, simpanHasilRiset, formatHasilRisetIndonesia,
};
