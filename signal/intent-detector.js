'use strict';

const fs = require('fs');
const path = require('path');

let basePatterns = null;
function getBase() {
  if (!basePatterns) {
    try {
      basePatterns = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'base-patterns.json'), 'utf8'));
    } catch { basePatterns = { shortcuts: {}, aliases: {} }; }
  }
  return basePatterns;
}

function applyShortcuts(teks) {
  const t = teks.toLowerCase().trim();
  const base = getBase();
  if (base.shortcuts[t]) return base.shortcuts[t];
  for (const [alias, targets] of Object.entries(base.aliases)) {
    for (const a of targets) {
      if (t.includes(a.toLowerCase())) return t.replace(new RegExp(a, 'i'), alias);
    }
  }
  return teks;
}

// ─── Pattern definitions ─────────────────────────────────────────────────────

const RE = {
  JUAL:   /^(?:jual|terjual|laku)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:tunai|qris|transfer)?(?:\s+bayar\s+(\d+))?$/i,
  BELI:   /^(?:beli|tambah\s+stok|restock)\s+(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(?:harga|@)\s*(\d+))?/i,
  STOK:   /^(?:stok|cek\s+stok|gudang|stock|stok\s+semua|lihat\s+stok)$/i,
  LAPORAN:/^(?:laporan|omzet|penjualan)\s*(?:hari\s+ini|harian|minggu(?:an)?|bulan(?:an)?)?$/i,
  LABA:   /^(?:laba|profit|untung|rugi|laba\s+rugi)\s*(?:hari\s+ini|minggu|bulan)?$/i,
  RIWAYAT:/^(?:riwayat|histori|transaksi\s+terakhir)\s*(?:hari\s+ini|minggu|bulan)?$/i,
  EXP:    /^(?:exp|kadaluarsa|expired?|hampir\s+exp|produk\s+mau\s+exp)/i,
  KRITIS: /^(?:produk\s+mau\s+habis|stok\s+(?:mau\s+)?habis|stok\s+tipis|hampir\s+habis|produk\s+kritis)/i,
  CUACA:  /^(?:cuaca|gelombang|angin|kapal|pasokan|info\s+cuaca|bmkg)/i,
  HARGA_PASAR: /^(?:harga\s+pasar|riset\s+harga|market|harga\s+di\s+pasar|bandingkan\s+harga)\s*(.+)?$/i,
  UPDATE_HARGA_PASAR: /^(?:update\s+harga\s+pasar|set\s+harga\s+pasar)\s+(.+?)\s+(\d+)/i,
  OPNAME: /^(?:opname|sinkron\s+stok|stok\s+fisik)\s+(.+?)\s+(\d+)/i,
  PRODUK_BARU: /^(?:produk\s+baru|tambah\s+produk\s+baru|barang\s+baru)\s*(?:hari\s+ini|minggu\s+ini)?$/i,
  MUTASI: /^(?:mutasi|riwayat\s+stok|keluar\s+masuk)\s+(.+)/i,
  BATAL_TX: /^(?:batal(?:kan)?\s+transaksi|cancel\s+trx)\s+(TRX-\d+)/i,
  BANTUAN: /^(?:bantuan|help|\?|menu|apa\s+bisa)$/i,
  STATUS:  /^(?:status|ping|info\s+sistem)$/i,
  PERFORMA:/^(?:performa|performance\s+review|laporan\s+sistem|laporan\s+bot|bug\s+report)$/i,
  BACKUP:  /^(?:backup|simpan\s+data)$/i,
  SHORTCUT:/^(?:shortcut|paket|pintasan)\s*(.+)?$/i,
  LAPORAN_BELAJAR: /^(?:laporan\s+belajar|bot\s+belajar\s+apa|yang\s+dipelajari|learning\s+report)/i,
  BUKA_SHIFT: /^(?:buka\s+shift|mulai\s+shift|shift\s+buka)\s*(\d+)?/i,
  TUTUP_SHIFT: /^(?:tutup\s+shift|akhir\s+shift|shift\s+tutup|tutup\s+kasir)\s*(\d+)?/i,
  STATUS_SHIFT: /^(?:status\s+shift|cek\s+shift|shift\s+sekarang)$/i,
  BAYAR:   /^(?:bayar)\s+(\d+)/i,
  CARI:    /^(?:cari|search|detail|cek)\s+(.+)/i,
  HARGA:   /^harga\s+(.+)/i,
  LAPORAN_MINGGUAN: /^(?:laporan\s+minggu(?:an)?|omzet\s+minggu(?:an)?)/i,
  LAPORAN_BULANAN:  /^(?:laporan\s+bulan(?:an)?|omzet\s+bulan(?:an)?)/i,
};

function extractQty(str) {
  return Math.max(1, Math.floor(parseFloat(str.replace(',', '.')) || 1));
}

function extractPeriode(teks) {
  if (/minggu/i.test(teks)) return 'minggu';
  if (/bulan/i.test(teks)) return 'bulan';
  return 'hari_ini';
}

// ─── Main detector ────────────────────────────────────────────────────────────

