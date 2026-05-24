'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const PYTHON = process.env.PYTHON_BIN || 'python3';

// ── PicaMan cache: hindari spawn Python berulang untuk aksi read-only ─────────
const _cache = new Map();

// TTL (ms) per "skill/action" — hanya untuk aksi baca
const _CACHE_TTL = {
  'stok/cek'            : 20000,
  'stok/cari'           : 15000,
  'laporan/ringkas'     : 30000,
  'harga/cek'           : 20000,
  'harga/daftar_skill'  : 300000,
  'supplier/daftar'     : 60000,
  'promo/daftar'        : 30000,
  'self-learner/status' : 60000,
  'bahasa/normalisasi'  : 300000,
  'bahasa/sinonim'      : 300000,
  'bahasa/status'       : 120000,
};

// Aksi tulis per skill/action. Jangan pakai nama action saja: "ringkas" pada
// laporan read-only, sementara beberapa skill lain bisa punya action bernama sama.
const _WRITE_ACTIONS = new Set([
  'stok/jual',
  'stok/tambah',
  'stok/tambah_produk',
  'stok/hapus',
  'stok/update_exp',
  'stok/set_stok',
  'stok/batalkan_tx',
  'harga/update',
  'supplier/tambah',
  'supplier/hapus',
  'promo/buat',
  'promo/hapus',
  'bahasa/pelajari',
  'bahasa/hapus',
  'self-learner/antri',
  'self-learner/belajar',
  'self-learner/terapkan',
  'self-learner/laporan_resolusi',
  'saran/buat',
  'saran/tandai_terkirim',
  'memory-chat/simpan',
  'memory-chat/bersihkan',
]);

const _CASCADE_INVALIDATE = {
  stok: ['laporan', 'harga', 'notif'],
  harga: ['stok', 'laporan'],
  promo: ['stok'],
  supplier: ['stok'],
};

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
  const isWrite = _WRITE_ACTIONS.has(`${skill}/${action}`);
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
  if (isWrite) {
    invalidateCache(skill);
    for (const related of _CASCADE_INVALIDATE[skill] || []) invalidateCache(related);
  }

  return result;
}

function _exec(scriptPath, input) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picaman-stdin-'));
  const inputFile = path.join(tmpDir, 'request.json');
  let fd = null;
  let r;
  try {
    fs.writeFileSync(inputFile, input, 'utf8');
    fd = fs.openSync(inputFile, 'r');
    r = spawnSync(PYTHON, [scriptPath], {
      stdio: [fd, 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 15000,
    });
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  if (r.error && r.status === null) throw new Error(`PicaMan error [${path.basename(scriptPath)}]: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`[${path.basename(scriptPath)}] ${r.stderr?.trim() || 'gagal'}`);
  const out = (r.stdout || '').trim();
  if (!out) throw new Error(`Tidak ada output dari ${path.basename(scriptPath)}`);
  try {
    return JSON.parse(out);
  } catch (e) {
    throw new Error(`Output tidak valid dari ${path.basename(scriptPath)}: ${e.message}`);
  }
}

module.exports = { callSkill, invalidateCache };
