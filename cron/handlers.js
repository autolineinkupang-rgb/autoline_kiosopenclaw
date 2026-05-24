'use strict';

const { callSkill } = require('../signal/bridge');
const Formatter = require('../signal/response-formatter');
const Gudang = require('../skills/gudang');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');
const { resetBasePatterns } = require('../signal/intent-detector');
const { getModel } = require('../config/models');
const Groq = require('groq-sdk');
const fs   = require('fs');
const path = require('path');

const AI_BATCH_FILE  = path.join(__dirname, '..', 'data', 'learn-pending-ai.json');
const BASE_FILE      = path.join(__dirname, '..', 'data', 'base-patterns.json');
const STATE_FILE     = path.join(__dirname, '..', 'data', 'learn-state.json');

let _kirimKeGrup, _kirimPesan;

function init(kirimKeGrup, kirimPesan) {
  _kirimKeGrup = kirimKeGrup;
  _kirimPesan = kirimPesan;
}

async function laporanHarian() {
  const r = callSkill('laporan', 'ringkas', {});
  if (r.ok) await _kirimKeGrup(Formatter.laporanRingkas(r.data));
}

async function alertGudangCuaca() {
  const gudangR = Gudang.produkMauHabis();
  const cuacaData = await Cuaca.getCuacaLengkap().catch(() => null);
  const cuacaInfo = cuacaData?.dampak ? cuacaData.dampak.pesan : null;
  if (!gudangR.ok) return;
  await _kirimKeGrup(Gudang.formatAlertGudang(gudangR.kritis, gudangR.rendah, cuacaInfo));
  if (cuacaData?.dampak?.restock) {
    await _kirimPesan(Cuaca.formatAlertCuaca(cuacaData.dampak, cuacaData.gelombang));
  }
}

async function risetHargaTop10() {
  const analisis = await MarketIntel.risetHargaTop(10);
  if (analisis.length) await _kirimPesan(MarketIntel.formatMarketIntel(analisis, 'harian'));
}

async function risetHargaMingguan() {
  const analisis = await MarketIntel.risetHargaTop(15);
  if (analisis.length) await _kirimKeGrup(MarketIntel.formatMarketIntel(analisis, 'mingguan'));
}

async function laporanBelajar() {
  const [learned, unknowns, shortcuts, laporanR] = await Promise.all([
    Learning.getLearnedToday().catch(() => []),
    Learning.getUnknowns().catch(() => []),
    Learning.getAllShortcuts().catch(() => ({})),
    Promise.resolve(callSkill('laporan', 'ringkas', {})),
  ]);
  const lapData = laporanR.ok ? laporanR.data : {};
  const cuacaData = await Cuaca.getCuacaLengkap().catch(() => null);
  const msg = Formatter.laporanBelajar({
    learned, unknowns, shortcuts,
    ...lapData, top: lapData.top3?.[0],
    cuacaInfo: cuacaData?.dampak?.pesan || null,
  });
  await _kirimKeGrup(msg);
}

async function cekGelombangPeriodik() {
  try {
    const g = await Cuaca.fetchGelombang();
    const dampak = Cuaca.analisisDampakPasokan(g);
    if (dampak?.level === 'BAHAYA') {
      const cached = await Learning.getPattern('gelombang_alert_sent').catch(() => null);
      if (!cached || Date.now() - (cached?.ts || 0) > 3 * 3600 * 1000) {
        await _kirimPesan(Cuaca.formatAlertCuaca(dampak, g));
        Learning.savePattern('gelombang_alert_sent', 'INTERNAL', null).catch(() => {});
      }
    }
  } catch {}
}

// 01:30 WITA — kompres queue sebelum sesi belajar
function ringkasQueue() {
  try { callSkill('self-learner', 'ringkas', {}); } catch {}
}

// 02:00 WITA — sesi belajar mandiri (analisis lokal, 0 token kecuali batch AI)
async function selfLearn() {
  try {
    const r = callSkill('self-learner', 'belajar', {});
    if (r.ok && r.data?.status !== 'skip' && r.data?.pelajaran?.length) {
      const pelajaran = r.data.pelajaran.join('\n• ');
      const hemat     = r.data.token_hemat || 0;
      const rate      = r.data.berhasil_rate || 0;
      const msg = `🧠 *Sesi Belajar Bot*\n` +
        `📅 ${r.data.sesi}\n` +
        `✅ Sukses: ${rate}% | Antrian: ${r.data.total_antrian}\n` +
        `• ${pelajaran}\n` +
        `💡 Token hemat: ${hemat} permintaan diproses lokal`;
      await _kirimPesan(msg);
    }
  } catch {}
}

// ── Helpers untuk applyAiBatch ────────────────────────────────────────────────
function _loadJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}

function _saveJson(p, data) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function _extractJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]+?)```/) || text.match(/(\{[\s\S]+\})/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// 02:30 WITA — apply hasil AI batch ke base-patterns + self-update
async function applyAiBatch() {
  try {
    const batch = _loadJson(AI_BATCH_FILE, {});
    if (!batch.items || !batch.items.length) return;

    const mdlBatch = getModel('batch');
    const groq = new Groq({ apiKey: process.env[mdlBatch.env_key] });
    const daftarPesan = batch.items.map((it, i) => `${i + 1}. "${it.pesan}" (${it.frekuensi}x)`).join('\n');

    const prompt = `Kamu adalah asisten untuk bot kios toko kecil di Rote Ndao, NTT, Indonesia.
