#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const { parsePerintah, validasiPerintah } = require('./message-parser');
const { detect, detectAsync, resetBasePatterns } = require('./intent-detector');
const Formatter = require('./response-formatter');
const { prosesAI, loadTokenData, simpanTokenHemat } = require('./ai-handler');
const { callSkill, invalidateCache } = require('./bridge');
const { sanitizeInput, cekRateLimit } = require('../scripts/security');
const Kasir = require('../skills/kasir');
const Learning = require('../skills/learning-engine');
const SelfDebug = require('../skills/self-debug');
const { prosesIntentBaru } = require('./intent-handlers');
const { prosesLokal } = require('./local-processor');
const { initCron } = require('../cron/scheduler');
const CronHandlers = require('../cron/handlers');
const RBAC       = require('../scripts/rbac');
const bus        = require('../scripts/event-bus');
const MarketIntel = require('../skills/market-intel');

const ROOT = path.join(__dirname, '..');

// ── Progress helpers (PicaMan) ────────────────────────────────────────────────
function _progresBar(persen) {
  const n = Math.max(0, Math.min(10, Math.round(persen / 10)));
  return '▓'.repeat(n) + '░'.repeat(10 - n);
}

function _progresFooter(persen, ms) {
  const waktu = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  return `\n_📊 PicaMan: [${_progresBar(persen)}] ${persen}% · ${waktu}_`;
}

// Fire-and-forget: catat interaksi ke learning queue (0 dampak ke response time)
function antriLearning(pesan, intent, berhasil, respons = '') {
  try {
    callSkill('self-learner', 'antri', { pesan, intent, berhasil, respons });
  } catch {}
}

// ── Remote Shell (owner-only, personal message only) ─────────────────────────
const _SHELL_BLACKLIST = /(?:^|\s|;|&&|\|\|)(?:rm\s+-[rf]{2}|mkfs|dd\s+if=|:\(\)\s*\{|>\/dev\/s[a-z]|shutdown\s+-[hr]|halt|reboot|poweroff|fdisk|wipefs|shred|chmod\s+[0-7]{3,4}\s+\/|chown\s+.*\s+\/)/i;

function eksekusiShell(cmd) {
  if (_SHELL_BLACKLIST.test(cmd)) {
    return { ok: false, alasan: 'Perintah diblokir — terdeteksi pola berbahaya' };
  }
  try {
    const r = spawnSync('bash', ['-c', cmd], {
      timeout: 30000,
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, HOME: process.env.HOME || '/root' },
    });
    const stdout = (r.stdout || '').slice(0, 3000);
    const stderr = (r.stderr || '').slice(0, 500);
    const keluar = r.status ?? -1;
    return { ok: true, stdout, stderr, keluar };
  } catch (e) {
    return { ok: false, alasan: e.message };
  }
}
const MEMORY_FILE = path.join(ROOT, 'memory', 'kios-memory.json');
const LOG_FILE = path.join(ROOT, 'logs', 'signal.log');
const ACTIVITY_LOG = path.join(ROOT, 'logs', 'bot-activity.log');

const PHONE = process.env.SIGNAL_NUMBER || process.env.SIGNAL_PHONE_NUMBER;
const RECIPIENT = process.env.SIGNAL_RECIPIENT;
const GROUP_ID = process.env.SIGNAL_GROUP_ID;
const WHITELIST = process.env.SIGNAL_WHITELIST || RECIPIENT || '';
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || 'signal-cli';

// Set berisi semua nomor/uuid whitelist (normalized, sudah di-parse sekali)
const _normalizePhone = (p) => String(p).replace(/[\s\-()]/g, '');
const WHITELIST_SET = new Set(
  WHITELIST.split(',').map(s => _normalizePhone(s.trim())).filter(Boolean)
);

function isWhitelisted(sender) {
  if (!sender) return false;
  return WHITELIST_SET.has(_normalizePhone(sender));
}

// --- Logging ---

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function logActivity(sender, aksi, hasil) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  try { fs.appendFileSync(ACTIVITY_LOG, `[${ts}] ${sender} | ${aksi} | ${hasil}\n`); } catch {}
}

function readMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
}

// --- Confirmation state (in-memory, TTL 90 detik) ---

const pendingConfirmations = new Map();
const CONFIRM_TTL_MS = 90_000;

function setBuatKonfirmasi(sender, tipe, data, kode) {
  pendingConfirmations.set(sender, { tipe, data, kode, expiresAt: Date.now() + CONFIRM_TTL_MS });
}

