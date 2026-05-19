'use strict';

const dayjs = require('dayjs');

function rp(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

const Formatter = {
  stokRingkas(stok) {
    const kritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
    const rendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const expired = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today);
    const nearExp = stok.filter(s => s.has_exp === '1' && s.exp_date > today && s.exp_date <= in7);

    let msg = `📦 *Status Stok* — ${dayjs().format('DD/MM/YYYY HH:mm')}\n`;

    if (kritis.length > 0) {
      msg += `\n🔴 *Kritis banget nih kak:*\n`;
      kritis.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan} aja\n`; });
    }
    if (rendah.length > 0) {
      msg += `\n🟡 *Mulai tipis:*\n`;
      rendah.forEach(s => { msg += `  • ${s.nama}: ${s.stok} ${s.satuan}\n`; });
    }
    if (expired.length > 0) {
      msg += `\n⛔ *Sudah kadaluarsa:*\n`;
      expired.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; });
    }
    if (nearExp.length > 0) {
      msg += `\n📅 *Hampir exp (7 hari):*\n`;
      nearExp.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; });
    }
    if (!kritis.length && !rendah.length && !expired.length && !nearExp.length) {
      msg += '\n✅ Stok semua aman kak, tenang aja!';
    }
    return msg;
  },

  konfirmasiJual(produk, qty, satuan, total, sisaStok, metode) {
    let msg = `✅ Oke kak, udah aku catat!\n` +
      `📦 ${produk} — ${qty} ${satuan}\n` +
      `💰 Total: ${rp(total)} (${(metode || 'tunai').toUpperCase()})\n` +
      `📊 Sisa stok: ${sisaStok} ${satuan}`;
    if (Number(sisaStok) <= 2) msg += '\n⚠️ Stok hampir habis kak, segera restock ya!';
    return msg;
  },

  konfirmasiBeli(produk, qty, satuan, harga, stokBaru) {
    return `📥 Siip, stok udah aku update!\n` +
      `📦 ${produk} +${qty} ${satuan}\n` +
      `💵 Harga beli: ${rp(harga)}/satuan\n` +
      `📊 Total bayar: ${rp(Number(qty) * Number(harga))}\n` +
      `✅ Stok sekarang: ${stokBaru} ${satuan}`;
  },

  infoHarga(item) {
    return `💲 *${item.nama}*\n` +
      `Harga jual: ${rp(item.harga_jual)}\n` +
      `Stok: ${item.stok} ${item.satuan}`;
  },

  detailProduk(produk) {
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    let msg = `🔍 *Detail: ${produk.nama}*\n` +
      `Kategori: ${produk.kategori}\n` +
      `Stok: ${produk.stok} ${produk.satuan}\n` +
      `Harga jual: ${rp(produk.harga_jual)}\n` +
      `Harga beli: ${rp(produk.harga_beli)}\n` +
      `Supplier: ${produk.supplier || '-'}`;
    if (produk.has_exp === '1' && produk.exp_date) {
      const status = produk.exp_date <= today ? '⛔ EXPIRED' : produk.exp_date <= in7 ? '⚠️ Hampir exp' : '✅ Aman';
      msg += `\nExp: ${produk.exp_date} (${status})`;
    }
    return msg;
  },

  ringkasanExp(stok) {
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const hasExp = stok.filter(s => s.has_exp === '1');
    if (!hasExp.length) return '📅 Belum ada produk dengan tanggal exp terdaftar kak.';

    const expired = hasExp.filter(s => s.exp_date && s.exp_date <= today);
    const nearExp = hasExp.filter(s => s.exp_date > today && s.exp_date <= in7);

    let msg = `📅 *Status Kadaluarsa* — ${dayjs().format('DD/MM/YYYY')}\n`;
    if (expired.length) {
      msg += `\n⛔ *Sudah kadaluarsa (${expired.length}):*\n`;
      expired.forEach(s => { msg += `  • ${s.nama} — exp ${s.exp_date}\n`; });
    }
    if (nearExp.length) {
      msg += `\n⚠️ *Hampir kadaluarsa (${nearExp.length}):*\n`;
      nearExp.forEach(s => { msg += `  • ${s.nama} — exp ${s.exp_date}\n`; });
    }
    if (!expired.length && !nearExp.length) {
      msg += '\n✅ Semua produk ber-exp date masih aman kak!';
    }
    return msg;
  },

  alertStokKritis(items) {
    let msg = `🚨 *Alert Stok Kritis!*\n${dayjs().format('DD/MM/YYYY HH:mm')}\n\n`;
    items.forEach(i => { msg += `⚠️ ${i.nama}: sisa ${i.stok} ${i.satuan}\n`; });
    msg += `\nSegera restock ya kak sebelum kehabisan!`;
    return msg;
  },

  laporanRingkas(data) {
    return `📊 *Laporan ${data.sesi}*\n` +
      `📅 ${data.tanggal}\n\n` +
      `💰 Omzet: ${rp(data.omzet)}\n` +
      `🛒 Transaksi: ${data.totalTx}x\n` +
      `🏆 Terlaris: ${data.top3?.join(', ') || '-'}\n` +
      (data.stokKritis?.length ? `\n⚠️ Kritis: ${data.stokKritis.join(', ')}` : '✅ Stok aman semua!');
  },

  bantuan() {
    return `👋 Halo kak! Aku Kak Kios, siap bantu kelola kiosmu!\n\n` +
      `Bisa ngobrol bebas, contoh:\n` +
      `  "tadi jual beras 2 karung tunai"\n` +
      `  "beli gula 10 bungkus dari supplier"\n` +
      `  "stok mie instan berapa?"\n\n` +
      `*Perintah cepat:*\n` +
      `  jual [produk] [qty] [tunai/qris/transfer]\n` +
      `  beli [produk] [qty] [harga?]\n` +
      `  stok · laporan · exp · cari [produk]\n` +
      `  harga [produk] · status · backup`;
  },

  status(memory) {
    return `ℹ️ *Status Sistem*\n` +
      `🕐 ${dayjs().format('DD/MM/YYYY HH:mm')}\n` +
      `🤖 AI: ${memory.ai?.provider_aktif || 'unknown'}\n` +
      `📶 Signal: ${memory.signal?.status || 'aktif'}\n` +
      `💾 Checkpoint: ${memory.last_checkpoint ? dayjs(memory.last_checkpoint).format('HH:mm') : '-'}`;
  },

  error(pesan) {
    return `Aduh, ada yang error nih kak 😅\n_${pesan}_\nCoba lagi bentar ya!`;
  },
};

module.exports = Formatter;
