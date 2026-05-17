'use strict';

const dayjs = require('dayjs');

function formatRupiah(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

const Formatter = {
  stokRingkas(stok) {
    const kritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
    const rendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));

    let msg = `📦 *STATUS STOK* — ${dayjs().format('DD/MM/YYYY HH:mm')}\n`;
    if (kritis.length > 0) {
      msg += `\n🔴 *KRITIS:*\n`;
      kritis.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
    }
    if (rendah.length > 0) {
      msg += `\n🟡 *RENDAH:*\n`;
      rendah.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
    }
    if (kritis.length === 0 && rendah.length === 0) {
      msg += '\n✅ Semua stok aman!';
    }
    return msg;
  },

  konfirmasiJual(produk, qty, total, sisaStok) {
    return `✅ *TRANSAKSI DICATAT*\n` +
      `Produk: ${produk}\n` +
      `Jumlah: ${qty} pcs\n` +
      `Total: ${formatRupiah(total)}\n` +
      `Sisa stok: ${sisaStok} unit` +
      (sisaStok <= 2 ? '\n⚠️ Stok hampir habis!' : '');
  },

  alertStokKritis(items) {
    let msg = `🚨 *ALERT STOK KRITIS*\n${dayjs().format('DD/MM/YYYY HH:mm')}\n\n`;
    items.forEach(item => { msg += `⚠️ ${item.nama}: sisa ${item.stok} ${item.satuan}\n`; });
    msg += `\nSegera restock produk di atas!`;
    return msg;
  },

  laporanRingkas(data) {
    return `📊 *LAPORAN ${data.sesi.toUpperCase()}*\n` +
      `📅 ${data.tanggal}\n\n` +
      `💰 Omzet: ${formatRupiah(data.omzet)}\n` +
      `🛒 Transaksi: ${data.totalTx}x\n` +
      `🏆 Terlaris: ${data.top3?.join(', ') || '-'}\n` +
      (data.stokKritis?.length ? `\n⚠️ Kritis: ${data.stokKritis.join(', ')}` : '✅ Stok aman');
  },

  bantuan() {
    return `🤖 *KIOS DESA BOT*\n\n` +
      `Perintah tersedia:\n` +
      `📦 *stok* — cek status stok\n` +
      `📊 *laporan* — laporan hari ini\n` +
      `💸 *jual [produk] [qty]* — catat penjualan\n` +
      `📥 *tambah [produk] [qty]* — tambah stok\n` +
      `💲 *harga [produk]* — cek harga\n` +
      `💾 *backup* — backup data sekarang\n` +
      `ℹ️ *status* — info sistem`;
  },

  status(memory) {
    return `ℹ️ *STATUS SISTEM*\n` +
      `🕐 ${dayjs().format('DD/MM/YYYY HH:mm')}\n` +
      `🤖 AI: ${memory.ai?.provider_aktif || 'unknown'}\n` +
      `📶 Signal: ${memory.signal?.status || 'unknown'}\n` +
      `💾 Checkpoint: ${memory.last_checkpoint ? dayjs(memory.last_checkpoint).format('HH:mm') : '-'}`;
  },

  error(pesan) {
    return `❌ *Error*: ${pesan}`;
  },
};

module.exports = Formatter;
