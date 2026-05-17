'use strict';

// Parsing perintah masuk dari Signal

const PERINTAH = {
  STOK: /^(stok|cek stok|stock)/i,
  LAPORAN: /^(laporan|report|omzet)/i,
  JUAL: /^jual\s+(.+)\s+(\d+)/i,
  TAMBAH_STOK: /^(tambah|restock)\s+(.+)\s+(\d+)/i,
  HARGA: /^harga\s+(.+)/i,
  BACKUP: /^(backup|simpan)/i,
  BANTUAN: /^(bantuan|help|tolong|\?)/i,
  STATUS: /^(status|info|ping)/i,
};

function parsePerintah(teks) {
  const t = teks.trim();

  if (PERINTAH.JUAL.test(t)) {
    const m = t.match(PERINTAH.JUAL);
    return { tipe: 'JUAL', produk: m[1].trim(), qty: Number(m[2]) };
  }

  if (PERINTAH.TAMBAH_STOK.test(t)) {
    const m = t.match(PERINTAH.TAMBAH_STOK);
    return { tipe: 'TAMBAH_STOK', produk: m[2].trim(), qty: Number(m[3]) };
  }

  if (PERINTAH.HARGA.test(t)) {
    const m = t.match(PERINTAH.HARGA);
    return { tipe: 'HARGA', produk: m[1].trim() };
  }

  for (const [key, regex] of Object.entries(PERINTAH)) {
    if (regex.test(t)) return { tipe: key };
  }

  return { tipe: 'AI_CHAT', teks: t };
}

function validasiPerintah(parsed) {
  if (parsed.tipe === 'JUAL' && (parsed.qty <= 0 || isNaN(parsed.qty))) {
    return { valid: false, error: 'Jumlah harus angka positif' };
  }
  if (parsed.tipe === 'TAMBAH_STOK' && (parsed.qty <= 0 || isNaN(parsed.qty))) {
    return { valid: false, error: 'Jumlah harus angka positif' };
  }
  return { valid: true };
}

module.exports = { parsePerintah, validasiPerintah, PERINTAH };
