'use strict';

const axios = require('axios');

// Domain terpercaya Indonesia — langsung aman
const WHITELIST_DOMAIN = new Set([
  'panelharga.badanpangan.go.id', 'bi.go.id', 'ews.kemendag.go.id',
  'ntt.bps.go.id', 'bps.go.id', 'kemendag.go.id', 'badanpangan.go.id',
  'setda.nttprov.go.id', 'nttprov.go.id', 'rotendaokab.go.id',
  'kupang.antaranews.com', 'antaranews.com', 'kompas.com', 'tempo.co',
  'detik.com', 'bisnis.com', 'cnnindonesia.com', 'okezone.com',
  'tribunnews.com', 'jpnn.com', 'korantimor.com', 'onlinentt.com',
  'tokopedia.com', 'bukalapak.com', 'shopee.co.id',
  'facebook.com', 'instagram.com',
]);

// Pola URL shortener — bisa sembunyikan tujuan sebenarnya
const SHORTENER = /^(?:bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|t\.co|tiny\.cc|rb\.gy|cutt\.ly|shorturl\.at)$/i;

// Pola mencurigakan pada host/path
const SUSPICIOUS_HOST = /(?:\d{1,3}\.){3}\d{1,3}|.{60,}\.|[а-яёА-ЯЁ]|xn--/;
const SUSPICIOUS_PATH = /(?:phish|malware|hack|exploit|payload|shell|cmd=|exec=|eval\()/i;
const MANY_HYPHENS    = /-{3,}|(?:[a-z0-9]+-){5,}/i;

function _parseDomain(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase(), proto: u.protocol, path: u.pathname + u.search };
  } catch { return null; }
}

/**
 * Skor keamanan URL: 0–100. >= 60 dianggap aman.
 * Kembalikan { skor, aman, alasan }
 */
function skorAman(url) {
  if (!url || typeof url !== 'string') return { skor: 0, aman: false, alasan: 'URL kosong' };

  const parsed = _parseDomain(url);
  if (!parsed) return { skor: 0, aman: false, alasan: 'URL tidak valid' };

  const { host, proto, path } = parsed;
  let skor = 50; // netral
  const catatan = [];

  // Protocol
  if (proto === 'https:') { skor += 10; catatan.push('HTTPS +10'); }
  else { skor -= 20; catatan.push('non-HTTPS -20'); }

  // Whitelist domain
  const baseHost = host.replace(/^www\./, '');
  if (WHITELIST_DOMAIN.has(baseHost) || WHITELIST_DOMAIN.has(host)) {
    skor += 40; catatan.push('Domain terpercaya +40');
  }

  // TLD Indonesia
  if (host.endsWith('.go.id'))  { skor += 20; catatan.push('.go.id +20'); }
  else if (host.endsWith('.id')) { skor += 10; catatan.push('.id +10'); }

  // Shortener
  if (SHORTENER.test(baseHost)) { skor -= 40; catatan.push('URL shortener -40'); }

  // IP address sebagai host
  if (SUSPICIOUS_HOST.test(host)) { skor -= 50; catatan.push('Host mencurigakan -50'); }

  // Path berbahaya
  if (SUSPICIOUS_PATH.test(path)) { skor -= 60; catatan.push('Path mencurigakan -60'); }

  // Banyak hyphen (pola phishing klasik)
  if (MANY_HYPHENS.test(host)) { skor -= 20; catatan.push('Banyak hyphen -20'); }

  // Domain sangat panjang
  if (host.length > 50) { skor -= 15; catatan.push('Domain terlalu panjang -15'); }

  const aman = skor >= 60;
  return { skor: Math.max(0, Math.min(100, skor)), aman, alasan: catatan.join(', ') || 'Standar' };
}

/**
 * Verifikasi URL dengan HEAD request (cek resolusi & redirect).
 * Kembalikan { resolves, finalUrl, statusCode }
 */
async function verifikasiUrl(url, timeout = 6000) {
  try {
    const r = await axios.head(url, {
      timeout,
      maxRedirects: 3,
      validateStatus: (s) => s < 500,
      headers: { 'User-Agent': 'KiosBot-SafetyCheck/1.0 (kios-openclaw; +id)' },
    });
    const finalUrl = r.request?.res?.responseUrl || r.request?.responseURL || url;
    // Re-skor setelah redirect (final URL bisa beda)
    const skorFinal = skorAman(finalUrl);
    return { resolves: true, finalUrl, statusCode: r.status, skorFinal };
  } catch {
    return { resolves: false, finalUrl: url, statusCode: 0, skorFinal: skorAman(url) };
  }
}

/**
 * Periksa satu URL: skor statis + verifikasi live.
 * Kembalikan { url, aman, skor, alasan, finalUrl }
 */
async function periksaUrl(url) {
  const statis = skorAman(url);
  if (!statis.aman) return { url, aman: false, skor: statis.skor, alasan: statis.alasan, finalUrl: url };

  const live = await verifikasiUrl(url);
  const skorAkhir = live.resolves ? live.skorFinal : statis;
  return {
    url,
    aman   : live.resolves && skorAkhir.aman,
    skor   : live.resolves ? skorAkhir.skor : Math.max(0, statis.skor - 20),
    alasan : live.resolves ? skorAkhir.alasan : `Tidak bisa diakses (${statis.alasan})`,
    finalUrl: live.finalUrl,
  };
}

/**
 * Periksa array URL secara paralel (maks 5 bersamaan).
 */
async function periksaBanyakUrl(urls) {
  const unik = [...new Set(urls.filter(Boolean))].slice(0, 10);
  return Promise.all(unik.map(periksaUrl));
}

module.exports = { skorAman, periksaUrl, periksaBanyakUrl };
