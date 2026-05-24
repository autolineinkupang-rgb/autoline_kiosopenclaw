'use strict';

/**
 * Clear operating boundary:
 * - Irma handles deterministic/local work directly.
 * - Picaman receives complex or ambiguous work as a structured delegation.
 */

const LOCAL_INTENTS = new Set([
  'STOK', 'LAPORAN', 'LAPORAN_AI', 'LABA', 'RIWAYAT',
  'LAPORAN_MINGGUAN', 'LAPORAN_BULANAN',
  'JUAL', 'BELI', 'BAYAR', 'TAMBAH_PRODUK', 'HAPUS_PRODUK',
  'UPDATE_HARGA', 'UPDATE_HARGA_KIOS', 'UPDATE_EXP', 'SET_STOK',
  'OPNAME', 'BATALKAN_TX',
  'EXP', 'CEK_KRITIS', 'CARI', 'HARGA',
  'PRODUK_BARU', 'MUTASI', 'TERLARIS', 'RIWAYAT_HARGA',
  'AUTO_RESTOCK', 'RESTOCK_MASSAL', 'JUAL_MASSAL', 'TAMBAH_PRODUK_MASSAL',
  'BUKA_SHIFT', 'TUTUP_SHIFT', 'STATUS_SHIFT',
  'BUAT_PROMO', 'LIHAT_PROMO', 'HAPUS_PROMO',
  'TAMBAH_SUPPLIER', 'DAFTAR_SUPPLIER', 'CARI_SUPPLIER',
  'HARGA_SUPPLIER',
  'STATUS', 'BANTUAN', 'BACKUP', 'PERFORMA', 'TOKEN_USAGE',
  'GANTI_MODEL', 'DAFTAR_MODEL_AI',
  'STATUS_BELAJAR', 'LAPORAN_BELAJAR',
  'STATUS_BAHASA', 'PELAJARI_BAHASA', 'CEK_SINONIM',
  'SHORTCUT', 'DAFTAR_SKILL',
]);

const COMPLEX_INTENTS = new Set([
  'AI_CHAT',
  'CUACA',
  'HARGA_PASAR',
  'HARGA_FB',
  'SUMBER_HARGA',
  'TAMBAH_SUMBER',
  'UPDATE_HARGA_PASAR',
  'ESTIMASI_HARGA',
  'PREDIKSI_HARGA',
]);

function isLocalIntent(tipe) {
  return LOCAL_INTENTS.has(tipe);
}

function shouldDelegateToPicaman(parsed, context = {}) {
  if (!parsed || !parsed.tipe) return true;
  if (context.forceDelegate) return true;
  if (parsed.tipe === 'HARGA_SUPPLIER' && parsed.enrich) return true;
  if (COMPLEX_INTENTS.has(parsed.tipe)) return true;
  return !LOCAL_INTENTS.has(parsed.tipe);
}

function _taskKind(parsed, reason) {
  if (parsed?.tipe && parsed.tipe !== 'AI_CHAT') return parsed.tipe;
  if (/^(ambiguous|unknown|unresolved)/i.test(reason || '')) return 'AMBIGUOUS_REQUEST';
  return 'COMPLEX_REASONING';
}

function buildPicamanRequest({ teks, parsed, sender, reason, localAttempts = [], constraints = [] }) {
  const request = {
    assignee: 'Picaman',
    requester: 'Irma',
    task_kind: _taskKind(parsed, reason),
    reason: reason || 'Permintaan memerlukan penalaran lanjutan atau input eksternal.',
    original_message: teks,
    parsed_intent: parsed?.tipe || 'UNKNOWN',
    sender: sender || 'unknown',
    local_attempts: localAttempts.filter(Boolean),
    constraints: [
      'Jawab dalam Bahasa Indonesia yang singkat dan praktis.',
      'Gunakan fungsi/tool hanya jika perlu mengubah atau membaca data kios.',
      'Jangan ungkap path file, token, atau konfigurasi internal.',
      ...constraints,
    ],
    expected_output: 'Respons siap dikirim ke pengguna, atau intent terstruktur yang bisa dieksekusi Irma.',
  };

  return request;
}

module.exports = {
  LOCAL_INTENTS,
  COMPLEX_INTENTS,
  isLocalIntent,
  shouldDelegateToPicaman,
  buildPicamanRequest,
};
