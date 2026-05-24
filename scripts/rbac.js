'use strict';

const fs   = require('fs');
const path = require('path');

const USERS_FILE       = path.join(__dirname, '..', 'data', 'users.json');
const OLD_MEMBERS_FILE = path.join(__dirname, '..', 'data', 'old-members.json');

// ── Definisi izin per role ────────────────────────────────────────────────────
// owner  : semua operasi (diberikan otomatis ke WHITELIST_SET)
// irma   : akses penuh seperti owner, TAPI fungsi AI butuh approval owner
// kasir  : jual + lihat (tidak bisa ubah data master)
// viewer : baca saja

// Intent yang memanggil AI model (Groq/Gemini/PicaMan) — perlu approval owner
// jika dijalankan oleh role 'irma'. Owner tetap bypass.
const AI_INTENTS = new Set([
  'AI_CHAT',
  'PREDIKSI_HARGA',
  'ESTIMASI_HARGA',
  'LAPORAN',
  'PELAJARI_BAHASA',
  'LAPORAN_BELAJAR',
  'CUACA',
  'HARGA_PASAR',
  'HARGA_FB',
  'SUMBER_HARGA',
  'TAMBAH_SUMBER',
  'UPDATE_HARGA_PASAR',
]);

const IZIN = {
  owner: new Set([
    'JUAL', 'BELI', 'TAMBAH_PRODUK', 'HAPUS_PRODUK',
    'UPDATE_HARGA', 'UPDATE_HARGA_KIOS', 'UPDATE_HARGA_PASAR', 'UPDATE_EXP',
    'SET_STOK', 'OPNAME', 'RESTOCK_MASSAL', 'AUTO_RESTOCK', 'JUAL_MASSAL',
    'TAMBAH_PRODUK_MASSAL', 'BATALKAN_TX',
    'BUAT_PROMO', 'HAPUS_PROMO',
    'TAMBAH_SUPPLIER',
    'BUKA_SHIFT', 'TUTUP_SHIFT',
    'KELOLA_USER',
    'GANTI_MODEL', 'DAFTAR_MODEL_AI',
    // baca
    'STOK', 'LAPORAN', 'LABA', 'RIWAYAT', 'LAPORAN_MINGGUAN', 'LAPORAN_BULANAN',
    'TERLARIS', 'RIWAYAT_HARGA', 'MUTASI', 'PRODUK_BARU', 'EXP', 'CEK_KRITIS',
    'HARGA_PASAR', 'SUMBER_HARGA', 'CUACA', 'STATUS', 'STATUS_SHIFT',
    'BANTUAN', 'SHORTCUT', 'LAPORAN_BELAJAR', 'STATUS_BELAJAR', 'TOKEN_USAGE',
    'PERFORMA', 'DAFTAR_SUPPLIER', 'CARI_SUPPLIER', 'LIHAT_PROMO',
    'HARGA_SUPPLIER',
    'HARGA', 'CARI', 'AI_CHAT',
    'HARGA_FB', 'TAMBAH_SUMBER', 'DAFTAR_SKILL', 'ESTIMASI_HARGA', 'PREDIKSI_HARGA',
  ]),
  kasir: new Set([
    'JUAL', 'JUAL_MASSAL', 'BAYAR',
    'BUKA_SHIFT', 'TUTUP_SHIFT', 'STATUS_SHIFT',
    'STOK', 'HARGA', 'CARI', 'CEK_KRITIS', 'EXP',
    'LAPORAN', 'RIWAYAT', 'TERLARIS',
    'HARGA_SUPPLIER',
    'BANTUAN', 'STATUS', 'CUACA', 'AI_CHAT',
    'STATUS_BAHASA', 'CEK_SINONIM', 'PELAJARI_BAHASA',
  ]),
  viewer: new Set([
    'STOK', 'HARGA', 'CARI', 'LAPORAN', 'RIWAYAT', 'TERLARIS',
    'BANTUAN', 'STATUS', 'CUACA', 'AI_CHAT',
    'STATUS_BAHASA', 'CEK_SINONIM',
  ]),
};

// ── Users file helpers ────────────────────────────────────────────────────────
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return {}; }
}

