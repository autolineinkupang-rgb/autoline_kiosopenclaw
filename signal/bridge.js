'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const PYTHON = process.env.PYTHON_BIN || 'python3';

// ── PicaMan cache: hindari spawn Python berulang untuk aksi read-only ─────────
const _cache = new Map();

// TTL (ms) per "skill/action" — hanya untuk aksi baca
const _CACHE_TTL = {
  'stok/cek'           : 20000,
  'stok/cari'          : 15000,
  'laporan/ringkas'    : 30000,
  'harga/cek'          : 20000,
  'harga/daftar_skill' : 300000,
  'supplier/daftar'    : 60000,
  'promo/daftar'       : 30000,
  'self-learner/status': 60000,
};

// Aksi tulis — tidak boleh di-cache, cache skill-nya di-flush setelah eksekusi
const _WRITE_ACTIONS = new Set([
  'jual', 'tambah', 'tambah_produk', 'hapus', 'update', 'update_exp',
  'set_stok', 'batalkan_tx', 'antri', 'belajar', 'terapkan',
  'laporan_resolusi', 'ringkas',
]);

function _key(skill, action, params) {
  return `${skill}/${action}/${JSON.stringify(params)}`;
}

function _fromCache(key, ttl) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > ttl) { _cache.delete(key); return null; }
  return e.v;
}

function _toCache(key, v) {
  if (_cache.size >= 120) _cache.delete(_cache.keys().next().value);
  _cache.set(key, { v, ts: Date.now() });
}

/**
 * Invalidasi seluruh cache milik skill tertentu.
 * Dipanggil setelah aksi write agar baca berikutnya segar.
 */
function invalidateCache(skill) {
  for (const k of _cache.keys()) {
    if (k.startsWith(`${skill}/`)) _cache.delete(k);
  }
}

/**
 * PicaMan — panggil Python skill.
 * Read-only actions di-cache sesuai TTL. Write actions flush cache skill.
 */
function callSkill(skill, action, params = {}) {
  const scriptPath = path.join(SKILLS_DIR, `${skill}.py`);
  const input = JSON.stringify({ action, params });
  const isWrite = _WRITE_ACTIONS.has(action);
  const ttl = _CACHE_TTL[`${skill}/${action}`];

  // Cek cache untuk read-only
  if (!isWrite && ttl) {
    const key = _key(skill, action, params);
    const cached = _fromCache(key, ttl);
    if (cached) return cached;

    const result = _exec(scriptPath, input);
    if (result.ok) _toCache(key, result);
    return result;
  }

  // Eksekusi langsung
  const result = _exec(scriptPath, input);

  // Flush cache skill setelah write agar baca berikutnya segar
  if (isWrite) invalidateCache(skill);

  return result;
}

function _exec(scriptPath, input) {
  const r = spawnSync(PYTHON, [scriptPath], { input, encoding: 'utf8', timeout: 15000 });
  if (r.error) throw new Error(`PicaMan error [${path.basename(scriptPath)}]: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`[${path.basename(scriptPath)}] ${r.stderr?.trim() || 'gagal'}`);
  const out = (r.stdout || '').trim();
  if (!out) throw new Error(`Tidak ada output dari ${path.basename(scriptPath)}`);
  return JSON.parse(out);
}

module.exports = { callSkill, invalidateCache };