Berikut daftar pesan yang sering diketik user tapi tidak dipahami bot:
${daftarPesan}

Tugas:
1. Jika pesan adalah nama/singkatan produk toko (sembako, rokok, minuman, dll), masukkan ke "shortcuts" (key=singkatan, value=nama produk lengkap).
2. Jika pesan adalah variasi penulisan produk yang sudah ada, masukkan ke "aliases" (key=nama_produk, value=array varian).
3. Jika pesan adalah perintah bot dengan pola tertentu (laporan, stok, dll), masukkan ke "intent_hints" sebagai {re: "regex", tipe: "NAMA_INTENT"}.
   Intent yang tersedia: JUAL, BELI, STOK, LAPORAN, HARGA, CARI, BANTUAN, EXP, CEK_KRITIS, TERLARIS, LAPORAN_MINGGUAN, LAPORAN_BULANAN, HARGA_PASAR.
4. Abaikan pesan yang tidak relevan untuk bot kios.

Jawab HANYA dengan JSON valid:
{"shortcuts": {}, "aliases": {}, "intent_hints": []}`;

    const resp = await groq.chat.completions.create({
      model      : mdlBatch.model_id,
      messages   : [{ role: 'user', content: prompt }],
      temperature: mdlBatch.temperature,
      max_tokens : mdlBatch.max_tokens,
    });

    const text = resp.choices?.[0]?.message?.content || '';
    const hasil = _extractJson(text);
    if (!hasil) return;

    // Merge ke base-patterns.json
    const base = _loadJson(BASE_FILE, { shortcuts: {}, aliases: {}, intent_hints: [] });
    Object.assign(base.shortcuts, hasil.shortcuts || {});
    for (const [prod, variants] of Object.entries(hasil.aliases || {})) {
      base.aliases[prod] = [...new Set([...(base.aliases[prod] || []), ...variants])];
    }
    base.intent_hints = [...(base.intent_hints || []), ...(hasil.intent_hints || [])];
    _saveJson(BASE_FILE, base);

    // Reload cache intent-detector
    resetBasePatterns();

    // Self-update: catat ke knowledge-base dan bersihkan pending
    callSkill('self-learner', 'terapkan', {
      shortcuts   : hasil.shortcuts   || {},
      aliases     : hasil.aliases     || {},
      intent_hints: hasil.intent_hints || [],
    });

    // Notif ke owner
    const sc = Object.keys(hasil.shortcuts || {}).length;
    const al = Object.keys(hasil.aliases   || {}).length;
    const hi = (hasil.intent_hints || []).length;
    if (_kirimPesan && (sc + al + hi > 0)) {
      await _kirimPesan(
        `🤖 *Bot Update Otomatis*\n` +
        `✅ ${sc} shortcut baru, ${al} alias baru, ${hi} pola intent baru\n` +
        `🔄 Pola sudah aktif — bot lebih pintar sekarang`
      );
    }
  } catch (e) {
    // silent — jangan ganggu operasional
  }
}

// ── Startup check: jalankan pending batch jika cron tadi malam tidak sempat ──
async function cekPendingOnStartup() {
  try {
    const batch = _loadJson(AI_BATCH_FILE, {});
    if (!batch.items || !batch.items.length) return;

    // Cek kapan terakhir di-apply
    const state   = _loadJson(STATE_FILE, {});
    const lastStr = state.last_terapkan || '';
    if (lastStr) {
      // Konversi "YYYY-MM-DD HH:MM" WITA ke ms
      const lastMs = new Date(lastStr.replace(' ', 'T') + '+08:00').getTime();
      if (!isNaN(lastMs) && Date.now() - lastMs < 6 * 3600 * 1000) return;
    }

    // Pending batch belum diproses — tunda 60 detik agar bot fully online dulu
    setTimeout(async () => {
      await applyAiBatch();
      if (_kirimPesan) {
        await _kirimPesan('🔄 *Update tertunda dijalankan* — batch yang belum sempat diproses tadi malam sudah diterapkan.');
      }
    }, 60 * 1000);
  } catch {}
}

// 03:00 WITA — bersihkan memori percakapan grup (>1 hari) tanpa ganggu file lain
function bersihkanMemoriGrup() {
  try { callSkill('memory-chat', 'bersihkan', {}); } catch {}
}

// 06:30 + 12:00 WITA — PicaMan buat saran dan Irma kirim ke grup
async function kirimSaranPicaMan() {
  try {
    const r = callSkill('saran', 'buat', {});
    if (!r.ok || !r.data?.saran?.length) return;

    for (const s of r.data.saran) {
      await _kirimKeGrup(s.pesan);
      try { callSkill('saran', 'tandai_terkirim', { id: s.id }); } catch {}
    }
  } catch {}
}

module.exports = {
  init, laporanHarian, alertGudangCuaca, risetHargaTop10,
  risetHargaMingguan, laporanBelajar, cekGelombangPeriodik,
  selfLearn, ringkasQueue, applyAiBatch, cekPendingOnStartup,
  bersihkanMemoriGrup, kirimSaranPicaMan,
};
