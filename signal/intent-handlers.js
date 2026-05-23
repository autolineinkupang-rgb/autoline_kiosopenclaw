'use strict';

const { callSkill, invalidateCache } = require('./bridge');
const Formatter = require('./response-formatter');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');
const SelfDebug = require('../skills/self-debug');
const { loadTokenData, daftarModel } = require('./ai-handler');
const RBAC = require('../scripts/rbac');
const Kasir = require('../skills/kasir');
const bus = require('../scripts/event-bus');

// ─── Mass operation item parsers ──────────────────────────────────────────────

const _RE_TRIGGER = /^(?:restock|jual|tambah|edit|mass|bulk|batch|input|import|daftar|list|checkout|transaksi|belanja)\b/i;
const _RE_METODE  = /^(tunai|qris|transfer)$/i;

// Parser untuk RESTOCK_MASSAL: nama | qty | harga_beli | supplier
// dan JUAL_MASSAL: nama | qty | metode?
function parseMassItems(teks) {
  const items = [];
  const lines = teks.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || _RE_TRIGGER.test(trimmed)) continue;

    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      if (!parts[0]) continue;
      const qty = Number((parts[1] || '').replace(/[^\d]/g, '')) || 0;
      // parts[2] bisa: harga_beli (angka, RESTOCK) atau metode (teks, JUAL)
      const p2 = parts[2] || '';
      const p2IsMetode = _RE_METODE.test(p2);
      const harga = p2IsMetode ? 0 : (p2 ? Number(p2.replace(/[^\d]/g, '')) : 0);
      const metode = p2IsMetode ? p2.toLowerCase() : (_RE_METODE.test(parts[3] || '') ? (parts[3] || '').toLowerCase() : 'tunai');
      const supplier = p2IsMetode ? '' : (parts[3] || '');
      items.push({ produk: parts[0], qty, harga, supplier, metode });
    } else {
      // format: nama qty [harga]  —  nama selalu di kiri, angka terakhir = qty
      const m = trimmed.match(/^(.+?)\s+(\d+)(?:\s+(\d+))?$/);
      if (m) {
        items.push({ produk: m[1].trim(), qty: Number(m[2]), harga: m[3] ? Number(m[3]) : 0, supplier: '', metode: 'tunai' });
      }
    }
  }

  // Fallback: koma satu baris "jual massal: gula 2, beras 1"
  if (items.length === 0) {
    const setelahSep = teks.replace(/^[^:\n]+[:\n]/i, '').trim();
    for (const part of setelahSep.split(',').map(p => p.trim()).filter(Boolean)) {
      const m = part.match(/^(.+?)\s+(\d+)(?:\s+(\d+))?$/);
      if (m) items.push({ produk: m[1].trim(), qty: Number(m[2]), harga: m[3] ? Number(m[3]) : 0, supplier: '', metode: 'tunai' });
    }
  }

  return items.filter(i => i.produk && i.qty > 0);
}