function cekKonfirmasi(sender, teksInput) {
  const p = pendingConfirmations.get(sender);
  if (!p || Date.now() > p.expiresAt) { pendingConfirmations.delete(sender); return null; }
  if (teksInput.trim().toUpperCase() === p.kode.toUpperCase()) {
    pendingConfirmations.delete(sender);
    return p;
  }
  if (/^(batal|cancel|tidak|ga jadi|no)/i.test(teksInput.trim())) {
    pendingConfirmations.delete(sender);
    return { tipe: 'BATAL' };
  }
  return null; // Masih nunggu konfirmasi valid
}

let rpcProc = null;
let rpcId = 0;
const pendingRpc = new Map();
let rpcBuffer = '';

function rpcWrite(method, params) {
  return new Promise((resolve, reject) => {
    if (!rpcProc || rpcProc.killed) {
      reject(new Error('signal-cli tidak berjalan'));
      return;
    }
    const id = ++rpcId;
    const timer = setTimeout(() => {
      pendingRpc.delete(id);
      reject(new Error(`RPC timeout [${method}]`));
    }, 12000);
    pendingRpc.set(id, { resolve, reject, timer });
    rpcProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', 'utf8');
  });
}

function rpcOnLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  // Pesan masuk = notifikasi tanpa id
  if (msg.method === 'receive' && msg.params) {
    prosesEnvelope(msg.params.envelope || msg.params).catch(() => {});
    return;
  }

  // Respons atas request kita
  if (msg.id !== undefined) {
    const pend = pendingRpc.get(msg.id);
    if (!pend) return;
    clearTimeout(pend.timer);
    pendingRpc.delete(msg.id);
    if (msg.error) pend.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else pend.resolve(msg.result);
  }
}

async function kirimPesan(teks, penerima = RECIPIENT) {
  if (!penerima) { log('[PREVIEW] ' + teks.slice(0, 100)); return false; }
  try {
    await rpcWrite('send', { recipient: [penerima], message: teks.slice(0, 4096) });
    log(`Terkirim ke ${penerima}`);
    return true;
  } catch (e) { log(`Gagal kirim: ${e.message}`); return false; }
}

async function kirimKeGrup(teks) {
  if (!GROUP_ID) { log('GROUP_ID belum diset'); return false; }
  try {
    await rpcWrite('send', { groupId: GROUP_ID, message: teks.slice(0, 4096) });
    log('Terkirim ke grup');
    return true;
  } catch (e) { log(`Gagal kirim grup: ${e.message}`); return false; }
}

function alertAdmin(pesan) {
  log(`[SECURITY] ${pesan}`);
  // Kirim ke semua nomor di whitelist agar seluruh pemilik tahu
  for (const nomor of WHITELIST_SET) {
    kirimPesan(`🚨 *Security Alert*\n${pesan}`, nomor);
  }
}

async function eksekusiKonfirmasi(konfirmasi) {
  const { tipe, data } = konfirmasi;

  if (tipe === 'HAPUS_PRODUK') {
    const r = callSkill('stok', 'hapus', { produk: data.produk });
    if (!r.ok) return Formatter.error(r.error);
    return Formatter.hapusProdukOk(r.data.item.nama);
  }

  if (tipe === 'BATALKAN_TX') {
    const r = callSkill('stok', 'batalkan_tx', { id: data.idTx });
    if (!r.ok) return Formatter.error(r.error);
    return Formatter.batalkanTxOk(r.data.tx);
  }

  return 'Aksi selesai 👍';
}

// --- AI result handler ---

