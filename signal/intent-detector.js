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
  // SELL — jual / sold / checkout / kasir
  JUAL: /^(?:jual|terjual|laku|sold|checkout|kasir\s+jual)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:tunai|qris|transfer)?(?:\s+bayar\s+(\d+))?$/i,

  // RESTOCK — beli / terima barang / stok masuk
  BELI: /^(?:beli|tambah\s+stok|restock|terima\s+barang|barang\s+masuk|stok\s+masuk|masukkan\s+stok|replenish)\s+(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(?:harga|@)\s*(\d+))?/i,

  // STOCK VIEW — cek stok / inventory / daftar semua
  STOK: /^(?:stok|cek\s+stok|gudang|stock|stok\s+semua|lihat\s+stok|inventory|semua\s+barang|daftar\s+stok|list\s+stok|tampil\s+stok|katalog|semua\s+produk|daftar\s+produk)$/i,

  // REPORTS — laporan / rekap / summary / pendapatan
  LAPORAN: /^(?:laporan|omzet|penjualan|rekap|summary|pendapatan|revenue|ringkasan\s+penjualan)\s*(?:hari\s+ini|harian|minggu(?:an)?|bulan(?:an)?)?$/i,

  // PROFIT — laba / margin / keuntungan
  LABA: /^(?:laba|profit|untung|rugi|laba\s+rugi|keuntungan|pendapatan\s+bersih|margin|hpp)\s*(?:hari\s+ini|minggu|bulan)?$/i,

  // HISTORY — riwayat / histori transaksi
  RIWAYAT: /^(?:riwayat|histori|transaksi\s+terakhir|riwayat\s+penjualan|histori\s+transaksi|rekap\s+transaksi)\s*(?:hari\s+ini|kemarin|minggu|bulan)?$/i,

  // EXPIRY
  EXP: /^(?:exp|kadaluarsa|expired?|hampir\s+exp|produk\s+mau\s+exp|cek\s+exp|cek\s+kadaluarsa|produk\s+expired?)/i,

  // LOW STOCK — stok habis / kosong / out of stock
  KRITIS: /^(?:produk\s+mau\s+habis|stok\s+(?:mau\s+)?habis|stok\s+tipis|hampir\s+habis|produk\s+kritis|stok\s+kosong|out\s+of\s+stock|barang\s+habis|mau\s+habis)/i,

  CUACA: /^(?:cuaca|gelombang|angin|kapal|pasokan|info\s+cuaca|bmkg)/i,

  HARGA_PASAR: /^(?:harga\s+pasar|riset\s+harga|market|harga\s+di\s+pasar|bandingkan\s+harga|harga\s+(?:bersaing|kompetitif)|harga.*kios\s+lain|kios\s+lain.*harga)\s*(.+)?$/i,
  UPDATE_HARGA_PASAR: /^(?:update\s+harga\s+pasar|set\s+harga\s+pasar)\s+(.+?)\s+(\d+)/i,

  // STOCK OPNAME — hitung fisik / audit stok
  OPNAME: /^(?:opname|sinkron\s+stok|stok\s+fisik|hitung\s+stok|audit\s+stok|count\s+stock)\s+(.+?)\s+(\d+)/i,

  // NEW PRODUCTS this week / today
  PRODUK_BARU: /^(?:produk\s+baru|tambah\s+produk\s+baru|barang\s+baru|produk\s+terbaru|barang\s+apa\s+yang\s+baru)\s*(?:hari\s+ini|minggu\s+ini)?$/i,

  // STOCK MUTATION per product
  MUTASI: /^(?:mutasi|riwayat\s+stok|keluar\s+masuk|mutasi\s+stok|pergerakan\s+stok)\s+(.+)/i,

  // CANCEL TRANSACTION by ID
  BATAL_TX: /^(?:batal(?:kan)?\s+transaksi|cancel\s+trx|void\s+transaksi)\s+(TRX-\d+)/i,

  // HELP — expanded
  BANTUAN: /^(?:bantuan|help|\?|menu|apa\s+bisa|tolong|bisa\s+apa|apa\s+aja|fitur|panduan|cara\s+pakai|berikan\s+(?:format|contoh|panduan|info|petunjuk)|format\s+(?:perintah|input|command)|contoh\s+(?:perintah|format|input|command)|cara\s+(?:penggunaan|order|input))(?:\s.*)?$/i,

  STATUS:  /^(?:status|ping|info\s+sistem)$/i,
  PERFORMA:/^(?:performa|performance\s+review|laporan\s+sistem|laporan\s+bot|bug\s+report)$/i,
  BACKUP:  /^(?:backup|simpan\s+data)$/i,
  SHORTCUT:/^(?:shortcut|paket|pintasan)\s*(.+)?$/i,
  LAPORAN_BELAJAR: /^(?:laporan\s+belajar|bot\s+belajar\s+apa|yang\s+dipelajari|learning\s+report)/i,

  // SHIFT MANAGEMENT
  BUKA_SHIFT: /^(?:buka\s+shift|mulai\s+shift|shift\s+buka|start\s+shift|open\s+shift)\s*(\d+)?/i,
  TUTUP_SHIFT: /^(?:tutup\s+shift|akhir\s+shift|shift\s+tutup|tutup\s+kasir|close\s+shift|end\s+shift|selesai\s+shift)\s*(\d+)?/i,
  STATUS_SHIFT: /^(?:status\s+shift|cek\s+shift|shift\s+sekarang|kasir\s+aktif|siapa\s+bertugas)$/i,

  BAYAR: /^(?:bayar)\s+(\d+)/i,

  // SEARCH / READ — cari / tampilkan / info
  CARI: /^(?:cari|search|detail|cek|tampilkan|info|adakah|ada\s+tidak|apakah\s+ada)\s+(.+)/i,

  // PRICE CHECK — harga / berapa harga
  HARGA: /^(?:harga|berapa\s+harga|harganya)\s+(.+)/i,

  LAPORAN_MINGGUAN: /^(?:laporan\s+minggu(?:an)?|omzet\s+minggu(?:an)?|rekap\s+minggu(?:an)?)/i,
  LAPORAN_BULANAN:  /^(?:laporan\s+bulan(?:an)?|omzet\s+bulan(?:an)?|rekap\s+bulan(?:an)?)/i,

  // DELETE PRODUCT
  HAPUS: /^(?:hapus|delete|buang|hilangkan|singkirkan|stop\s+jual|cabut|delist)\s+(?:produk\s+)?(.+)/i,

  // UPDATE HARGA KIOS — ubah harga [produk] jadi [angka]
  UPDATE_HARGA_KIOS: /^(?:ubah|ganti|update|naik(?:kan)?|turun(?:kan)?|set)\s+harga\s+(?:produk\s+)?(.+?)\s+(?:jadi\s+|menjadi\s+)?(\d+)/i,

  // BEST SELLER
  TERLARIS: /^(?:produk\s+terlaris|best\s+seller|paling\s+laku|top\s+produk|produk\s+populer|ranking\s+penjualan)\s*(?:hari\s+ini|minggu(?:an)?(?:\s+ini)?|bulan(?:an)?(?:\s+ini)?)?$/i,

  // PRICE HISTORY
  RIWAYAT_HARGA: /^(?:riwayat\s+harga|histori\s+harga|history\s+harga|perubahan\s+harga)\s*(.+)?$/i,

  // SUPPLIER
  TAMBAH_SUPPLIER: /^(?:tambah|daftar|buat|add)\s+supplier\s+(.+)/i,
  CARI_SUPPLIER:   /^(?:cari|lihat|info|detail|get)\s+supplier\s+(.+)/i,
  DAFTAR_SUPPLIER: /^(?:daftar\s+supplier|list\s+supplier|semua\s+supplier|supplier\s+apa\s+saja)$/i,

  // PROMO
  BUAT_PROMO: /^(?:buat|tambah|set|pasang)\s+promo\s+(.+?)\s+(?:diskon\s+)?(\d+(?:[.,]\d+)?)\s*(%|persen|rb|ribu)?/i,
  LIHAT_PROMO: /^(?:lihat|daftar|cek|tampil)\s+promo(?:\s+aktif)?$/i,
  HAPUS_PROMO: /^(?:hapus|nonaktifkan|hentikan|stop)\s+promo\s+(PROMO-\d+|\S+)/i,

  // MASS OPERATIONS
  RESTOCK_MASSAL: /^(?:restock\s+massal|mass\s+restock|bulk\s+restock|restock\s+banyak|tambah\s+stok\s+massal|stok\s+masuk\s+massal|batch\s+restock|restock\s+list|input\s+stok\s+massal)/i,
  AUTO_RESTOCK: /^(?:restock\s+(?:semua\s+yang?\s+menipis?|low\s+stock|stok\s+menipis?|kritis|habis)|auto\s+restock|restock\s+otomatis)/i,
  JUAL_MASSAL: /^(?:jual\s+(?:massal|banyak|list|sekaligus)|transaksi\s+massal|checkout\s+(?:massal|semua|list)|daftar\s+belanja|list\s+belanjaan|belanja\s+massal)/i,
  TAMBAH_PRODUK_MASSAL: /^(?:tambah\s+produk\s+massal|input\s+produk\s+massal|buat\s+produk\s+banyak|batch\s+(?:tambah|create)\s+produk|import\s+produk|tambah\s+banyak\s+produk)/i,
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

  const expanded = applyShortcuts(t);
  const te = expanded.trim();

  let m;

  if ((m = te.match(RE.JUAL))) {
    return { tipe: 'JUAL', produk: m[1].trim(), qty: extractQty(m[2]), metode: 'tunai', bayar: m[3] ? Number(m[3]) : null };
  }
  if ((m = tl.match(/^(?:jual|sold|laku)\s+(.+?)\s+(\d+)\s+(tunai|qris|transfer)(?:\s+bayar\s+(\d+))?$/i))) {
    return { tipe: 'JUAL', produk: m[1].trim(), qty: extractQty(m[2]), metode: m[3].toLowerCase(), bayar: m[4] ? Number(m[4]) : null };
  }
  if ((m = te.match(RE.BELI))) {
    return { tipe: 'BELI', produk: m[1].trim(), qty: extractQty(m[2]), harga: m[3] ? Number(m[3]) : 0 };
  }

  // MASS OPERATIONS — cek sebelum pattern generik lainnya
  if (RE.AUTO_RESTOCK.test(tl)) return { tipe: 'AUTO_RESTOCK' };
  if (RE.RESTOCK_MASSAL.test(tl)) return { tipe: 'RESTOCK_MASSAL', rawTeks: t };
  if (RE.JUAL_MASSAL.test(tl)) return { tipe: 'JUAL_MASSAL', rawTeks: t };
  if (RE.TAMBAH_PRODUK_MASSAL.test(tl)) return { tipe: 'TAMBAH_PRODUK_MASSAL', rawTeks: t };

  if (RE.STOK.test(tl)) return { tipe: 'STOK' };
  if (RE.BANTUAN.test(tl)) return { tipe: 'BANTUAN' };
  if (RE.STATUS.test(tl)) return { tipe: 'STATUS' };
  if (RE.STATUS_SHIFT.test(tl)) return { tipe: 'STATUS_SHIFT' };
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

  // UPDATE HARGA KIOS — cek sebelum LAPORAN/LABA agar tidak bentrok
  if ((m = tl.match(RE.UPDATE_HARGA_KIOS))) {
    return { tipe: 'UPDATE_HARGA', produk: m[1].trim(), harga_jual: String(Number(m[2])) };
  }

  // HAPUS PROMO — harus sebelum HAPUS generik
  if ((m = tl.match(RE.HAPUS_PROMO))) {
    return { tipe: 'HAPUS_PROMO', id: m[1].trim().toUpperCase() };
  }

  // DELETE PRODUCT
  if ((m = tl.match(RE.HAPUS))) {
    return { tipe: 'HAPUS_PRODUK', produk: m[1].trim() };
  }

  if (RE.LAPORAN_MINGGUAN.test(tl)) return { tipe: 'LAPORAN_AI', subTipe: 'mingguan', periode: 'minggu' };
  if (RE.LAPORAN_BULANAN.test(tl)) return { tipe: 'LAPORAN_AI', subTipe: 'bulanan', periode: 'bulan' };
  if ((m = tl.match(RE.LABA))) return { tipe: 'LAPORAN_AI', subTipe: 'laba', periode: extractPeriode(tl) };
  if ((m = tl.match(RE.RIWAYAT))) return { tipe: 'LAPORAN_AI', subTipe: 'riwayat', periode: extractPeriode(tl) };
  if (RE.LAPORAN.test(tl)) return { tipe: 'LAPORAN', periode: extractPeriode(tl) };

  if ((m = tl.match(RE.BUKA_SHIFT))) return { tipe: 'BUKA_SHIFT', saldoAwal: m[1] ? Number(m[1]) : 0 };
  if ((m = tl.match(RE.TUTUP_SHIFT))) return { tipe: 'TUTUP_SHIFT', saldoAkhir: m[1] ? Number(m[1]) : null };

  // SUPPLIER — harus sebelum CARI generik
  if ((m = tl.match(RE.TAMBAH_SUPPLIER))) return { tipe: 'TAMBAH_SUPPLIER', nama: m[1].trim() };
  if (RE.DAFTAR_SUPPLIER.test(tl)) return { tipe: 'DAFTAR_SUPPLIER' };
  if ((m = tl.match(RE.CARI_SUPPLIER))) return { tipe: 'CARI_SUPPLIER', nama: m[1].trim() };

  // PROMO — harus sebelum CARI generik
  if ((m = tl.match(RE.BUAT_PROMO))) {
    const satuan = (m[4] || '').toLowerCase();
    const nilai = parseFloat(String(m[2]).replace(',', '.'));
    const tipe = satuan === '%' || satuan === 'persen' ? 'persen' : 'fixed';
    const nilaiFixed = (tipe === 'fixed' && (satuan === 'rb' || satuan === 'ribu')) ? nilai * 1000 : nilai;
    return { tipe: 'BUAT_PROMO', produk: m[1].trim(), tipeDiskon: tipe, nilai: nilaiFixed };
  }
  if (RE.LIHAT_PROMO.test(tl)) return { tipe: 'LIHAT_PROMO' };

  // TERLARIS — sebelum CARI
  if ((m = tl.match(RE.TERLARIS))) return { tipe: 'TERLARIS', periode: extractPeriode(tl) };

  // PRICE HISTORY
  if ((m = tl.match(RE.RIWAYAT_HARGA))) return { tipe: 'RIWAYAT_HARGA', produk: (m[1] || '').trim() };

  // Pertanyaan analisis harga kompetitif → HARGA_PASAR, ekstrak nama produk jika ada
  {
    const kompMatch = tl.match(/\b(bersaing|kompetitif|kios\s+lain|toko\s+lain|pesaing)\b/i);
    if (kompMatch) {
      const idx = tl.indexOf(kompMatch[1].toLowerCase());
      const before = tl.slice(0, idx).trim();
      const after  = tl.slice(idx + kompMatch[1].length).trim();
      let produk = null;
      // Coba ambil dari "after" (e.g. "kompetitif ultra milk 200ml")
      if (after && !/^(?:dengan|di\s|kak|ya|nih|dong|tidak|kios|toko|saja)\b/i.test(after) &&
          !/^(?:dari|untuk|tentang)\s+(?:suatu|sebuah|satu|beberapa|semua|berbagai)\b/i.test(after)) {
        produk = after.replace(/\bper\s+(?:satu|dua|tiga|\d+)\s+\w+/gi, '').trim() || null;
      }
      // Coba ambil dari "before" setelah kata "harga" (e.g. "harga ultra milk kompetitif")
      if (!produk) {
        const hm = before.match(/\bharga\s+(.+)/i);
        if (hm) {
          const c = hm[1].trim().replace(/\s+(?:kita|kami|kios|toko|anda)$/i, '').trim();
          if (c && !/^(?:kita|kios|toko|di\s|pasar|kami|semua)\b/i.test(c)) produk = c;
        }
      }
      return { tipe: 'HARGA_PASAR', produk };
    }
  }
  // "cek harga [produk]" → HARGA, bukan CARI (agar produk tidak dapat prefix "harga")
  if ((m = tl.match(/^(?:cek|berapa|info)\s+harga\s+(.+)/i))) {
    const produk = m[1].trim();
    if (!/\b(?:apakah|bagaimana|bersaing|kompetitif|kios\s+lain)\b/i.test(produk) && produk.length <= 40) {
      if (!/\bdi\b|\bdari\b|\bpasar\b|\bntt\b|\brote\b|\bkupang\b/i.test(produk)) return { tipe: 'HARGA', produk };
    }
  }
  if ((m = tl.match(RE.CARI))) {
    const produk = m[1].trim();
    if (/\b(?:apakah|bagaimana|mengapa|kenapa|bisakah|dapatkah|haruskah)\b/i.test(produk) ||
        /\bdi\b|\bdari\b|\bpasar\b|\bntt\b|\brote\b|\bkupang\b/i.test(produk) ||
        produk.length > 45) return null;
    return { tipe: 'CARI', produk };
  }
  if ((m = tl.match(RE.HARGA))) {
    const produk = m[1].trim();
    if (/\bdi\b|\bdari\b|\bpasar\b|\bntt\b|\brote\b|\bkupang\b/i.test(produk)) return null;
    return { tipe: 'HARGA', produk };
  }
  if ((m = tl.match(RE.BAYAR))) return { tipe: 'BAYAR', nominal: Number(m[1]) };
  if ((m = tl.match(RE.SHORTCUT))) return { tipe: 'SHORTCUT', nama: (m[1] || '').trim() };

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
