'use strict';

const { callSkill } = require('./bridge');
const Formatter = require('./response-formatter');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');
const SelfDebug = require('../skills/self-debug');
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

async function prosesIntentBaru(parsed, sender, logActivity) {
  switch (parsed.tipe) {
    case 'CUACA': {
      const data = await Cuaca.getCuacaLengkap().catch(() => null);
      return data ? Cuaca.formatCuacaRingkas(data) : 'Koneksi BMKG gagal kak, coba lagi sebentar 🙏';
    }
    case 'HARGA_PASAR': {
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