// Parser khusus TAMBAH_PRODUK_MASSAL: nama | kategori | satuan | harga_jual | harga_beli | stok
function parseMassItemsProduk(teks) {
  const items = [];
  const lines = teks.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || _RE_TRIGGER.test(trimmed)) continue;

    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      if (!parts[0]) continue;
      items.push({
        nama     : parts[0],
        kategori : parts[1] || 'umum',
        satuan   : parts[2] || 'pcs',
        harga_jual: parts[3] ? Number(parts[3].replace(/[^\d]/g, '')) : 0,
        harga_beli: parts[4] ? Number(parts[4].replace(/[^\d]/g, '')) : 0,
        stok     : parts[5] ? Number(parts[5].replace(/[^\d]/g, '')) : 0,
      });
    } else {
      // format sederhana: nama harga_jual harga_beli (stok opsional)
      const m = trimmed.match(/^(.+?)\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+))?$/);
      if (m) {
        items.push({
          nama: m[1].trim(), kategori: 'umum', satuan: 'pcs',
          harga_jual: Number(m[2]), harga_beli: m[3] ? Number(m[3]) : 0,
          stok: m[4] ? Number(m[4]) : 0,
        });
      }
    }
  }

  // Fallback koma: "tambah produk massal: Gula|Sembako|kg|18000|15000|100, ..."
  if (items.length === 0) {
    const setelahSep = teks.replace(/^[^:\n]+[:\n]/i, '').trim();
    for (const part of setelahSep.split(',').map(p => p.trim()).filter(Boolean)) {
      if (part.includes('|')) {
        const parts = part.split('|').map(p => p.trim());
        if (parts[0]) items.push({
          nama: parts[0], kategori: parts[1] || 'umum', satuan: parts[2] || 'pcs',
          harga_jual: parts[3] ? Number(parts[3].replace(/[^\d]/g, '')) : 0,
          harga_beli: parts[4] ? Number(parts[4].replace(/[^\d]/g, '')) : 0,
          stok: parts[5] ? Number(parts[5].replace(/[^\d]/g, '')) : 0,
        });
      }
    }
  }

  return items.filter(i => i.nama && i.harga_jual > 0);
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
      const hapusMatch = raw.match(/^hapus(?:kan)?\s+(?:kasir|user|staff|akses)\s+(\S+)/);
      if (hapusMatch) {
        // Ambil phone asli sebelum hapus agar bisa dikirim event
        const usersMap = RBAC.loadUsers();
        const normKey = hapusMatch[1].replace(/[\s\-()]/g, '');
        const userLama = usersMap[normKey];
        const r = RBAC.hapusUser(hapusMatch[1]);
        if (!r.ok) return Formatter.error(r.error);
        bus.kirim('user:akses_dicabut', { phone: userLama?.phone || hapusMatch[1], nama: r.nama });
        return `✅ Akses *${r.nama}* sudah dinonaktifkan.`;
      }

      // tambah user: tambah kasir [nama] [nomor] atau tambah kasir [nomor]
      const tambahMatch = raw.match(/^tambah(?:kan)?\s+(kasir|staff|viewer)\s+(.+)/);
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
        bus.kirim('user:akses_diberikan', { phone: r.user.phone, nama: r.user.nama, role: r.user.role, kembali: r.kembali, mantan: r.mantan });

        if (r.kembali && r.mantan) {
          const m = r.mantan;
          return `🎉 *${r.user.nama}* kembali bergabung sebagai *${r.user.role}*!\n` +
            `Nomor: ${r.user.phone}\n` +
            `Bergabung ke-${r.user.bergabung_ke || 2} kali\n` +
            `Terakhir aktif: ${m.ditambahkan} s/d ${m.dinonaktifkan}\n\n` +
            `📨 Pesan sambutan sudah dikirim ke nomor mereka.`;
        }

        return `✅ *${r.user.nama}* ditambahkan sebagai *${r.user.role}*.\nNomor: ${r.user.phone}\n\nIzin ${r.user.role}:\n` +
          (roleInput === 'kasir'
            ? '• Jual barang\n• Lihat stok & laporan\n• Buka/tutup shift'
            : '• Lihat stok & laporan saja') +
          `\n\n📨 Undangan ke grup Kios Cerdas HQ sudah dikirim ke nomor mereka.`;
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
      const hd   = (d.daily  || {})[hari]  || { prompt: 0, completion: 0, total: 0, calls: 0, hemat: 0 };
      const bd   = (d.monthly || {})[bln]  || { prompt: 0, completion: 0, total: 0, calls: 0 };
      const avgPerCall = d.calls ? Math.round(d.total_tokens / d.calls) : 0;
      const totalEst   = (hd.hemat || 0) + (hd.total || 0);
      const efisiensi  = totalEst > 0 ? Math.round(((hd.hemat || 0) / totalEst) * 100) : 0;

      // Info model dari registry
      const models = daftarModel();
      const peranLabel = { primary: 'Utama   ', fallback: 'Fallback', batch: 'Batch   ' };
      const modelInfo = models.map(m => {
        const status = m.key_ok ? '✅' : '❌ (API key tidak ada)';
        const label  = peranLabel[m.peran] || m.peran;
        return `  ${label}: ${m.nama} v${m.versi} — ${status}`;
      }).join('\n');

      return `🤖 *Monitor Token & Model AI*\n${div}\n` +
        `🧩 *Model Terdaftar:*\n${modelInfo}\n` +
        `${div}\n` +
        `📅 Hari ini (${hari}):\n` +
        `  Prompt:     ${hd.prompt.toLocaleString('id-ID')}\n` +
        `  Completion: ${hd.completion.toLocaleString('id-ID')}\n` +
        `  Terpakai:   ${hd.total.toLocaleString('id-ID')} token (${hd.calls}x)\n` +
        `  Hemat:      ${(hd.hemat || 0).toLocaleString('id-ID')} token\n` +
        `  Efisiensi:  ${efisiensi}%\n` +
        `${div}\n` +
        `📆 Bulan ini: ${bd.total.toLocaleString('id-ID')} token | ${bd.calls}x panggilan\n` +
        `📊 Total:     ${(d.total_tokens || 0).toLocaleString('id-ID')} token | rata-rata ${avgPerCall}/panggilan\n` +
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
      if (!items.length) return 'Kak, format restock massal:\n*restock massal:*\nGula Pasir | 50 | 15000\nBeras | 100 | 68000\n\nAtau: *restock massal: gula 50, beras 100*\n_(nama | qty | harga beli | supplier opsional)_';
      const results = items.map(item => {
        try {
          const r = callSkill('stok', 'tambah', { produk: item.produk, qty: item.qty, harga: item.harga, supplier: item.supplier, auto_create: true });
          return { produk: item.produk, qty: item.qty, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error };
        } catch (e) {
          return { produk: item.produk, qty: item.qty, ok: false, error: e.message };
        }
      });
      if (logActivity) logActivity(sender, `RESTOCK_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      if (results.some(r => r.ok)) { invalidateCache('stok'); invalidateCache('laporan'); }
      return Formatter.restockMassalOk(results);
    }
    case 'JUAL_MASSAL': {
      const items = parseMassItems(parsed.rawTeks);
      if (!items.length) return 'Kak, format jual massal:\n*jual banyak:*\nGula Pasir | 2\nBeras | 1 | qris\nMinyak | 3\n\nAtau: *jual banyak: gula 2, beras 1*\n_(nama | qty | metode opsional: tunai/qris/transfer)_';
      const results = [];
      for (const item of items) {
        try {
          const r = callSkill('stok', 'jual', { produk: item.produk, qty: item.qty, metode: item.metode || 'tunai' });
          results.push({ produk: item.produk, qty: item.qty, metode: item.metode || 'tunai', ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error });
        } catch (e) {
          results.push({ produk: item.produk, qty: item.qty, metode: 'tunai', ok: false, error: e.message });
        }
      }
      if (logActivity) logActivity(sender, `JUAL_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      if (results.some(r => r.ok)) { invalidateCache('stok'); invalidateCache('laporan'); }
      return Formatter.jualMassalOk(results);
    }
    case 'TAMBAH_PRODUK_MASSAL': {
      const items = parseMassItemsProduk(parsed.rawTeks);
      if (!items.length) return 'Kak, format tambah produk massal:\n*tambah produk massal:*\nGula Pasir | Sembako | kg | 18000 | 15000 | 100\nBeras | Sembako | kg | 75000 | 68000 | 50\n\n_(format: nama | kategori | satuan | harga jual | harga beli | stok)_';
      const results = items.map(item => {
        try {
          const r = callSkill('stok', 'tambah_produk', {
            nama      : item.nama,
            kategori  : item.kategori || 'umum',
            satuan    : item.satuan   || 'pcs',
            harga_jual: item.harga_jual,
            harga_beli: item.harga_beli,
            stok      : item.stok,
          });
          return { produk: item.nama, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error };
        } catch (e) {
          return { produk: item.nama, ok: false, error: e.message };
        }
      });
      if (logActivity) logActivity(sender, `TAMBAH_PRODUK_MASSAL:${results.length}item`, `OK:${results.filter(r => r.ok).length}`);
      if (results.some(r => r.ok)) { invalidateCache('stok'); invalidateCache('laporan'); }
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
    case 'HARGA_SUPPLIER': {
      const r = callSkill('supplier', 'banding_harga', { produk: parsed.produk });
      if (!r.ok) return Formatter.error(r.error);

      let picamanInfo = '';
      if (parsed.enrich || ctx.picamanRequest) {
        try {
          const riset = await MarketIntel.risetHargaIndonesia(parsed.produk);
          const simpan = MarketIntel.simpanHasilRiset(riset);
          picamanInfo = `🤖 *Konteks Picaman (internet):*\n${MarketIntel.formatHasilRisetIndonesia(riset, simpan)}`;
        } catch (e) {
          picamanInfo = `🤖 *Konteks Picaman:* riset internet belum tersedia (${e.message}).`;
        }
      }

      return Formatter.bandingHargaSupplier(r.data, picamanInfo);
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

    // ── BAHASA SKILL ──────────────────────────────────────────────────────────
    case 'STATUS_BAHASA': {
      const r = callSkill('bahasa', 'status', {});
      if (!r.ok) return Formatter.error(r.error);
      const d = r.data;
      const div = '━━━━━━━━━━━━━━━━━━━━━━━';
      let msg = `🧠 *Skill Penerjemah & Penalaran Bahasa*\n${div}\n`;
      msg += `📚 Sinonim    : ${d.sinonim_total} pasang (${d.sinonim_custom} custom)\n`;
      msg += `✏️  Koreksi    : ${d.koreksi_total} kata (${d.koreksi_custom} custom)\n`;
      msg += `⚡ Singkatan  : ${d.singkatan} entri\n`;
      msg += `🌐 Lokal      : ${d.lokal} entri\n${div}\n`;
      if (Object.keys(d.singkatan_all || {}).length) {
        msg += `*Singkatan aktif:*\n`;
        Object.entries(d.singkatan_all).forEach(([k, v]) => { msg += `  • ${k} → ${v}\n`; });
        msg += div + '\n';
      }
      if (Object.keys(d.lokal_all || {}).length) {
        msg += `*Kata lokal:*\n`;
        Object.entries(d.lokal_all).forEach(([k, v]) => { msg += `  • ${k} → ${v}\n`; });
        msg += div + '\n';
      }
      msg += `*Contoh sinonim:*\n`;
      Object.entries(d.contoh_sinonim || {}).slice(0, 4).forEach(([k, vs]) => {
        msg += `  • ${k} ≈ ${Array.isArray(vs) ? vs.join(', ') : vs}\n`;
      });
      msg += `\n_Tambah dengan:_\n`;
      msg += `*tambah sinonim miyak = minyak*\n`;
      msg += `*tambah koreksi tyop = toko*\n`;
      msg += `*tambah singkatan mgr = minyak goreng*\n`;
      msg += `*tambah lokal hau = kayu*`;
      return msg;
    }
    case 'PELAJARI_BAHASA': {
      const r = callSkill('bahasa', 'pelajari', { tipe: parsed.bahasaTipe, kunci: parsed.kunci, nilai: parsed.nilai });
      if (!r.ok) return Formatter.error(r.error);
      const tipeLabel = { sinonim: 'Sinonim', koreksi: 'Koreksi typo', singkatan: 'Singkatan', lokal: 'Kata lokal' };
      if (logActivity) logActivity(sender, `PELAJARI_BAHASA:${parsed.bahasaTipe}`, `${parsed.kunci}→${parsed.nilai}`);
      return `✅ *${tipeLabel[parsed.bahasaTipe] || parsed.bahasaTipe} tersimpan!*\n` +
        `"*${parsed.kunci}*" → "*${parsed.nilai}*"\n\n` +
        `Irma sekarang akan mengenali "*${parsed.kunci}*" sebagai "${parsed.nilai}" 🧠`;
    }
    case 'CEK_SINONIM': {
      const r = callSkill('bahasa', 'sinonim', { query: parsed.query });
      if (!r.ok) return Formatter.error(r.error);
      const { query, varian } = r.data;
      if (!varian.length) return `📚 Belum ada sinonim terdaftar untuk "*${query}*" kak.\nTambahkan: *tambah sinonim ${query} = [kata asli]*`;
      return `📚 *Sinonim "${query}":*\n${varian.map(v => `  • ${v}`).join('\n')}\n\n_Irma mengenali semua kata ini sebagai produk yang sama kak._`;
    }

    default: return null;
  }
}

module.exports = { prosesIntentBaru };
