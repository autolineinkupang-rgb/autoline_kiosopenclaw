'use strict';

const fs   = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// ── Definisi izin per role ────────────────────────────────────────────────────
// owner  : semua operasi (diberikan otomatis ke WHITELIST_SET)
// kasir  : jual + lihat (tidak bisa ubah data master)
// viewer : baca saja

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
    // baca
    'STOK', 'LAPORAN', 'LABA', 'RIWAYAT', 'LAPORAN_MINGGUAN', 'LAPORAN_BULANAN',
    'TERLARIS', 'RIWAYAT_HARGA', 'MUTASI', 'PRODUK_BARU', 'EXP', 'CEK_KRITIS',
    'HARGA_PASAR', 'SUMBER_HARGA', 'CUACA', 'STATUS', 'STATUS_SHIFT',
    'BANTUAN', 'SHORTCUT', 'LAPORAN_BELAJAR', 'STATUS_BELAJAR', 'TOKEN_USAGE',
    'PERFORMA', 'DAFTAR_SUPPLIER', 'CARI_SUPPLIER', 'LIHAT_PROMO',
    'HARGA', 'CARI', 'AI_CHAT',
  ]),
  kasir: new Set([
    'JUAL', 'JUAL_MASSAL',
    'BUKA_SHIFT', 'TUTUP_SHIFT', 'STATUS_SHIFT',
    'STOK', 'HARGA', 'CARI', 'CEK_KRITIS', 'EXP',
    'LAPORAN', 'RIWAYAT', 'TERLARIS',
    'BANTUAN', 'STATUS', 'CUACA', 'AI_CHAT',
  ]),
  viewer: new Set([
    'STOK', 'HARGA', 'CARI', 'LAPORAN', 'RIWAYAT', 'TERLARIS',
    'BANTUAN', 'STATUS', 'CUACA', 'AI_CHAT',
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
function boleh(role, intent) {
  if (!role) return false;
  if (role === 'owner') return true;
  return (IZIN[role] || new Set()).has(intent);
}

/**
 * Tambah/update user non-owner.
 * role: 'kasir' | 'viewer'
 */
function tambahUser(phone, nama, role) {
  if (!['kasir', 'viewer'].includes(role)) return { ok: false, error: 'Role harus kasir atau viewer' };
  const users = loadUsers();
  const key = _norm(phone);
  if (!key) return { ok: false, error: 'Nomor tidak valid' };
  users[key] = { phone, nama: nama || phone, role, aktif: true, ditambahkan: new Date().toISOString().slice(0, 16) };
  saveUsers(users);
  return { ok: true, user: users[key] };
}

/**
 * Nonaktifkan user.
 */
function hapusUser(phone) {
  const users = loadUsers();
  const key = _norm(phone);
  if (!users[key]) return { ok: false, error: 'User tidak ditemukan' };
  users[key].aktif = false;
  saveUsers(users);
  return { ok: true, nama: users[key].nama };
}

/**
 * Daftar semua user non-owner yang aktif.
 */
function daftarUser() {
  const users = loadUsers();
  return Object.values(users).filter(u => u.aktif);
}

module.exports = { getRole, boleh, tambahUser, hapusUser, daftarUser, loadUsers };