function detect(teks) {
  const t = teks.trim();
  const tl = t.toLowerCase();

  // Resolve known shortcuts first
  const expanded = applyShortcuts(t);
  const te = expanded.trim();

  let m;

  if ((m = te.match(RE.JUAL))) {
    return { tipe: 'JUAL', produk: m[1].trim(), qty: extractQty(m[2]), metode: 'tunai', bayar: m[3] ? Number(m[3]) : null };
  }
  if ((m = tl.match(/^jual\s+(.+?)\s+(\d+)\s+(tunai|qris|transfer)(?:\s+bayar\s+(\d+))?$/i))) {
    return { tipe: 'JUAL', produk: m[1].trim(), qty: extractQty(m[2]), metode: m[3].toLowerCase(), bayar: m[4] ? Number(m[4]) : null };
  }
  if ((m = te.match(RE.BELI))) {
    return { tipe: 'BELI', produk: m[1].trim(), qty: extractQty(m[2]), harga: m[3] ? Number(m[3]) : 0 };
  }
  if (RE.STOK.test(tl)) return { tipe: 'STOK' };
  if (RE.BANTUAN.test(tl)) return { tipe: 'BANTUAN' };
  if (RE.STATUS.test(tl)) return { tipe: 'STATUS' };
  if (RE.PERFORMA.test(tl)) return { tipe: 'PERFORMA' };
  if (RE.BACKUP.test(tl)) return { tipe: 'BACKUP' };
  if (RE.EXP.test(tl)) return { tipe: 'EXP' };
  if (RE.KRITIS.test(tl)) return { tipe: 'CEK_KRITIS', subTipe: 'stok' };
  if (RE.CUACA.test(tl)) return { tipe: 'CUACA' };
  if (RE.LAPORAN_BELAJAR.test(tl)) return { tipe: 'LAPORAN_BELAJAR' };
  if (RE.PRODUK_BARU.test(tl)) {
    return { tipe: 'PRODUK_BARU', periode: /minggu/i.test(tl) ? 'minggu' : 'hari_ini' };
  }
  if ((m = tl.match(RE.OPNAME))) {
    return { tipe: 'OPNAME', produk: m[1].trim(), stokBaru: Number(m[2]) };
  }
  if ((m = tl.match(RE.MUTASI))) {
    return { tipe: 'MUTASI', produk: m[1].trim() };
  }
  if ((m = tl.match(RE.BATAL_TX))) {
    return { tipe: 'BATALKAN_TX', idTx: m[1].toUpperCase() };
  }
  if ((m = tl.match(RE.UPDATE_HARGA_PASAR))) {
    return { tipe: 'UPDATE_HARGA_PASAR', produk: m[1].trim(), harga: Number(m[2]) };
  }
  if ((m = tl.match(RE.HARGA_PASAR))) {
    return { tipe: 'HARGA_PASAR', produk: (m[1] || '').trim() || null };
  }
  if (RE.LAPORAN_MINGGUAN.test(tl)) return { tipe: 'LAPORAN_AI', subTipe: 'mingguan', periode: 'minggu' };
  if (RE.LAPORAN_BULANAN.test(tl)) return { tipe: 'LAPORAN_AI', subTipe: 'bulanan', periode: 'bulan' };
  if ((m = tl.match(RE.LABA))) return { tipe: 'LAPORAN_AI', subTipe: 'laba', periode: extractPeriode(tl) };
  if ((m = tl.match(RE.RIWAYAT))) return { tipe: 'LAPORAN_AI', subTipe: 'riwayat', periode: extractPeriode(tl) };
  if (RE.LAPORAN.test(tl)) return { tipe: 'LAPORAN', periode: extractPeriode(tl) };
  if ((m = tl.match(RE.CARI))) return { tipe: 'CARI', produk: m[1].trim() };
  if ((m = tl.match(RE.HARGA))) {
    const produk = m[1].trim();
    // Ada kata lokasi → pertanyaan harga pasar, biarkan AI handle
    if (/\bdi\b|\bdari\b|\bpasar\b|\bntt\b|\brote\b|\bkupang\b/i.test(produk)) return null;
    return { tipe: 'HARGA', produk };
  }
  if ((m = tl.match(RE.BAYAR))) return { tipe: 'BAYAR', nominal: Number(m[1]) };
  if ((m = tl.match(RE.SHORTCUT))) return { tipe: 'SHORTCUT', nama: (m[1] || '').trim() };
  if ((m = tl.match(RE.BUKA_SHIFT))) return { tipe: 'BUKA_SHIFT', saldoAwal: m[1] ? Number(m[1]) : 0 };
  if ((m = tl.match(RE.TUTUP_SHIFT))) return { tipe: 'TUTUP_SHIFT', saldoAkhir: m[1] ? Number(m[1]) : null };
  if (RE.STATUS_SHIFT.test(tl)) return { tipe: 'STATUS_SHIFT' };

  return null;
}

// Async version: also checks Redis-learned patterns
async function detectAsync(teks, learnEngine) {
  const fast = detect(teks);
  if (fast) return fast;

  if (!learnEngine) return null;
  try {
    const pattern = await learnEngine.getPattern(teks);
    if (pattern && pattern.count >= 1) return { tipe: pattern.intent, produk: pattern.target, _fromLearned: true };
    const alias = await learnEngine.resolveAlias(teks.toLowerCase().trim());
    if (alias) return detect(alias.replace(/^/, 'cari '));
  } catch {}
  return null;
}

module.exports = { detect, detectAsync, applyShortcuts };
