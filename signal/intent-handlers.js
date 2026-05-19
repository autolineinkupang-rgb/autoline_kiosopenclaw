'use strict';

const { callSkill } = require('./bridge');
const Formatter = require('./response-formatter');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');

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
    default: return null;
  }
}

module.exports = { prosesIntentBaru };
