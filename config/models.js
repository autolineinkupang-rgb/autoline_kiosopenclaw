'use strict';

/**
 * models.js — Registri model AI
 *
 * Nama model dan versi TIDAK ditulis langsung di file lain.
 * Semua referensi model harus melalui module ini.
 *
 * env_key : nama variabel environment untuk API key model tersebut.
 *           API key diambil dari process.env[env_key] saat runtime.
 * peran   : primary | fallback | batch
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

/** Ambil model berdasarkan peran (primary | fallback | batch) */
function getModel(peran) {
  return Object.values(DAFTAR_MODEL).find(m => m.peran === peran) || null;
}

/** Cek apakah API key model tersedia di environment */
function keyTersedia(model) {
  return !!process.env[model.env_key];
}

/** Daftar semua model beserta status API key */
function daftarModel() {
  return Object.entries(DAFTAR_MODEL).map(([id, m]) => ({
    id,
    provider : m.provider,
    nama     : m.nama,
    versi    : m.versi,
    model_id : m.model_id,
    env_key  : m.env_key,
    peran    : m.peran,
    key_ok   : keyTersedia(m),
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

module.exports = { DAFTAR_MODEL, ROUTING, getModel, daftarModel, keyTersedia };
