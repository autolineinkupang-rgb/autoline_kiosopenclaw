'use strict';

const dayjs = require('dayjs');

function formatRupiah(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

const Formatter = {
  stokRingkas(stok) {
    const kritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
    const rendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const expired = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today);
    const nearExp = stok.filter(s => s.has_exp === '1' && s.exp_date > today && s.exp_date <= in7);

    let msg = `📦 *STATUS STOK* — ${dayjs().format('DD/MM/YYYY HH:mm')}\n`;
    if (kritis.length > 0) {
      msg += `\n🔴 *KRITIS:*\n`;
      kritis.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
    }
    if (rendah.length > 0) {
      msg += `\n🟡 *RENDAH:*\n`;
      rendah.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
    }
    if (expired.length > 0) {
      msg += `\n⛔ *KADALUARSA:*\n`;
      expired.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; });
    }
    if (nearExp.length > 0) {
      msg += `\n📅 *HAMPIR EXP (7hr):*\n`;
      nearExp.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; });
    }
    if (kritis.length === 0 && rendah.length === 0 && expired.length === 0 && nearExp.length === 0) {
      msg += '\n✅ Semua stok aman!';
    }
    return msg;
  },

  konfirmasiJual(produk, qty, satuan, total, sisaStok, metode) {
    return `✅ *PENJUALAN DICATAT*\n` +
      `Produk: ${produk}\n` +
      `Jumlah: ${qty} ${satuan}\n` +
      `Total: ${formatRupiah(total)}\n` +
      `Bayar: ${(metode || 'tunai').toUpperCase()}\n` +
      `Sisa stok: ${sisaStok} ${satuan}` +
      (Number(sisaStok) <= 2 ? '\n⚠️ Stok hampir habis!' : '');
  },

  konfirmasiBeli(produk, qty, satuan, harga, stokBaru) {
    return `📥 *PEMBELIAN DICATAT*\n` +
      `Produk: ${produk}\n` +
      `Qty masuk: ${qty} ${satuan}\n` +
      `Harga beli: ${formatRupiah(harga)}\n` +
      `Total bayar: ${formatRupiah(Number(qty) * Number(harga))}\n` +
      `Stok sekarang: ${stokBaru} ${satuan}`;
  },

  detailProduk(produk) {
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    let msg = `🔍 *DETAIL PRODUK*\n` +
      `Nama: ${produk.nama}\n` +
      `Kategori: ${produk.kategori}\n` +
      `Stok: ${produk.stok} ${produk.satuan}\n` +
      `Harga jual: ${formatRupiah(produk.harga_jual)}\n` +
      `Harga beli: ${formatRupiah(produk.harga_beli)}\n` +
      `Supplier: ${produk.supplier || '-'}`;
    if (produk.has_exp === '1' && produk.exp_date) {
      const status = produk.exp_date <= today ? '⛔ EXPIRED' : produk.exp_date <= in7 ? '⚠️ Hampir exp' : '✅ OK';
      msg += `\nExp Date: ${produk.exp_date} (${status})`;
    }
    return msg;
  },

  ringkasanExp(stok) {
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const hasExpItems = stok.filter(s => s.has_exp === '1');
    if (!hasExpItems.length) return '📅 Tidak ada produk dengan exp date terdaftar.';

    const expired = hasExpItems.filter(s => s.exp_date && s.exp_date <= today);
    const nearExp = hasExpItems.filter(s => s.exp_date > today && s.exp_date <= in7);
    const aman = hasExpItems.filter(s => !s.exp_date || s.exp_date > in7);

    let msg = `📅 *STATUS KADALUARSA* — ${dayjs().format('DD/MM/YYYY')}\n`;
    if (expired.length) {
      msg += `\n⛔ *SUDAH KADALUARSA (${expired.length}):*\n`;
      expired.forEach(s => { msg += `  • ${s.nama} — exp ${s.exp_date}\n`; });
    }
    if (nearExp.length) {
      msg += `\n⚠️ *HAMPIR KADALUARSA (${nearExp.length}):*\n`;
      nearExp.forEach(s => { msg += `  • ${s.nama} — exp ${s.exp_date}\n`; });
    }
    if (!expired.length && !nearExp.length) {
      msg += '\n✅ Semua produk ber-exp date masih aman!';
    }
    return msg;
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
      `Bisa pakai bahasa bebas, contoh:\n` +
      `  "jual 2 beras ke pembeli"\n` +
      `  "tadi ada yang beli gula 1 bungkus"\n` +
      `  "stok mie instan berapa?"\n` +
      `  "tambah 10 gula dari supplier"\n\n` +
      `*Perintah cepat:*\n` +
      `  jual [produk] [qty] [tunai/qris/transfer]\n` +
      `  beli [produk] [qty] [harga?]\n` +
      `  stok · laporan · exp · cari [produk]\n` +
      `  harga [produk] · status · backup`;
  },

  status(memory) {
    return `ℹ️ *STATUS SISTEM*\n` +
      `🕐 ${dayjs().format('DD/MM/YYYY HH:mm')}\n` +
      `🤖 AI: ${memory.ai?.provider_aktif || 'unknown'}\n` +
      `📶 Signal: ${memory.signal?.status || 'unknown'}\n` +
      `💾 Checkpoint: ${memory.last_checkpoint ? dayjs(memory.last_checkpoint).format('HH:mm') : '-'}`;
  },

  error(pesan) { return `❌ *Error*: ${pesan}`; },
};

module.exports = Formatter;
