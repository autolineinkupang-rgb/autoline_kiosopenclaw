'use strict';

const PERINTAH = {
  STOK: /^(stok|cek stok|stock)/i,
  LAPORAN: /^(laporan|report|omzet)/i,
  // jual [produk] [qty] [metode?]
  JUAL: /^jual\s+(.+?)\s+(\d+)(?:\s+(tunai|qris|transfer))?$/i,
  // beli [produk] [qty] [harga_beli?]
  BELI: /^beli\s+(.+?)\s+(\d+)(?:\s+(\d+))?$/i,
  // tambah (alias beli tanpa harga)
  TAMBAH_STOK: /^(tambah|restock)\s+(.+)\s+(\d+)/i,
  HARGA: /^harga\s+(.+)/i,
  // cari [produk] — cek detail stok
  CARI: /^(cari|search|detail)\s+(.+)/i,
  // exp — lihat produk kadaluarsa / hampir kadaluarsa
  EXP: /^(exp|kadaluarsa|expired?)/i,
  BACKUP: /^(backup|simpan)/i,
  BANTUAN: /^(bantuan|help|tolong|\?)/i,
  STATUS: /^(status|info|ping)$/i,
};

function parsePerintah(teks) {
  const t = teks.trim();

  if (PERINTAH.JUAL.test(t)) {
    const m = t.match(PERINTAH.JUAL);
    return { tipe: 'JUAL', produk: m[1].trim(), qty: Number(m[2]), metode: (m[3] || 'tunai').toLowerCase() };
  }

  if (PERINTAH.BELI.test(t)) {
    const m = t.match(PERINTAH.BELI);
    return { tipe: 'BELI', produk: m[1].trim(), qty: Number(m[2]), harga: m[3] ? Number(m[3]) : 0 };
  }

  if (PERINTAH.TAMBAH_STOK.test(t)) {
    const m = t.match(PERINTAH.TAMBAH_STOK);
    return { tipe: 'BELI', produk: m[2].trim(), qty: Number(m[3]), harga: 0 };
  }

  if (PERINTAH.HARGA.test(t)) {
    const m = t.match(PERINTAH.HARGA);
    const produk = m[1].trim();
    // Jika ada kata lokasi → bukan cek harga kios, arahkan ke AI
    if (/\bdi\b|\bdari\b|\bpasaran\b|\bpasar\b|\bNTT\b|\bRote\b/i.test(produk)) return { tipe: 'AI_CHAT', teks: t };
    return { tipe: 'HARGA', produk };
  }

  if (PERINTAH.CARI.test(t)) {
    const m = t.match(PERINTAH.CARI);
    return { tipe: 'CARI', produk: m[2].trim() };
  }

  for (const [key, regex] of Object.entries(PERINTAH)) {
    if (regex.test(t)) return { tipe: key };
  }

  return { tipe: 'AI_CHAT', teks: t };
}

function validasiPerintah(parsed) {
  if ((parsed.tipe === 'JUAL' || parsed.tipe === 'BELI') && (parsed.qty <= 0 || isNaN(parsed.qty))) {
    return { valid: false, error: 'Jumlah harus angka positif' };
  }
  return { valid: true };
}

module.exports = { parsePerintah, validasiPerintah, PERINTAH };