function saveUsers(users) {
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

function loadOldMembers() {
  try { return JSON.parse(fs.readFileSync(OLD_MEMBERS_FILE, 'utf8')); } catch { return {}; }
}

function saveOldMembers(data) {
  const tmp = OLD_MEMBERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, OLD_MEMBERS_FILE);
}

const _norm = (p) => String(p || '').replace(/[\s\-()]/g, '');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ambil role pengirim.
 * Owner (ada di WHITELIST_SET) selalu 'owner'.
 */
function getRole(sender, whitelistSet) {
  if (!sender) return null;
  if (whitelistSet && whitelistSet.has(_norm(sender))) return 'owner';
  const users = loadUsers();
  const entry = users[_norm(sender)];
  if (!entry || !entry.aktif) return null;
  return entry.role || null;
}

/**
 * Cek apakah role boleh menjalankan intent tertentu.
 */
// Intent yang HANYA owner boleh jalankan (config sistem)
const OWNER_ONLY = new Set(['GANTI_MODEL']);

function boleh(role, intent) {
  if (!role) return false;
  if (OWNER_ONLY.has(intent)) return role === 'owner';
  if (role === 'owner') return true;
  if (role === 'irma') return true; // akses penuh; gate AI dilakukan di bot-handler
  return (IZIN[role] || new Set()).has(intent);
}

/**
 * Cek apakah intent perlu approval owner saat dijalankan oleh role 'irma'.
 */
function butuhApprovalAI(role, intent) {
  if (role !== 'irma') return false;
  return AI_INTENTS.has(intent);
}

/**
 * Tambah/update user non-owner.
 * role: 'kasir' | 'viewer' | 'irma'
 */
function tambahUser(phone, nama, role) {
  if (!['kasir', 'viewer', 'irma'].includes(role)) return { ok: false, error: 'Role harus kasir, viewer, atau irma' };
  const users = loadUsers();
  const key = _norm(phone);
  if (!key) return { ok: false, error: 'Nomor tidak valid' };

  // Cek apakah nomor ini pernah jadi member sebelumnya
  const oldMembers = loadOldMembers();
  const mantan = oldMembers[key] || null;

  const namaFinal = nama || (mantan?.nama) || phone;
  users[key] = {
    phone,
    nama    : namaFinal,
    role,
    aktif   : true,
    ditambahkan: new Date().toISOString().slice(0, 16),
    ...(mantan ? { bergabung_ke: (mantan.kali_bergabung || 1) + 1 } : {}),
  };
  saveUsers(users);

  // Tandai di old-members bahwa mereka sudah aktif kembali
  if (mantan) {
    oldMembers[key].kembali_aktif = new Date().toISOString().slice(0, 16);
    saveOldMembers(oldMembers);
  }

  return { ok: true, user: users[key], kembali: !!mantan, mantan };
}

/**
 * Nonaktifkan user.
 */
function hapusUser(phone) {
  const users = loadUsers();
  const key = _norm(phone);
  if (!users[key]) return { ok: false, error: 'User tidak ditemukan' };

  const user = users[key];

  // Arsipkan ke old-members sebelum dinonaktifkan
  const oldMembers = loadOldMembers();
  const sudahAda = oldMembers[key];
  oldMembers[key] = {
    phone      : user.phone,
    nama       : user.nama,
    role       : user.role,
    ditambahkan: user.ditambahkan,
    dinonaktifkan: new Date().toISOString().slice(0, 16),
    kali_bergabung: (sudahAda?.kali_bergabung || 0) + 1,
    riwayat    : [
      ...(sudahAda?.riwayat || []),
      { ditambahkan: user.ditambahkan, dinonaktifkan: new Date().toISOString().slice(0, 16), role: user.role },
    ],
  };
  saveOldMembers(oldMembers);

  user.aktif = false;
  saveUsers(users);
  return { ok: true, nama: user.nama, phone: user.phone };
}

/**
 * Daftar semua user non-owner yang aktif.
 */
function daftarUser() {
  const users = loadUsers();
  return Object.values(users).filter(u => u.aktif);
}

module.exports = { getRole, boleh, butuhApprovalAI, tambahUser, hapusUser, daftarUser, loadUsers, loadOldMembers, AI_INTENTS };
