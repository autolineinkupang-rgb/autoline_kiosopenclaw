'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * models.js — Registri model AI
 *
 * Nama model dan versi TIDAK ditulis langsung di file lain.
 * Semua referensi model harus melalui module ini.
 *
 * env_key : nama variabel environment untuk API key model tersebut.
 *           API key diambil dari process.env[env_key] saat runtime.
 * peran   : primary | fallback | batch
 *           Owner bisa override pilihan via "ganti ai utama/cadangan/batch <id>"
 *           Override disimpan di data/ai-models.json (di luar git).
 */

const DAFTAR_MODEL = {
  groq_llama4_scout: {
    provider   : 'groq',
    nama       : 'Llama 4 Scout',
    versi      : '17B-16E-Instruct',
    model_id   : 'meta-llama/llama-4-scout-17b-16e-instruct',
    env_key    : 'GROQ_API_KEY',
    peran      : 'primary',
    max_tokens : 1024,
    temperature: 0.3,
    timeout_ms : 8000,
  },
  groq_llama31_8b: {
    provider   : 'groq',
    nama       : 'Llama 3.1',
    versi      : '8B-Instant',
    model_id   : 'llama-3.1-8b-instant',
    env_key    : 'GROQ_API_KEY',
    peran      : 'batch',
    max_tokens : 800,
    temperature: 0.1,
    timeout_ms : 6000,
  },
  gemini_flash_20: {
    provider   : 'gemini',
    nama       : 'Gemini Flash',
    versi      : '2.0',
    model_id   : 'gemini-2.0-flash',
    env_key    : 'GEMINI_API_KEY',
    peran      : 'fallback',
    max_tokens : 1024,
    temperature: 0.3,
    timeout_ms : 10000,
  },
};

// Label tampilan per peran (untuk UI/status)
const LABEL_PERAN = {
  primary : 'AI Utama',
  fallback: 'AI Cadangan',
  batch   : 'AI Batch',
};

const OVERRIDE_FILE = path.join(__dirname, '..', 'data', 'ai-models.json');

function loadOverride() {
  try { return JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8')) || {}; } catch { return {}; }
}

function saveOverride(data) {
  try {
    const tmp = OVERRIDE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, OVERRIDE_FILE);
    return true;
  } catch { return false; }
}

/** Cek apakah API key model tersedia di environment */
function keyTersedia(model) {
  return !!process.env[model.env_key];
}

/** Cari default model untuk peran (model pertama yang peran-nya cocok di DAFTAR_MODEL) */
function _defaultUntukPeran(peran) {
  return Object.entries(DAFTAR_MODEL).find(([, m]) => m.peran === peran) || null;
}

/** Ambil model berdasarkan peran (primary | fallback | batch), hormati override owner */
function getModel(peran) {
  const ov = loadOverride();
  const overrideId = ov[peran];
  if (overrideId && DAFTAR_MODEL[overrideId]) return DAFTAR_MODEL[overrideId];
  const def = _defaultUntukPeran(peran);
  return def ? def[1] : null;
}

/**
 * Ganti model aktif untuk peran tertentu. Hanya boleh dipanggil oleh owner
 * (otorisasi dilakukan di pemanggil).
 *
 * @param {'primary'|'fallback'|'batch'} peran
 * @param {string} modelId — kunci di DAFTAR_MODEL
 * @returns {{ok:boolean, error?:string, model?:object}}
 */
function setModelAktif(peran, modelId) {
  if (!LABEL_PERAN[peran]) return { ok: false, error: `Peran tidak dikenal: ${peran}` };
  const m = DAFTAR_MODEL[modelId];
  if (!m) return { ok: false, error: `Model "${modelId}" tidak ada di registri` };
  if (!keyTersedia(m)) return { ok: false, error: `API key ${m.env_key} belum diset di .env` };
  const ov = loadOverride();
  ov[peran] = modelId;
  if (!saveOverride(ov)) return { ok: false, error: 'Gagal menyimpan file override' };
  return { ok: true, model: m };
}

/** Hapus override → kembali ke default DAFTAR_MODEL untuk peran tertentu */
function resetModel(peran) {
  const ov = loadOverride();
  if (!(peran in ov)) return { ok: false, error: `Tidak ada override untuk ${peran}` };
  delete ov[peran];
  saveOverride(ov);
  return { ok: true };
}

/** Label peran (untuk tampilan): primary→"AI Utama", fallback→"AI Cadangan", batch→"AI Batch" */
function labelPeran(peran) {
  return LABEL_PERAN[peran] || peran;
}

/** Daftar semua model beserta status API key dan flag aktif (sesuai override) */
function daftarModel() {
  const ov = loadOverride();
  const aktifPerPeran = {};
  for (const p of Object.keys(LABEL_PERAN)) {
    const aktif = getModel(p);
    if (aktif) {
      // cari id-nya
      const id = Object.entries(DAFTAR_MODEL).find(([, mm]) => mm === aktif)?.[0];
      aktifPerPeran[p] = id;
    }
  }
  return Object.entries(DAFTAR_MODEL).map(([id, m]) => ({
    id,
    provider   : m.provider,
    nama       : m.nama,
    versi      : m.versi,
    model_id   : m.model_id,
    env_key    : m.env_key,
    peran      : m.peran,
    label_peran: labelPeran(m.peran),
    key_ok     : keyTersedia(m),
    aktif      : aktifPerPeran[m.peran] === id,
    override   : !!ov[m.peran] && ov[m.peran] === id,
  }));
}

/**
 * ROUTING — batas estimasi ukuran konteks untuk memilih model
 *
 * context_threshold_chars: jika estimasi total input (system prompt + stok + teks + searchCtx)
 *   melebihi nilai ini, gunakan model fallback (konteks besar, satu kali jalan).
 *   Jika di bawah batas, gunakan model primary (request pendek berulang, respons cepat).
 */
const ROUTING = {
  context_threshold_chars: 3000,
};

module.exports = {
  DAFTAR_MODEL, ROUTING, LABEL_PERAN,
  getModel, daftarModel, keyTersedia,
  setModelAktif, resetModel, labelPeran,
};