async function prosesAIResult(aiResult, sender) {
  switch (aiResult.tipe) {
    case 'JUAL': {
      const r = callSkill('stok', 'jual', { produk: aiResult.produk, qty: aiResult.qty, metode: aiResult.metode });
      if (!r.ok) return Formatter.error(r.error);
      invalidateCache('stok'); invalidateCache('laporan');
      const { item, qty, total, sisa, metode } = r.data;
      logActivity(sender, `JUAL:${item.nama} x${qty}`, `OK total=${total}`);
      return Formatter.konfirmasiJual(item.nama, qty, item.satuan, total, sisa, metode);
    }
    case 'BELI': {
      const r = callSkill('stok', 'tambah', {
        produk: aiResult.produk, qty: aiResult.qty, harga: aiResult.harga,
        supplier: aiResult.supplier || '', auto_create: true,
      });
      if (!r.ok) return Formatter.error(r.error);
      invalidateCache('stok'); invalidateCache('laporan');
      const d = r.data;
      logActivity(sender, `BELI:${d.item.nama} x${aiResult.qty}${d.auto_created ? ' [AUTO-CREATE]' : ''}`, 'OK');
      return Formatter.konfirmasiBeli(d.item.nama, aiResult.qty, d.item.satuan, d.harga_beli, d.stok_baru, {
        priceChanged: d.price_changed, hargaLama: d.harga_lama,
        supplier: d.supplier, autoCreated: d.auto_created,
      });
    }
    case 'TAMBAH_PRODUK': {
      const r = callSkill('stok', 'tambah_produk', aiResult);
      if (!r.ok) return Formatter.error(r.error);
      invalidateCache('stok');
      logActivity(sender, `TAMBAH_PRODUK:${aiResult.nama}`, 'OK');
      return Formatter.tambahProdukOk(r.data.produk);
    }
    case 'HAPUS_PRODUK': {
      // Verifikasi produk ada dulu
      const cek = callSkill('stok', 'cari', { produk: aiResult.produk });
      if (!cek.ok) return Formatter.error('Produk tidak ditemukan');
      setBuatKonfirmasi(sender, 'HAPUS_PRODUK', { produk: aiResult.produk }, 'YA HAPUS');
      logActivity(sender, `HAPUS_PRODUK:${aiResult.produk}`, 'PENDING_CONFIRM');
      return Formatter.hapusProdukKonfirmasi(cek.data.item.nama);
    }
    case 'UPDATE_HARGA': {
      const r = callSkill('harga', 'update', {
        produk: aiResult.produk,
        harga_jual: aiResult.harga_jual,
        harga_beli: aiResult.harga_beli,
      });
      if (!r.ok) return Formatter.error(r.error);
      logActivity(sender, `UPDATE_HARGA:${aiResult.produk}`, 'OK');
      return Formatter.updateHargaOk(r.data.item);
    }
    case 'UPDATE_EXP': {
      const r = callSkill('stok', 'update_exp', { produk: aiResult.produk, exp_date: aiResult.exp_date });
      if (!r.ok) return Formatter.error(r.error);
      logActivity(sender, `UPDATE_EXP:${aiResult.produk}`, 'OK');
      return Formatter.updateExpOk(r.data.item);
    }
    case 'SET_STOK': {
      const r = callSkill('stok', 'set_stok', { produk: aiResult.produk, stok_baru: aiResult.stok_baru });
      if (!r.ok) return Formatter.error(r.error);
      logActivity(sender, `SET_STOK:${aiResult.produk} -> ${aiResult.stok_baru}`, 'OK');
      return Formatter.setStokOk(r.data.item.nama, r.data.stok_lama, r.data.stok_baru, r.data.item.satuan);
    }
    case 'LAPORAN_AI': {
      const skillNama = ['riwayat', 'laba', 'mingguan', 'bulanan'].includes(aiResult.subTipe) ? aiResult.subTipe : 'ringkas';
      const r = callSkill('laporan', skillNama, { periode: aiResult.periode });
      if (!r.ok) return Formatter.error(r.error);
      if (aiResult.subTipe === 'riwayat') return Formatter.riwayatTransaksi(r.data.transaksi, r.data.periode);
      if (aiResult.subTipe === 'laba') return Formatter.labaRugi(r.data);
      return Formatter.laporanRingkas(r.data);
    }
    case 'BATALKAN_TX': {
      if (!aiResult.idTx) return Formatter.error('ID transaksi tidak ditemukan di pesan kak');
      // Cek dulu tx-nya
      const txData = callSkill('laporan', 'riwayat', { periode: 'bulan' });
      const tx = txData.ok ? txData.data.transaksi.find(t => t.id.toUpperCase() === aiResult.idTx.toUpperCase()) : null;
      if (!tx) return Formatter.error(`Transaksi ${aiResult.idTx} tidak ditemukan`);
      setBuatKonfirmasi(sender, 'BATALKAN_TX', { idTx: aiResult.idTx }, 'YA BATALKAN');
      logActivity(sender, `BATALKAN_TX:${aiResult.idTx}`, 'PENDING_CONFIRM');
      return Formatter.batalkanTxKonfirmasi(tx);
    }
    case 'CEK_KRITIS': {
      if (aiResult.subTipe === 'stok' || aiResult.subTipe === 'semua') {
        const r = callSkill('notif', 'stok_kritis', {});
        if (r.ok) return Formatter.hampirHabis(r.data.kritis, r.data.rendah);
      }
      if (aiResult.subTipe === 'exp' || aiResult.subTipe === 'semua') {
        const r = callSkill('notif', 'exp_alert', {});
        if (r.ok) {
          const all = [...r.data.expired, ...r.data.hampir_exp];
          const tipe = r.data.expired.length ? 'expired' : 'hampir';
          return Formatter.hampirExp(all, tipe);
        }
      }
      return Formatter.error('Gagal cek status kritis');
    }
    default:
      return Formatter.bantuan();
  }
}

