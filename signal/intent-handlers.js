'use strict';

const { callSkill } = require('./bridge');
const Formatter = require('./response-formatter');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');
const SelfDebug = require('../skills/self-debug');
const { loadTokenData } = require('./ai-handler');
const RBAC = require('../scripts/rbac');
const Kasir = require('../skills/kasir');

// ─── Mass operation item parser ───────────────────────────────────────────────
function parseMassItems(teks) {
  const items = [];
  const lines = teks.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Lewati baris trigger
    if (/^(?:restock|jual|tambah|edit|mass|bulk|batch|input|import|daftar|list|checkout|transaksi|belanja)\b/i.test(trimmed)) continue;

    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      if (parts[0]) {
        items.push({
          produk: parts[0],
          qty: Number((parts[1] || '').replace(/[^\d]/g, '')) || 0,
          harga: parts[2] ? Number(parts[2].replace(/[^\d]/g, '')) : 0,
          supplier: parts[3] || '',
          kategori: parts[4] || '',
          satuan: parts[5] || '',
          harga_jual: parts[2] && parts[3] ? Number(parts[3].replace(/[^\d]/g, '')) : 0,
        });
      }
    } else {
      const m = trimmed.match(/^(.+?)\s+(\d+)(?:\s+(\d+))?$/);
      if (m) {
        items.push({ produk: m[1].trim(), qty: Number(m[2]), harga: m[3] ? Number(m[3]) : 0, supplier: '', kategori: '', satuan: '', harga_jual: 0 });
      }
    }
  }

  // Fallback: koma di satu baris (setelah tanda ':')
  if (items.length === 0) {
    const setelahTitikDua = teks.replace(/^[^:\n]+[:\n]/i, '').trim();
    const parts = setelahTitikDua.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^(.+?)\s+(\d+)(?:\s+(\d+))?$/);
      if (m) items.push({ produk: m[1].trim(), qty: Number(m[2]), harga: m[3] ? Number(m[3]) : 0, supplier: '', kategori: '', satuan: '', harga_jual: 0 });
    }
  }

  return items.filter(i => i.produk && (i.qty > 0 || i.harga > 0));
}

