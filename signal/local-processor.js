'use strict';

/**
 * local-processor.js — eksekusi perintah produk tanpa AI
 *
 * Dipanggil setelah intent-detector + openclaw keduanya gagal,
 * tapi SEBELUM memanggil model AI.
 *
 * Strategi:
 *   1. Cari nama produk yang disebutkan dalam teks (exact + fuzzy)
 *   2. Identifikasi aksi (jual/beli/harga/cari/update/set_stok)
 *   3. Eksekusi via callSkill — tanpa token AI
 *   4. Return string respons, atau null → biarkan AI yang handle
 */

const { callSkill } = require('./bridge');
const Formatter = require('./response-formatter');

// ── Kata kunci aksi ───────────────────────────────────────────────────────────
const _K = {
  JUAL   : /\b(?:jual|jualin|terjual|laku|sold|keluarin|keluar(?:kan)?|kasirkan|antar\s+ke\s+pembeli)\b/i,
  BELI   : /\b(?:beli|tambahin|masukin|masuk(?:in|kan)?|input\s+stok|tambah(?:in)?|restock|restok|terima|datang|replenish)\b/i,
  HARGA  : /\b(?:harga|tarif|price|berapa\s+harga)\b/i,
  HAPUS  : /\b(?:hapus|delete|buang|remove|singkirkan)\b/i,
  UPD_HRG: /\b(?:ubah|update|naik(?:kan)?|turun(?:kan)?|edit)\s+harga\b/i,
  SET_STK: /\b(?:set|koreksi|opname|fix)\s+stok\b|\bstok\b.*[=]|\bjadi\s+\d+/i,
  CARI   : /\b(?:ada|cek|sisa|tersedia|berapa|info|detail|lihat|tampilkan|apakah)\b|\?/i,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _extractQty(teks) {
  const m = teks.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (!m) return 1;
  return Math.max(1, Math.floor(parseFloat(m[1].replace(',', '.')) || 1));
}

function _extractHarga(teks) {
  const m = teks.match(/(?:harga|@|rp\.?)\s*(\d[\d.,]*)/i);
  if (!m) return 0;
  return Math.floor(parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
}

function _extractMetode(teks) {
  if (/\bqris\b/i.test(teks)) return 'qris';
  if (/\btransfer\b/i.test(teks)) return 'transfer';
  return 'tunai';
}

// Cari nama produk yang paling panjang cocok dalam teks (exact)
function _cariExact(tl, stok) {
  let best = null, bestLen = 0;
  for (const s of stok) {
    const n = s.nama.toLowerCase();
    if (tl.includes(n) && n.length > bestLen) { best = s; bestLen = n.length; }
  }
  return best;
}

// Bersihkan kata kerja + angka dari teks, sisa = kemungkinan nama produk
function _bersihkanUntukSearch(tl) {
  return tl
    .replace(/\b(?:jual|jualin|beli|tambahin|masukin|masuk(?:in|kan)?|tambah(?:in)?|restock|restok|ada|cek|harga|berapa|stok|update|ubah|hapus|delete|info|detail|lihat|sisa|tersedia|input|terima|datang|laku|sold|keluarin|keluar(?:kan)?|tunai|qris|transfer|dari|di|ke|rp|untuk|tolong|kak|ya|nih|dong|ngga|nggak|ga|gak|tidak)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Eksekusi aksi lokal ───────────────────────────────────────────────────────
function _aksiLokal(tl, item, sender, logActivity) {
  const qty   = _extractQty(tl);
  const harga = _extractHarga(tl);

  // JUAL (prioritas jika jelas kata kerja jual, bukan beli)
  if (_K.JUAL.test(tl) && !_K.BELI.test(tl)) {
    const metode = _extractMetode(tl);
    const r = callSkill('stok', 'jual', { produk: item.nama, qty, metode });
    if (!r.ok) return Formatter.error(r.error);
    logActivity(sender, `JUAL:${r.data.item.nama} x${qty}`, 'OK(lokal)');
    return Formatter.konfirmasiJual(r.data.item.nama, r.data.qty, r.data.item.satuan, r.data.total, r.data.sisa, metode);
  }

  // BELI / RESTOCK
  if (_K.BELI.test(tl) && !_K.JUAL.test(tl)) {
    const r = callSkill('stok', 'tambah', { produk: item.nama, qty, harga, supplier: '', auto_create: false });
    if (!r.ok) return null; // produk baru tanpa data lengkap → AI lebih baik
    logActivity(sender, `BELI:${r.data.item.nama} x${qty}`, 'OK(lokal)');
    return Formatter.konfirmasiBeli(r.data.item.nama, qty, r.data.item.satuan, r.data.harga_beli, r.data.stok_baru, {
      priceChanged: r.data.price_changed, hargaLama: r.data.harga_lama,
    });
  }

  // UPDATE HARGA
  if (_K.UPD_HRG.test(tl)) {
    const angka = tl.match(/(?:jadi\s+)?(\d[\d.,]*)/);
    if (!angka) return null;
    const hargaJual = Math.floor(parseFloat(angka[1].replace(/\./g, '').replace(',', '.')) || 0);
    if (!hargaJual) return null;
    const r = callSkill('harga', 'update', { produk: item.nama, harga_jual: String(hargaJual) });
    if (!r.ok) return null;
    logActivity(sender, `UPDATE_HARGA:${item.nama}`, 'OK(lokal)');
    return Formatter.updateHargaOk(r.data.item);
  }

  // HAPUS → butuh konfirmasi, biarkan flow normal (kembalikan null agar AI tidak dipanggil tapi flow tetap benar)
  if (_K.HAPUS.test(tl)) return null;

  // HARGA INFO
  if (_K.HARGA.test(tl) && !_K.UPD_HRG.test(tl)) {
    const r = callSkill('harga', 'cek', { produk: item.nama });
    if (!r.ok) return null;
    return Formatter.infoHarga(r.data.item);
  }

  // CARI / default (ada?, berapa?, info?) → tampilkan detail produk
  if (_K.CARI.test(tl) || /\?/.test(tl)) {
    const r = callSkill('stok', 'cari', { produk: item.nama });
    if (!r.ok) return null;
    return Formatter.detailProduk(r.data.item);
  }

  return null; // aksi benar-benar ambigu → AI
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function prosesLokal(teks, sender, logActivity) {
  try {
    const tl = teks.toLowerCase().trim();

    // Stok dari cache (hampir selalu hit dari bridge TTL)
    const stokR = callSkill('stok', 'cek', {});
    if (!stokR.ok || !stokR.data?.stok?.length) return null;
    const stok = stokR.data.stok;

    // 1. Exact match — paling cepat
    let item = _cariExact(tl, stok);

    // 2. Fuzzy via skill — bersihkan kata kerja dulu
    if (!item) {
      const cleaned = _bersihkanUntukSearch(tl);
      if (cleaned.length < 3) return null;
      const r = callSkill('stok', 'cari', { produk: cleaned });
      if (r.ok && r.data?.item) item = r.data.item;
    }

    if (!item) return null; // produk tidak dikenal → biarkan AI

    return _aksiLokal(tl, item, sender, logActivity);
  } catch {
    return null;
  }
}

module.exports = { prosesLokal };
