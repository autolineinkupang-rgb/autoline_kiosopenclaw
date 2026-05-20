'use strict';

const axios = require('axios');

const TAVILY_KEY = process.env.TAVILY_API_KEY;
const BRAVE_KEY = process.env.BRAVE_API_KEY;
const MAX_RESULTS = 4;
const TIMEOUT = 10000;

// Kata kunci yang butuh info real-time dari internet
const BUTUH_SEARCH = /langka|harga pasar|terbaru|berita|kapal|terlambat|stok di|beli di mana|dimana beli|cek di browser|cek browser|cek internet|tersedia|distributor|supplier|cuaca|kelangkaan|kosong|habis di/i;

// ── Tavily (terbaik untuk AI, free 1000/bulan) ────────────────────────────────
async function tavilySearch(query) {
  if (!TAVILY_KEY) return null;
  try {
    const r = await axios.post('https://api.tavily.com/search', {
      api_key: TAVILY_KEY,
      query,
      search_depth: 'basic',
      include_answer: true,
      include_raw_content: false,
      max_results: MAX_RESULTS,
      include_domains: [],
      exclude_domains: [],
    }, { timeout: TIMEOUT });

    const data = r.data;
    const results = (data.results || []).map(x => ({
      title: x.title || '',
      snippet: (x.content || '').slice(0, 400),
      url: x.url || '',
      score: x.score || 0,
    }));

    // Tavily kadang juga kasih direct answer
    if (data.answer) {
      results.unshift({ title: '📌 Ringkasan', snippet: data.answer.slice(0, 400), url: '', score: 1 });
    }
    return results.length ? results : null;
  } catch { return null; }
}

// ── Brave Search ───────────────────────────────────────────────────────────────
async function braveSearch(query) {
  if (!BRAVE_KEY) return null;
  try {
    const r = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
      params: { q: query, count: MAX_RESULTS, lang: 'id', country: 'ID' },
      timeout: TIMEOUT,
    });
    return (r.data?.web?.results || []).slice(0, MAX_RESULTS).map(x => ({
      title: x.title || '',
      snippet: (x.description || '').slice(0, 400),
      url: x.url || '',
    }));
  } catch { return null; }
}

// ── Jina Reader — baca halaman web apapun jadi teks bersih (GRATIS, no key) ───
async function bacaHalaman(url) {
  if (!url || !url.startsWith('http')) return null;
  try {
    const r = await axios.get(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      timeout: 12000,
    });
    return (r.data || '').slice(0, 1500); // max 1500 karakter
  } catch { return null; }
}

// ── DuckDuckGo HTML search (fallback terakhir, tanpa key) ─────────────────────
async function ddgSearch(query) {
  try {
    const r = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query, kl: 'id-id' },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KiosBot/1.0)' },
      timeout: TIMEOUT,
    });
    const html = r.data || '';
    const results = [];
    // Extract result titles + snippets from DDG HTML
    const snippetRe = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    const titleRe = /<a class="result__a"[^>]*>([^<]+)<\/a>/g;
    const titles = [...html.matchAll(titleRe)].map(m => m[1]).slice(0, MAX_RESULTS);
    const snippets = [...html.matchAll(snippetRe)].map(m => m[1]).slice(0, MAX_RESULTS);
    titles.forEach((t, i) => {
      if (t) results.push({ title: t, snippet: snippets[i] || '', url: '' });
    });
    return results.length ? results : null;
  } catch { return null; }
}

// ── Main search: coba berurutan sampai dapat hasil ────────────────────────────
async function search(query) {
  return (
    (await tavilySearch(query)) ||
    (await braveSearch(query)) ||
    (await ddgSearch(query)) ||
    []
  );
}

// ── Search + opsional baca halaman pertama ────────────────────────────────────
async function searchDanBaca(query, bacaUrl = false) {
  const results = await search(query);
  if (bacaUrl && results.length && results[0].url) {
    const isiHalaman = await bacaHalaman(results[0].url);
    if (isiHalaman) results[0].isiHalaman = isiHalaman;
  }
  return results;
}

function perluSearch(teks) {
  return BUTUH_SEARCH.test(teks);
}

function formatUntukAI(results) {
  if (!results.length) return '';
  let ctx = '\n\n[INFO DARI INTERNET — jadikan referensi, sebutkan sumber jika relevan]:\n';
  results.forEach((r, i) => {
    ctx += `(${i + 1}) ${r.title}`;
    if (r.url) ctx += ` [${r.url}]`;
    ctx += `\n${r.snippet}\n`;
    if (r.isiHalaman) ctx += `Detail: ${r.isiHalaman.slice(0, 600)}\n`;
  });
  return ctx;
}

module.exports = { search, searchDanBaca, bacaHalaman, perluSearch, formatUntukAI };