async function prosesIntentBaru(parsed, sender, logActivity, ctx = {}) {
  switch (parsed.tipe) {
    case 'CUACA': {
      const data = await Cuaca.getCuacaLengkap().catch(() => null);
      return data ? Cuaca.formatCuacaRingkas(data) : 'Koneksi BMKG gagal kak, coba lagi sebentar 🙏';
    }
    case 'HARGA_PASAR': {
      // Owner via personal → pipeline lengkap: cari + verifikasi URL + pelajari + simpan
      if (ctx.isOwnerPersonal && parsed.produk) {
        const riset = await MarketIntel.risetHargaIndonesia(parsed.produk);
        const simpan = MarketIntel.simpanHasilRiset(riset);
        return MarketIntel.formatHasilRisetIndonesia(riset, simpan);
      }
      if (parsed.produk) {
        const base = MarketIntel.loadBase();
        const stokR = callSkill('stok', 'cari', { produk: parsed.produk });
        const item = stokR.ok ? stokR.data.item : null;
        if (item) {
          const a = MarketIntel.analyzeHarga(item, base.harga_referensi || {});
          if (a) return MarketIntel.formatHargaSatuProduk(a);
          return `Belum ada data harga pasar untuk *${item.nama}* kak.\nKetik: *update harga pasar ${item.nama} [harga]*`;
        }
      }
      const a = await MarketIntel.risetHargaTop(10);
      return MarketIntel.formatMarketIntel(a, 'harian');
    }
    case 'SUMBER_HARGA': {
      return MarketIntel.formatSumberMonitoring();
    }
    case 'UPDATE_HARGA_PASAR': {
      const r = await MarketIntel.updateHargaMarket(parsed.produk, parsed.harga);
      return r.ok ? Formatter.updateHargaPasarOk(parsed.produk, parsed.harga) : Formatter.error('Gagal update');
    }
    case 'OPNAME': {
      const r = callSkill('stok', 'set_stok', { produk: parsed.produk, stok_baru: parsed.stokBaru });
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, `OPNAME:${parsed.produk}`, 'OK');
      return Formatter.opnameOk(r.data.item.nama, r.data.stok_lama, r.data.stok_baru, r.data.item.satuan);
    }
    case 'PRODUK_BARU': {
      const r = callSkill('stok', 'cek', {});
      if (!r.ok) return Formatter.error(r.error);
      const batas = parsed.periode === 'minggu'
        ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const items = r.data.stok.filter(s => (s.last_update || '') >= batas);
      return Formatter.produkBaru(items, parsed.periode);
    }
    case 'MUTASI': {
      const r = callSkill('laporan', 'riwayat', { periode: 'bulan' });
      if (!r.ok) return Formatter.error(r.error);
      const nama = parsed.produk.toLowerCase();
      const txList = r.data.transaksi.filter(t => t.nama_produk.toLowerCase().includes(nama));
      return Formatter.mutasiProduk(parsed.produk, txList);
    }
    case 'KELOLA_USER': {
      const raw = (parsed.rawTeks || '').toLowerCase().trim();
      const div = '━━━━━━━━━━━━━━━━━━━━━━━';

      // daftar / lihat user
      if (/^(?:daftar|lihat|siapa)/.test(raw)) {
        const users = RBAC.daftarUser();
        if (!users.length) return `👥 *Daftar User*\n${div}\nBelum ada kasir/staff terdaftar.\n\nTambahkan dengan:\n*tambah kasir [nama] [nomor]*`;
        const baris = users.map(u => `• ${u.nama} (${u.role}) — ${u.phone}`).join('\n');
        return `👥 *Daftar User Aktif*\n${div}\n${baris}`;
      }

      // hapus user
      const hapusMatch = raw.match(/^hapus\s+(?:kasir|user|staff)\s+(\S+)/);
      if (hapusMatch) {
        const r = RBAC.hapusUser(hapusMatch[1]);
        return r.ok ? `✅ Akses *${r.nama}* sudah dinonaktifkan.` : Formatter.error(r.error);
      }

      // tambah user: tambah kasir [nama] [nomor] atau tambah kasir [nomor]
      const tambahMatch = raw.match(/^tambah\s+(kasir|staff|viewer)\s+(.+)/);
      if (tambahMatch) {
        const roleInput = tambahMatch[1] === 'staff' ? 'kasir' : tambahMatch[1];
        const sisa = tambahMatch[2].trim();
        // Pisahkan nama dan nomor — nomor diawali +, 08, atau 62
        const nomorMatch = sisa.match(/(\+?\d[\d\s\-]{6,})/);
        const nomor = nomorMatch ? nomorMatch[1].trim() : null;
        const nama  = nomor ? sisa.replace(nomorMatch[0], '').trim() || nomor : sisa;
        if (!nomor) return `Format: *tambah kasir [nama] [nomor HP]*\nContoh: tambah kasir Budi +628123456789`;
        const r = RBAC.tambahUser(nomor, nama, roleInput);
        if (!r.ok) return Formatter.error(r.error);
        return `✅ *${r.user.nama}* ditambahkan sebagai *${r.user.role}*.\nNomor: ${r.user.phone}\n\nIzin ${r.user.role}:\n` +
          (roleInput === 'kasir'
            ? '• Jual barang\n• Lihat stok & laporan\n• Buka/tutup shift'
            : '• Lihat stok & laporan saja');
      }

      return `👥 *Kelola Akses*\n${div}\n` +
        `*tambah kasir [nama] [nomor]* — beri akses kasir\n` +
        `*tambah viewer [nama] [nomor]* — akses baca saja\n` +
        `*daftar kasir* — lihat semua user aktif\n` +
        `*hapus kasir [nomor]* — cabut akses\n\n` +
        `Izin per role:\n` +
        `• *owner* (kamu) — semua operasi\n` +
        `• *kasir* — jual, stok, laporan, shift\n` +
        `• *viewer* — stok & laporan saja`;
    }
    case 'TOKEN_USAGE': {
      const d    = loadTokenData();
      const div  = '━━━━━━━━━━━━━━━━━━━━━━━';
      const now  = new Date(Date.now() + 8 * 3600000);
      const hari = now.toISOString().slice(0, 10);
      const bln  = now.toISOString().slice(0, 7);
      const hd   = (d.daily  || {})[hari]  || { prompt: 0, completion: 0, total: 0, calls: 0 };
      const bd   = (d.monthly || {})[bln]  || { prompt: 0, completion: 0, total: 0, calls: 0 };
      const avgPerCall = d.calls ? Math.round(d.total_tokens / d.calls) : 0;
      const provInfo = [
        d.groq_calls   ? `Groq: ${d.groq_calls}x`   : '',
        d.gemini_calls ? `Gemini: ${d.gemini_calls}x` : '',
      ].filter(Boolean).join(' | ') || '-';

      return `🤖 *Monitor Token AI*\n${div}\n` +
        `📅 Hari ini (${hari}):\n` +
        `  Prompt:     ${hd.prompt.toLocaleString('id-ID')}\n` +
        `  Completion: ${hd.completion.toLocaleString('id-ID')}\n` +
        `  Total:      ${hd.total.toLocaleString('id-ID')} token\n` +
        `  Panggilan:  ${hd.calls}x\n` +
        `${div}\n` +
        `📆 Bulan ini (${bln}):\n` +
        `  Total: ${bd.total.toLocaleString('id-ID')} token | ${bd.calls}x panggilan\n` +
        `${div}\n` +
        `📊 Semua waktu:\n` +
        `  Total:    ${(d.total_tokens || 0).toLocaleString('id-ID')} token\n` +
        `  Panggilan: ${d.calls || 0}x\n` +
        `  Rata-rata: ${avgPerCall} token/panggilan\n` +
        `  Provider: ${provInfo}\n` +
        `  Terakhir: ${d.last_call || '-'} (${d.last_provider || '-'})`;
    }
    case 'STATUS_BELAJAR': {
      const r = callSkill('self-learner', 'status', {});
      if (!r.ok) return Formatter.error(r.error);
      const d = r.data;
      const div = '━━━━━━━━━━━━━━━━━━━━━━━';
      const centang = d.bisa_belajar_skrg ? '🟢 Bisa belajar sekarang' : '⏳ Di luar jam belajar';
      const ai = d.ai_batch_pending ? '⚠️ Ada batch AI pending' : '✅ Tidak ada';
      return `🧠 *${d.nama || 'PicaMan'} — Status Belajar*\n${div}\n` +
        `📅 Sesi terakhir: ${d.last_session}\n` +
        `🔢 Total sesi: ${d.total_sesi}\n` +
        `📬 Antrian skrg: ${d.antrian_skrg} pesan\n` +
        `✅ Rata-rata sukses: ${d.avg_sukses_7sesi}\n` +
        `📋 Rules aktif: ${d.rules_aktif}\n` +
        `⏰ Jam belajar: ${d.jam_belajar}\n` +
        `${centang}\n` +
        `💡 Token hemat total: ${d.token_hemat_total}\n` +
        `🔄 Update diterapkan: ${d.total_updates || 0}\n` +
        `🤖 Batch AI: ${ai}`;
    }
    case 'LAPORAN_BELAJAR': {
      const [learned, unknowns, shortcuts, laporanR] = await Promise.all([
        Learning.getLearnedToday().catch(() => []),
        Learning.getUnknowns().catch(() => []),
        Learning.getAllShortcuts().catch(() => ({})),
        Promise.resolve(callSkill('laporan', 'ringkas', {})),
      ]);
      const lapData = laporanR.ok ? laporanR.data : {};
      return Formatter.laporanBelajar({ learned, unknowns, shortcuts, ...lapData, top: lapData.top3?.[0] });
    }
    case 'HARGA_FB': {
      const produk = parsed.produk;
      if (!produk) return Formatter.error('Nama produk belum disebutkan kak');
      const [fbHasil, stokR] = await Promise.all([
        MarketIntel.risetHargaFacebook(produk),
        Promise.resolve(callSkill('stok', 'cari', { produk })),
      ]);
      const item = stokR.ok ? stokR.data.item : null;
      const base = MarketIntel.loadBase();
      const refs = base.harga_referensi || {};
      const ref = refs[produk.toLowerCase()] || null;
      return MarketIntel.formatPerbandinganFb(
        produk, fbHasil,
        item ? Number(item.harga_jual) : null,
        ref
      );
    }
    case 'TAMBAH_SUMBER': {
      const { url, nama } = parsed;
      const r = MarketIntel.tambahSumberUrl(nama, url);
      if (!r.ok) return Formatter.error(r.error);
      return `✅ Sumber baru disimpan\n*${r.nama}*\n${r.url}\n\nAkan digunakan saat pencarian harga berikutnya kak.`;
    }
    case 'DAFTAR_SKILL': {
      const r = callSkill('harga', 'daftar_skill', {});
      if (!r.ok) return Formatter.error(r.error);
      const div = '━━━━━━━━━━━━━━━━━━━━━━━';
      let msg = `🧰 *Skill Perkiraan Harga Pasar*\n${div}\n`;
      for (const s of r.data.skills_harga) {
        msg += `\n📦 *${s.skill}* (${s.tipe})\n`;
        msg += `   Aksi: ${s.aksi.join(', ')}\n`;
      }
      msg += `\n${div}\n📡 *Perintah Signal:*\n`;
      for (const [intent, desk] of Object.entries(r.data.intent_signal)) {
        msg += `• _${intent}_: ${desk}\n`;
      }
      return msg;
    }
    case 'ESTIMASI_HARGA': {
      const r = callSkill('harga', 'estimasi', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      const d = r.data;
      const div = '━━━━━━━━━━━━━━━━━━━━━━━';
      const rp = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;
      let msg = `📊 *Estimasi Harga: ${d.produk}*\n${div}\n`;
      msg += `Harga beli:   ${rp(d.harga_beli)}\n`;
      msg += `Harga kini:   ${rp(d.harga_jual_kini)}\n\n`;
      msg += `*Opsi margin:*\n`;
      msg += `  10%: ${rp(d.estimasi.margin_10pct)}\n`;
      msg += `  15%: ${rp(d.estimasi.margin_15pct)}\n`;
      msg += `  20%: ${rp(d.estimasi.margin_20pct)}\n`;
      msg += `  25%: ${rp(d.estimasi.margin_25pct)}\n\n`;
      msg += `✅ *Saran: ${rp(d.saran_harga)}*\n`;
      msg += `_${d.saran_alasan}_`;
      if (d.referensi_pasar) {
        msg += `\n\n📌 Referensi pasar: ${rp(d.referensi_pasar.min)}–${rp(d.referensi_pasar.max)}`;
      }
      return msg;
    }
    case 'PREDIKSI_HARGA': {
      const r = callSkill('harga', 'prediksi', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      const d = r.data;
      const rp = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;
      const ikonTren = d.tren === 'naik' ? '📈' : d.tren === 'turun' ? '📉' : '➡️';
      if (d.tren === 'tidak_cukup_data') return `⚠️ ${d.pesan}`;
      let msg = `${ikonTren} *Prediksi Harga: ${d.produk}*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Tren:          ${d.tren.toUpperCase()}\n`;
      msg += `Rata perubahan: ${d.avg_perubahan_pct > 0 ? '+' : ''}${d.avg_perubahan_pct}% per periode\n`;
      msg += `Harga beli kini: ${rp(d.harga_kini)}\n`;
      msg += `Proyeksi 7 hari: ${rp(d.proyeksi_7hari)}\n`;
      msg += `_Dari ${d.jumlah_riwayat} data riwayat_`;
      return msg;
    }
    case 'SHORTCUT': {
      if (parsed.nama) {
        const sc = await Learning.getShortcut(parsed.nama).catch(() => null);
        if (sc) return `⚡ Shortcut *${parsed.nama}*: ${sc.join(', ')}`;
      }
      const all = await Learning.getAllShortcuts().catch(() => ({}));
      return Formatter.shortcutList(all);
    }
    case 'PERFORMA': {
      const perf = SelfDebug.getPerformanceReview();
      return Formatter.performanceReview(perf);
    }
    case 'BUKA_SHIFT': {
      const r = Kasir.bukaShift(sender, parsed.saldoAwal);
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, 'BUKA_SHIFT', r.data.shift_id);
      return Formatter.bukaShiftOk(r.data);
    }
    case 'TUTUP_SHIFT': {
      const r = Kasir.tutupShift(parsed.saldoAkhir);
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, 'TUTUP_SHIFT', r.data.shift_id);
      return Formatter.tutupShiftOk(r.data, r.omzet, r.jumlahTx);
    }
    case 'STATUS_SHIFT': {
      const info = Kasir.getShiftStatus();
      return Formatter.statusShift(info);
    }

    // ── MASS OPERATIONS ──────────────────────────────────────────────────────
    case 'AUTO_RESTOCK': {
      const r = callSkill('stok', 'stok_menipis', {});
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.autoRestockPreview(r.data.menipis);
    }
    case 'RESTOCK_MASSAL': {
      const items = parseMassItems(parsed.rawTeks);
      if (!items.length) return 'Kak, format restock massal:\n*restock massal:*\nGula Pasir | 50 | 15000\nBeras | 100 | 68000\n\nAtau: *restock massal: gula 50, beras 100*';
      const results = items.map(item => {
        try {
          const r = callSkill('stok', 'tambah', { produk: item.produk, qty: item.qty, harga: item.harga, supplier: item.supplier, auto_create: false });
          return { produk: item.produk, qty: item.qty, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error };
        } catch (e) {
          return { produk: item.produk, qty: item.qty, ok: false, error: e.message };
        }
      });
      if (logActivity) logActivity(sender, `RESTOCK_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      return Formatter.restockMassalOk(results);
    }
    case 'JUAL_MASSAL': {
      const items = parseMassItems(parsed.rawTeks);
      if (!items.length) return 'Kak, format jual massal:\n*jual banyak:*\nGula Pasir | 2\nBeras | 1\nMinyak | 3\n\nAtau: *jual banyak: gula 2, beras 1*';
      const results = [];
      for (const item of items) {
        try {
          const r = callSkill('stok', 'jual', { produk: item.produk, qty: item.qty, metode: 'tunai' });
          results.push({ produk: item.produk, qty: item.qty, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error });
        } catch (e) {
          results.push({ produk: item.produk, qty: item.qty, ok: false, error: e.message });
        }
      }
      if (logActivity) logActivity(sender, `JUAL_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      return Formatter.jualMassalOk(results);
    }
    case 'TAMBAH_PRODUK_MASSAL': {
      const items = parseMassItems(parsed.rawTeks);
      if (!items.length) return 'Kak, format tambah produk massal:\n*tambah produk massal:*\nGula Pasir | Sembako | kg | 18000 | 15000 | 100\nBeras | Sembako | kg | 75000 | 68000 | 50\n\n_(format: nama | kategori | satuan | harga jual | harga beli | stok)_';
      const results = items.map(item => {
        // Format: produk=nama, harga=harga_beli, qty=stok, harga_jual dari field ke-4
        const params = {
          nama: item.produk,
          kategori: item.kategori || 'umum',
          satuan: item.satuan || 'pcs',
          harga_jual: item.harga_jual || item.qty,   // qty dipakai sbg harga_jual jika pipe format
          harga_beli: item.harga || 0,
          stok: item.supplier ? Number(item.supplier) : 0,
        };
        // Bila format: nama | kategori | satuan | harga_jual | harga_beli | stok
        if (item.kategori && item.satuan) {
          params.kategori = item.kategori;
          params.satuan = item.satuan;
        }
        try {
          const r = callSkill('stok', 'tambah_produk', params);
          return { produk: item.produk, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error };
        } catch (e) {
          return { produk: item.produk, ok: false, error: e.message };
        }
      });
      if (logActivity) logActivity(sender, `TAMBAH_PRODUK_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      return Formatter.tambahProdukMassalOk(results);
    }

    // ── BEST SELLER ─────────────────────────────────────────────────────────
    case 'TERLARIS': {
      const r = callSkill('laporan', 'terlaris', { periode: parsed.periode, top: 10 });
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.terlaris(r.data.produk, r.data.periode, r.data.total_tx);
    }

    // ── PRICE HISTORY ────────────────────────────────────────────────────────
    case 'RIWAYAT_HARGA': {
      const r = callSkill('laporan', 'riwayat_harga', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.riwayatHarga(r.data.riwayat, parsed.produk);
    }

    // ── SUPPLIER ─────────────────────────────────────────────────────────────
    case 'TAMBAH_SUPPLIER': {
      const r = callSkill('supplier', 'tambah', { nama: parsed.nama });
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, `TAMBAH_SUPPLIER:${parsed.nama}`, 'OK');
      return Formatter.tambahSupplierOk(r.data.supplier);
    }
    case 'DAFTAR_SUPPLIER': {
      const r = callSkill('supplier', 'daftar', {});
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.daftarSupplier(r.data.suppliers);
    }
    case 'CARI_SUPPLIER': {
      const r = callSkill('supplier', 'cari', { nama: parsed.nama });
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.detailSupplier(r.data.supplier, r.data.produk_supplied);
    }

    // ── PROMO ────────────────────────────────────────────────────────────────
    case 'BUAT_PROMO': {
      const r = callSkill('promo', 'buat', {
        produk: parsed.produk, tipe: parsed.tipeDiskon, nilai: parsed.nilai,
      });
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, `BUAT_PROMO:${parsed.produk}`, 'OK');
      return Formatter.buatPromoOk(r.data.promo, r.data.produk);
    }
    case 'LIHAT_PROMO': {
      const r = callSkill('promo', 'daftar', { aktif_only: true });
      if (!r.ok) return Formatter.error(r.error);
      return Formatter.daftarPromo(r.data.promos);
    }
    case 'HAPUS_PROMO': {
      const r = callSkill('promo', 'hapus', { id: parsed.id });
      if (!r.ok) return Formatter.error(r.error);
      if (logActivity) logActivity(sender, `HAPUS_PROMO:${parsed.id}`, 'OK');
      return `✅ Promo *${r.data.promo.id}* untuk *${r.data.promo.produk}* sudah dinonaktifkan kak.`;
    }

    default: return null;
  }
}

module.exports = { prosesIntentBaru };