async function prosesPerintah(teks, sender = 'unknown', ctx = {}) {
  const kirimProgres = ctx.kirimProgres || (() => Promise.resolve());
  const rute = ctx.rute || [];
  const parsed = parsePerintah(teks);
  const valid = validasiPerintah(parsed);
  if (!valid.valid) return Formatter.error(valid.error);

  // Cek izin RBAC sebelum eksekusi
  const role = RBAC.getRole(sender, WHITELIST_SET);
  if (!role) return '⛔ Akses ditolak. Hubungi pemilik kios untuk mendapatkan akses.';
  if (!RBAC.boleh(role, parsed.tipe)) {
    return `⛔ *Akses ditolak* — role *${role}* tidak boleh menjalankan *${parsed.tipe}*.\nHubungi pemilik kios untuk izin tambahan.`;
  }

  switch (parsed.tipe) {
    case 'STOK': {
      const r = callSkill('stok', 'cek', {});
      return r.ok ? Formatter.stokRingkas(r.data.stok) : Formatter.error(r.error);
    }
    case 'LAPORAN': {
      const r = callSkill('laporan', 'ringkas', {});
      if (!r.ok) return Formatter.error(r.error);
      let msg = Formatter.laporanRingkas(r.data);
      // Pelengkap: warning harga tidak kompetitif dari market intel
      try {
        const analisis = await MarketIntel.risetHargaTop(5);
        const bermasalah = analisis.filter(a => a.status.includes('⚠️') || a.status.includes('🔥'));
        if (bermasalah.length) {
          msg += `\n\n⚠️ *${bermasalah.length} produk harga tidak kompetitif:* ${bermasalah.map(a => a.item).join(', ')}\nKetik *harga pasar* untuk detail.`;
        }
      } catch {}
      // Pelengkap: promo aktif
      try {
        const pr = callSkill('promo', 'daftar', { aktif_only: true });
        if (pr.ok && pr.data.promos.length) {
          msg += `\n🏷️ Promo aktif: ${pr.data.promos.length} promo berjalan`;
        }
      } catch {}
      return msg;
    }
    case 'JUAL': {
      const result = Kasir.jual({ produk: parsed.produk, qty: parsed.qty, metode: parsed.metode, bayar: parsed.bayar || null });
      if (!result.ok) return Formatter.error(result.error);
      logActivity(sender, `JUAL:${result.item.nama} x${parsed.qty}`, `OK total=${result.total}`);
      Learning.trackHabit('sale', result.item.nama).catch(() => {});
      return result.struk;
    }
    case 'BELI': {
      const r = callSkill('stok', 'tambah', {
        produk: parsed.produk, qty: parsed.qty, harga: parsed.harga,
        supplier: parsed.supplier || '', auto_create: true,
      });
      if (!r.ok) return Formatter.error(r.error);
      const d = r.data;
      logActivity(sender, `BELI:${d.item.nama} x${parsed.qty}${d.auto_created ? ' [AUTO-CREATE]' : ''}${d.price_changed ? ' [HARGA BERUBAH]' : ''}`, 'OK');
      let msg = Formatter.konfirmasiBeli(d.item.nama, parsed.qty, d.item.satuan, d.harga_beli, d.stok_baru, {
        priceChanged: d.price_changed, hargaLama: d.harga_lama,
        supplier: d.supplier, autoCreated: d.auto_created,
      });
      // Pelengkap: suggest supplier yang cocok jika belum disebutkan
      if (!parsed.supplier) {
        try {
          const sp = callSkill('supplier', 'cari', { nama: d.item.nama });
          if (sp.ok && sp.data.supplier) {
            msg += `\n💡 Supplier tersedia: *${sp.data.supplier.nama}*${sp.data.supplier.kontak ? ' — ' + sp.data.supplier.kontak : ''}`;
          }
        } catch {}
      }
      return msg;
    }
    case 'EXP': {
      const r = callSkill('stok', 'exp', {});
      return r.ok ? Formatter.ringkasanExp(r.data.stok) : Formatter.error(r.error);
    }
    case 'CARI': {
      const r = callSkill('stok', 'cari', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      let msg = Formatter.detailProduk(r.data.item);
      // Pelengkap: cek promo aktif untuk produk ini
      try {
        const pr = callSkill('promo', 'cek', { produk: r.data.item.nama, qty: 1, harga_jual: r.data.item.harga_jual });
        if (pr.ok && pr.data.promo) {
          const p = pr.data.promo;
          msg += `\n🏷️ Promo aktif: diskon ${p.tipe === 'persen' ? p.nilai + '%' : 'Rp' + Number(p.nilai).toLocaleString('id-ID')} (min ${p.min_qty || 1} pcs)`;
        }
      } catch {}
      // Pelengkap: cek supplier yang biasa suplai produk ini
      try {
        const sp = callSkill('supplier', 'cari', { nama: r.data.item.supplier || r.data.item.nama });
        if (sp.ok && sp.data.supplier) msg += `\n🚚 Supplier: ${sp.data.supplier.nama}`;
      } catch {}
      return msg;
    }
    case 'HARGA': {
      const r = callSkill('harga', 'cek', { produk: parsed.produk });
      if (r.ok) return Formatter.infoHarga(r.data.item);
      // Produk tidak ada di kios → tanya AI (mungkin pertanyaan harga pasar)
      const stokAI = callSkill('stok', 'cek', {});
      const aiR = await prosesAI({ teks, stok: stokAI.ok ? stokAI.data.stok : [], memory: readMemory() });
      if (aiR.tipe === 'AI_RESPONS') return aiR.teks;
      return prosesAIResult(aiR, sender);
    }
    case 'BANTUAN': return Formatter.bantuan();
    case 'STATUS': {
      const memory = readMemory();
      const perf = SelfDebug.getPerformanceReview();
      const tokenData = loadTokenData();
      const hariIni = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const harian = tokenData.daily?.[hariIni] || {};
      const hemat = harian.hemat || 0;
      const terpakai = harian.total || 0;
      const totalEstimasi = hemat + terpakai;
      const efisiensi = totalEstimasi > 0 ? Math.round((hemat / totalEstimasi) * 100) : 0;
      const tokenInfo = `\n\n🤖 *Token AI Hari Ini:*\n` +
        `• Terpakai: ${terpakai.toLocaleString('id-ID')} token (${harian.calls || 0}x panggilan)\n` +
        `• Hemat PicaMan: ${hemat.toLocaleString('id-ID')} token\n` +
        `• Efisiensi: ${efisiensi}% token dihemat\n` +
        `• Groq: ${tokenData.groq_calls || 0}x | Gemini: ${tokenData.gemini_calls || 0}x`;
      return Formatter.status(memory) + '\n' + Formatter.statusPanel({
        inventoryAction: `${perf.total_tasks} tugas`,
        bugStatus: perf.bugs_found > 0 ? `${perf.bugs_found} bug (${perf.bugs_fixed} fixed)` : 'none',
        learned: `${perf.prevention_rules} rules`,
      }) + tokenInfo;
    }
    case 'BACKUP': {
      spawn(process.execPath, [path.join(ROOT, 'scripts/backup.js')], { stdio: 'ignore', detached: true }).unref();
      return 'Oke kak, backup dimulai! 💾';
    }
    case 'AI_CHAT': {
      // v5.0: coba rule-based intent detection dulu (hemat token)
      const intentFast = detect(parsed.teks) || (await detectAsync(parsed.teks, Learning).catch(() => null));
      if (intentFast && intentFast.tipe && intentFast.tipe !== 'AI_CHAT') {
        // Cek RBAC untuk intent yang terdeteksi
        if (!RBAC.boleh(role, intentFast.tipe)) {
          return `⛔ *Akses ditolak* — role *${role}* tidak boleh menjalankan *${intentFast.tipe}*.`;
        }
        // Intent terdeteksi tanpa AI
        const baru = await prosesIntentBaru(intentFast, sender, logActivity, ctx);
        if (baru) {
          Learning.saveLearnedToday([{ cmd: parsed.teks, intent: intentFast.tipe }]).catch(() => {});
          antriLearning(parsed.teks, intentFast.tipe, true, baru);
          try { simpanTokenHemat(800); } catch {} // hemat 1 panggilan AI
          return baru;
        }
        // Cek apakah bisa dihandle di prosesAIResult (tipe JUAL, BELI, dll)
        const vldIntent = validasiPerintah(intentFast);
        if (vldIntent.valid && intentFast.tipe !== 'AI_CHAT') return prosesAIResult(intentFast, sender);
      }
      // ── Konsultasi openclaw sebelum panggil AI (hemat token) ───────────────
      try {
        const konsul = callSkill('self-learner', 'konsultasi', { pesan: parsed.teks });
        if (konsul.ok && konsul.data.dikenali && konsul.data.confidence >= 0.80) {
          const hint = konsul.data;
          log(`[openclaw] konsultasi hit: ${hint.hint_produk || hint.hint_intent} (${hint.confidence} via ${hint.sumber})`);
          // Gunakan hint openclaw — arahkan ke intent yang tepat
          const synth = hint.hint_produk
            ? detect(`cari ${hint.hint_produk}`)
            : { tipe: hint.hint_intent };
          if (synth) {
            const baru = await prosesIntentBaru(synth, sender, logActivity, ctx).catch(() => null);
            if (baru) {
              antriLearning(parsed.teks, synth.tipe, true, baru);
              try { simpanTokenHemat(800); } catch {} // hemat 1 panggilan AI via openclaw
              return baru;
            }
          }
        }
      } catch {}

      // ── Proses lokal — produk ada di DB, aksi bisa diidentifikasi ──────────
      try {
        const lokal = await prosesLokal(parsed.teks, sender, logActivity);
        if (lokal) {
          antriLearning(parsed.teks, 'LOKAL', true, lokal);
          try { simpanTokenHemat(600); } catch {}
          return lokal;
        }
      } catch {}

      // Simpan sebagai unknown — openclaw yang track
      rute.push('ai');
      kirimProgres(`⏳ _PicaMan: [${_progresBar(40)}] 40% · memproses AI..._`);
      antriLearning(parsed.teks, 'UNKNOWN', false);
      const stokR = callSkill('stok', 'cek', {});
      const stokAI = stokR.ok ? stokR.data.stok : [];
      const aiResult = await prosesAI({ teks: parsed.teks, stok: stokAI, memory: readMemory() });

      // ── Laporkan hasil AI ke openclaw agar dipelajari ───────────────────────
      if (aiResult.tipe !== 'AI_RESPONS') {
        try {
          callSkill('self-learner', 'laporan_resolusi', {
            pesan  : parsed.teks,
            intent : aiResult.tipe || 'UNKNOWN',
            produk : aiResult.produk || aiResult.nama_produk || '',
          });
          // Reload cache intent-detector agar shortcut baru aktif langsung
          resetBasePatterns();
        } catch {}
      }
      if (aiResult.tipe !== 'AI_RESPONS' && aiResult.produk) {
        Learning.savePattern(parsed.teks, aiResult.tipe, aiResult.produk).catch(() => {});
      }
      if (aiResult.tipe === 'AI_RESPONS') {
        antriLearning(parsed.teks, 'AI_RESPONS', true, aiResult.teks);
        return aiResult.teks;
      }
      const vld = validasiPerintah(aiResult);
      if (!vld.valid) return Formatter.error(vld.error);
      return prosesAIResult(aiResult, sender);
    }
    default: return Formatter.bantuan();
  }
}

async function prosesEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return;

  const senderPhone = envelope.sourceNumber || null;
  const senderUuid = envelope.sourceUuid || null;
  const sender = senderPhone || senderUuid || null;

  const dm = envelope.dataMessage;
  const sm = envelope.syncMessage?.sentMessage;
  const teksRaw = dm?.message || sm?.message || null;
  if (!teksRaw) return; // bukan pesan teks (receipt, typing, dll)

  const dariGrup = dm?.groupInfo?.groupId || sm?.groupInfo?.groupId || null;
  const grupDiizinkan = GROUP_ID && dariGrup === GROUP_ID;
  const diWhitelist = isWhitelisted(senderPhone) || isWhitelisted(senderUuid);

  if (!diWhitelist && !grupDiizinkan) {
    log(`Ditolak dari ${sender || 'unknown'}`);
    alertAdmin(`Pesan dari nomor tidak dikenal: ${sender || 'unknown'}\nIsi: ${teksRaw.slice(0, 50)}`);
    return;
  }

  if (!cekRateLimit(sender || 'group')) {
    log(`Rate limit: ${sender}`);
    // Whitelist selalu dapat info jujur tentang rate limit
    const msg = isWhitelisted(sender)
      ? `⏳ Rate limit tercapai (maks 20 pesan/menit). Coba lagi dalam 1 menit.`
      : 'Sabar dulu ya kak 😅 Coba lagi 1 menit ya!';
    if (sender) kirimPesan(msg, sender);
    return;
  }

  const teks = sanitizeInput(teksRaw);
  if (!teks) {
    // Jangan silent drop untuk whitelist — beritahu pesan kosong/tidak terbaca
    if (isWhitelisted(sender)) kirimPesan('⚠️ Pesan tidak terbaca atau kosong setelah sanitasi.', sender);
    return;
  }

  const suspiciousPat = /ignore (previous|all|above)|you are now|disregard|pretend|system:|kamu adalah bot|aturan utama|daftar keyword|hanya dapat memproses|abaikan aturan|prompt injection|jailbreak|role.*assign|override.*instruct|new.*persona|act as.*(?:admin|root|developer|system)|instruksi baru|reset.*perilaku|lupakan.*aturan|ignore.*rules/i;
  if (suspiciousPat.test(teks)) {
    alertAdmin(`Percobaan prompt injection dari ${sender}: ${teks.slice(0, 100)}`);
    // Whitelist dapat penjelasan jujur, bukan pesan samar
    const msg = isWhitelisted(sender)
      ? `🛡️ Pesan diblokir karena cocok dengan pola prompt injection.\nJika ini bukan serangan, coba kata lain.`
      : 'Maaf kak, itu bukan yang aku bisa bantu 😊';
    if (sender && !grupDiizinkan) kirimPesan(msg, sender);
    return;
  }

  log(`Pesan dari ${sender}: ${teks}`);

  const balas = (msg) => grupDiizinkan && GROUP_ID ? kirimKeGrup(msg) : kirimPesan(msg, sender);

  // ── Remote Shell: hanya owner, hanya personal (bukan grup) ─────────────────
  if (diWhitelist && !dariGrup && /^!/.test(teks)) {
    const perintahRaw = teks.slice(1).trim(); // hilangkan '!'
    if (!perintahRaw) {
      kirimPesan(
        `📟 *Remote Shell*\n` +
        `Kirim perintah dengan prefix *!*\n\n` +
        `Contoh:\n` +
        `• \`!ls -la\`\n` +
        `• \`!cat logs/signal.log | tail -30\`\n` +
        `• \`!ps aux | grep node\`\n` +
        `• \`!df -h\`\n` +
        `• \`!free -m\`\n` +
        `• \`!uptime\``,
        sender
      );
      return;
    }
    logActivity(sender, `SHELL:${perintahRaw.slice(0, 80)}`, 'RUN');
    const hasil = eksekusiShell(perintahRaw);
    if (!hasil.ok) {
      kirimPesan(`❌ *Gagal:* ${hasil.alasan}`, sender);
      return;
    }
    let out = '';
    if (hasil.stdout) out += hasil.stdout;
    if (hasil.stderr) out += `\n[stderr]\n${hasil.stderr}`;
    if (!out.trim()) out = '(tidak ada output)';
    const truncated = out.length > 3500;
    kirimPesan(
      `\`\`\`\n$ ${perintahRaw}\n${out.slice(0, 3500)}${truncated ? '\n...[terpotong]' : ''}\`\`\`\n` +
      `_exit: ${hasil.keluar}_`,
      sender
    );
    return;
  }

  const prevRule = SelfDebug.checkPreventionRules({ teks });
  if (prevRule) log(`🧠 Prevention rule: ${prevRule}`);

  let taskType = 'unknown';
  let bugFixed = false;
  let newRule = null;

  const mulai = Date.now();
  const rute = [];
  const kirimProgres = (msg) => balas(msg).catch(() => {});

  try {
    const konfirmasi = cekKonfirmasi(sender, teks);
    if (konfirmasi) {
      taskType = `CONFIRM:${konfirmasi.tipe}`;
      if (konfirmasi.tipe === 'BATAL') { balas('Oke kak, dibatalin ya! 👍' + _progresFooter(100, Date.now() - mulai)); return; }
      const resp = await eksekusiKonfirmasi(konfirmasi);
      logActivity(sender, taskType, 'OK');
      balas(resp + _progresFooter(100, Date.now() - mulai));
      SelfDebug.logExperience({ taskType, happened: 'Konfirmasi dieksekusi', worked: taskType, failed: '', lesson: '' });
      return;
    }
    const result = await prosesPerintah(teks, sender, { isOwnerPersonal: diWhitelist && !dariGrup, kirimProgres, rute });
    taskType = result?.taskType || 'AI_CHAT';
    const panel = (bugFixed || newRule || prevRule)
      ? Formatter.statusPanel({ inventoryAction: taskType, bugStatus: bugFixed ? 'fixed' : 'none', learned: newRule || prevRule || 'none' })
      : '';
    balas(result + panel + _progresFooter(100, Date.now() - mulai));
    SelfDebug.logExperience({ taskType, happened: `Pesan diproses: ${teks.slice(0, 50)}`, worked: 'response sent', failed: '', lesson: '' });
    bus.kirim('bot:pesan', { sender, teks: teks.slice(0, 80), intent: taskType, role: RBAC.getRole(sender, WHITELIST_SET) });
    // Simpan percakapan ke memori openclaw (fire-and-forget)
    try {
      callSkill('memory-chat', 'simpan', {
        sender,
        pesan  : teks.slice(0, 300),
        respons: (result || '').toString().slice(0, 500),
        intent : taskType,
        dari_grup: !!dariGrup,
      });
    } catch {}
  } catch (e) {
    log(`Error: ${e.message}`);
    const bugId = SelfDebug.logBug({
      errorType: e.constructor.name || 'RuntimeError',
      location: 'prosesEnvelope',
      cause: e.message,
      input: teks.slice(0, 200),
    });
    log(`[ERROR DETECTED] ${bugId} — ${e.message}`);
    // Whitelist dapat detail error asli, bukan pesan generik
    const errMsg = isWhitelisted(sender)
      ? `❌ *Error* [${bugId}]\n${e.message}`
      : 'Aduh, ada yang error nih kak 😅 Coba lagi bentar ya!';
    balas(errMsg);
    bus.kirim('bot:error', { bugId, pesan: e.message, sender });
  }
}

