'use strict';

// Modul keamanan bersama — dipakai signal bot dan scripts lain

const MAX_INPUT_LENGTH = 200;
const RATE_WINDOW_MS = 60_000;  // 1 menit
const RATE_MAX = 20;            // max request per pengirim per menit

const rateLimitMap = new Map();

// --- Input sanitization ---

function sanitizeInput(teks) {
  if (typeof teks !== 'string') return '';
  // Potong panjang berlebih
  let s = teks.slice(0, MAX_INPUT_LENGTH);
  // Hapus karakter kontrol (kecuali tab dan newline biasa)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return s.trim();
}

// Sanitasi nilai kolom CSV — cegah formula injection dan baris palsu
function sanitizeCsvField(val) {
  if (val === null || val === undefined) return '';
  let s = String(val);
  // Hapus newline/CR agar tidak bisa sisipkan baris baru di CSV
  s = s.replace(/[\r\n]/g, ' ');
  // Netralkan formula injection (Excel/LibreOffice: =, +, -, @)
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return s;
}

// Buat baris CSV yang aman dari satu object transaksi
function buatBarisCsvAman(obj) {
  return Object.values(obj).map(v => {
    const s = sanitizeCsvField(v);
    // Quote jika ada koma atau tanda kutip
    if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(',');
}

// --- Rate limiting per pengirim ---

function cekRateLimit(pengirim) {
  const now = Date.now();
  const entry = rateLimitMap.get(pengirim) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(pengirim, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  rateLimitMap.set(pengirim, entry);
  return entry.count <= RATE_MAX;
}

// --- Whitelist nomor HP ---

function isPhoneAllowed(phone, whitelistStr) {
  if (!phone || !whitelistStr) return false;
  const normalize = (p) => p.replace(/[\s\-()]/g, '');
  const normalized = normalize(phone);
  const whitelist = whitelistStr.split(',').map(normalize);
  return whitelist.includes(normalized);
}

// --- Validasi path file (cegah path traversal) ---

const path = require('path');

function validasiPathDalamDir(targetPath, dirAman) {
  const resolved = path.resolve(targetPath);
  const dirResolved = path.resolve(dirAman);
  return resolved.startsWith(dirResolved + path.sep) || resolved === dirResolved;
}

module.exports = {
  sanitizeInput,
  sanitizeCsvField,
  buatBarisCsvAman,
  cekRateLimit,
  isPhoneAllowed,
  validasiPathDalamDir,
};