let restartDelay = 5000;

function mulaiJsonRpc() {
  log('Memulai signal-cli jsonRpc...');
  rpcProc = spawn(SIGNAL_CLI, ['-u', PHONE, 'jsonRpc'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  rpcBuffer = '';

  rpcProc.stdout.on('data', (data) => {
    rpcBuffer += data.toString();
    const lines = rpcBuffer.split('\n');
    rpcBuffer = lines.pop();
    lines.forEach(line => { if (line.trim()) rpcOnLine(line.trim()); });
  });

  rpcProc.stderr.on('data', (d) => {
    const m = d.toString().trim();
    if (m) log(`[signal-cli] ${m}`);
  });

  rpcProc.on('close', (code) => {
    log(`signal-cli jsonRpc exit (${code}) — restart ${restartDelay / 1000}s...`);
    rpcProc = null;
    // Batalkan semua pending RPC
    for (const [, pend] of pendingRpc) { clearTimeout(pend.timer); pend.reject(new Error('restart')); }
    pendingRpc.clear();
    // Backoff: max 30 detik
    setTimeout(() => { restartDelay = Math.min(restartDelay * 1.5, 30000); mulaiJsonRpc(); }, restartDelay);
  });

  rpcProc.on('error', (e) => {
    log(`signal-cli error: ${e.message}`);
  });

  // Reset delay setelah berhasil terhubung 10 detik
  setTimeout(() => { restartDelay = 5000; }, 10000);
}

async function main() {
  log('Irma (bot) v5.1 + PicaMan (openclaw) v5.1 — online Rote Barat Laut WITA');
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });

  if (!PHONE) {
    log('SIGNAL_NUMBER tidak diset — mode demo');
    for (const c of ['halo', 'stok mie goreng', 'laporan', 'bantuan']) {
      console.log(`\n> ${c}`);
      console.log(await prosesPerintah(c, 'demo'));
    }
    return;
  }

  const cek = spawnSync(SIGNAL_CLI, ['--version'], { timeout: 5000, encoding: 'utf8' });
  if (cek.error) { log('signal-cli tidak ditemukan.'); process.exit(1); }
  log(`signal-cli: ${(cek.stdout + cek.stderr).trim()}`);

  CronHandlers.init(kirimKeGrup, kirimPesan);
  initCron(CronHandlers);

  // ── Koordinasi openclaw ↔ bot via event bus ─────────────────────────────
  bus.start();

  bus.on('stok:kritis', ({ produk, stok, kritis }) => {
    const msg = `⚠️ *Stok Kritis*\n${produk} tinggal ${stok} (batas kritis: ${kritis})`;
    kirimPesan(msg);
  });

  bus.on('stok:habis', ({ produk }) => {
    kirimPesan(`🚨 *Stok Habis* — ${produk} sudah kosong!`);
  });

  bus.on('harga:naik', ({ produk, lama, baru }) => {
    const selisih = Math.round(((baru - lama) / lama) * 100);
    kirimPesan(`📈 *Harga Naik*\n${produk}: Rp${lama.toLocaleString('id-ID')} → Rp${baru.toLocaleString('id-ID')} (+${selisih}%)`);
  });

  bus.on('token:threshold', ({ total, harian, batas }) => {
    kirimPesan(`🔔 *Token AI* hampir mencapai batas harian\nHari ini: ${harian.toLocaleString('id-ID')} / ${batas.toLocaleString('id-ID')} token`);
  });

  bus.on('belajar:selesai', ({ rate, pelajaran, token_hemat }) => {
    const pl = Array.isArray(pelajaran) && pelajaran.length ? '\n• ' + pelajaran.join('\n• ') : '';
    kirimPesan(`🧠 *Sesi Belajar Selesai*\nSukses: ${rate}% | Hemat: ${token_hemat} token${pl}`);
  });

  bus.on('user:ditambah', ({ phone, nama, role }) => {
    kirimPesan(`👤 *User Baru* — ${nama} (${role})\nNomor: ${phone}`);
  });

  bus.on('bot:update', ({ shortcuts, aliases, hints }) => {
    log(`[auto-update] shortcuts:${shortcuts} aliases:${aliases} hints:${hints}`);
  });

  // PicaMan kirim saran real-time ke grup Kios Cerdas HQ
  bus.on('picaman:saran', ({ pesan, id }) => {
    if (!pesan) return;
    kirimKeGrup(pesan).then(() => {
      try { callSkill('saran', 'tandai_terkirim', { id }); } catch {}
    }).catch(() => {});
  });

  // Wildcard: log semua event openclaw ke console
  bus.on('*', (nama) => {
    log(`[event-bus] ${nama}`);
  });

  // Cek jika ada pending AI batch yang tidak sempat diproses tadi malam
  CronHandlers.cekPendingOnStartup();

  log(`Whitelist: ${WHITELIST || '(kosong)'} | Grup: ${GROUP_ID || '(belum diset)'}`);
  mulaiJsonRpc();
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
