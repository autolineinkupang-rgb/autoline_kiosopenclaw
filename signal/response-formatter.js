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
    if (kritis.length) { msg += `\n🔴 *Kritis:*\n`; kritis.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; }); }
    if (rendah.length) { msg += `\n🟡 *Rendah:*\n`; rendah.forEach(s => { msg += `  • ${s.nama}: ${s.stok} ${s.satuan}\n`; }); }
    if (expired.length) { msg += `\n⛔ *Kadaluarsa:*\n`; expired.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; }); }
    if (nearExp.length) { msg += `\n📅 *Hampir exp (7hr):*\n`; nearExp.forEach(s => { msg += `  • ${s.nama} (exp: ${s.exp_date})\n`; }); }
    if (!kritis.length && !rendah.length && !expired.length && !nearExp.length) msg += '\n✅ Stok semua aman kak!';
    return msg;
  },

  konfirmasiJual(produk, qty, satuan, total, sisa, metode) {
    let msg = `✅ Oke kak, udah aku catat!\n📦 ${produk} — ${qty} ${satuan}\n💰 Total: ${rp(total)} (${(metode || 'tunai').toUpperCase()})\n📊 Sisa stok: ${sisa} ${satuan}`;
    if (Number(sisa) <= 2) msg += '\n⚠️ Stok hampir habis kak, segera restock ya!';
    return msg;
  },

  konfirmasiBeli(produk, qty, satuan, harga, stokBaru, opts = {}) {
    const { priceChanged, hargaLama, supplier, autoCreated } = opts;
    let msg = autoCreated
      ? `➕ *Produk baru ditambahkan!*\n📦 ${produk}\n`
      : `📥 Stok masuk berhasil!\n📦 ${produk} +${qty} ${satuan}\n`;
    if (priceChanged && hargaLama !== undefined) {
      msg += `💰 Harga beli: ${rp(hargaLama)} → *${rp(harga)}* (+${rp(harga - hargaLama)})\n`;
      msg += `📝 Perubahan harga dicatat: ${new Date().toLocaleDateString('id-ID')}\n`;
    } else {
      msg += `💵 Harga beli: ${rp(harga)}/satuan\n`;
    }
    msg += `📊 Total bayar: ${rp(Number(qty) * Number(harga))}\n`;
    msg += `✅ Stok sekarang: ${stokBaru} ${satuan}`;
    if (supplier) msg += `\n🏪 Supplier: ${supplier}`;
    if (autoCreated) msg += `\n⚠️ Harga jual belum diset kak — ketik: *harga ${produk}* untuk cek & update`;
    return msg;
  },

  tambahProdukOk(produk) {
    const laba = Number(produk.harga_jual) - Number(produk.harga_beli);
    let msg = `✅ Oke kak! *${produk.nama}* udah aku tambahin ya!\n`;
    msg += `🏷️ Kategori: ${produk.kategori} (${produk.satuan})\n`;
    msg += `💵 Harga beli: ${rp(produk.harga_beli)}\n`;
    msg += `💰 Harga jual: ${rp(produk.harga_jual)}\n`;
    msg += `📦 Stok awal: ${produk.stok} ${produk.satuan}\n`;
    if (laba > 0) msg += `📈 Untung: ${rp(laba)}/satuan`;
    if (produk.exp_date) msg += `\n📅 Kadaluarsa: ${produk.exp_date}`;
    return msg;
  },

  hapusProdukKonfirmasi(nama) {
    return `⚠️ Kak mau hapus *${nama}* ya?\nData stok produk ini akan terhapus permanen.\n\nKetik *YA HAPUS* untuk lanjut atau *batal* untuk batalkan 🙏`;
  },

  batalkanTxKonfirmasi(tx) {
    return `⚠️ Kak mau batalkan transaksi ini?\n*${tx.id}* — ${tx.nama_produk}\nJumlah: ${tx.qty}x ${rp(tx.total)}\nTanggal: ${tx.tanggal} ${tx.jam}\n\nStok akan dikembalikan. Ketik *YA BATALKAN* untuk lanjut atau *batal* 🙏`;
  },

  hapusProdukOk(nama) {
    return `🗑️ Produk *${nama}* udah aku hapus ya kak. Data stoknya sudah tidak ada lagi.`;
  },

  batalkanTxOk(tx) {
    return `✅ Transaksi *${tx.id}* berhasil dibatalkan!\n📦 Stok ${tx.nama_produk} sudah dikembalikan.`;
  },

  updateHargaOk(item) {
    return `✅ Harga *${item.nama}* udah diupdate kak!\n💰 Harga jual: ${rp(item.harga_jual)}\n💵 Harga beli: ${rp(item.harga_beli)}`;
  },

  updateExpOk(item) {
    return `✅ Tanggal kadaluarsa *${item.nama}* udah diupdate!\n📅 Exp date: ${item.exp_date}`;
  },

  setStokOk(nama, lama, baru, satuan) {
    return `✅ Stok *${nama}* udah diset ulang kak!\n📊 Sebelumnya: ${lama} → Sekarang: ${baru} ${satuan}`;
  },

  laporanRingkas(data) {
    let msg = `📊 *Laporan ${data.sesi}*\n📅 ${data.tanggal}\n\n`;
    msg += `💰 Omzet: ${rp(data.omzet)}\n`;
    if (data.laba !== undefined) msg += `📈 Laba kotor: ${rp(data.laba)}\n`;
    msg += `🛒 Transaksi: ${data.totalTx}x\n`;
    msg += `🏆 Terlaris: ${data.top3?.join(', ') || '-'}\n`;
    msg += data.stokKritis?.length ? `\n⚠️ Kritis: ${data.stokKritis.join(', ')}` : '✅ Stok aman!';
    return msg;
  },

  labaRugi(data) {
    return `📈 *Laporan Laba — ${data.periode}*\n\n💰 Omzet: ${rp(data.omzet)}\n💵 Modal: ${rp(data.modal)}\n📊 Laba kotor: ${rp(data.laba)}\n🛒 Total transaksi: ${data.totalTx}x`;
  },

  riwayatTransaksi(txList, periode) {
    if (!txList.length) return `📋 Tidak ada transaksi untuk periode *${periode}* kak.`;
    let msg = `📋 *Riwayat Transaksi — ${periode}*\n_(${txList.length} transaksi terakhir)_\n\n`;
    txList.slice(-10).reverse().forEach(t => {
      msg += `• ${t.jam || '-'} — ${t.nama_produk} ${t.qty}x → ${rp(t.total)}\n`;
    });
    return msg;
  },

  hampirHabis(kritis, rendah) {
    if (!kritis.length && !rendah.length) return '✅ Semua stok masih aman kak, tidak ada yang hampir habis!';
    let msg = '📦 *Stok Hampir Habis:*\n';
    kritis.forEach(s => { msg += `🔴 ${s.nama}: sisa ${s.stok} ${s.satuan} (KRITIS!)\n`; });
    rendah.forEach(s => { msg += `🟡 ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
    msg += '\nSegera restock ya kak! 🛒';
    return msg;
  },

  hampirExp(items, tipe) {
    if (!items.length) return `✅ Tidak ada produk yang hampir ${tipe === 'expired' ? 'kadaluarsa' : 'exp'} kak!`;
    let msg = `📅 *Produk ${tipe === 'expired' ? 'Sudah' : 'Hampir'} Kadaluarsa:*\n`;
    items.forEach(s => { msg += `• ${s.nama} — exp ${s.exp_date}\n`; });
    return msg;
  },

  infoHarga(item) {
    return `💲 *${item.nama}*\nHarga jual: ${rp(item.harga_jual)}\nHarga beli: ${rp(item.harga_beli)}\nStok: ${item.stok} ${item.satuan}`;
  },

  detailProduk(produk) {
    const today = dayjs().format('YYYY-MM-DD');
    const in7 = dayjs().add(7, 'day').format('YYYY-MM-DD');
    let msg = `🔍 *${produk.nama}*\nKategori: ${produk.kategori} | Satuan: ${produk.satuan}\nStok: ${produk.stok} | Min: ${produk.stok_minimum}\nHarga jual: ${rp(produk.harga_jual)}\nHarga beli: ${rp(produk.harga_beli)}\nSupplier: ${produk.supplier || '-'}`;
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
    if (!hasExp.length) return '📅 Belum ada produk dengan exp date terdaftar.';
    const expired = hasExp.filter(s => s.exp_date && s.exp_date <= today);
    const nearExp = hasExp.filter(s => s.exp_date > today && s.exp_date <= in7);
    let msg = `📅 *Status Kadaluarsa*\n`;
    if (expired.length) { msg += `\n⛔ *Sudah kadaluarsa:*\n`; expired.forEach(s => { msg += `  • ${s.nama} (${s.exp_date})\n`; }); }
    if (nearExp.length) { msg += `\n⚠️ *Hampir exp:*\n`; nearExp.forEach(s => { msg += `  • ${s.nama} (${s.exp_date})\n`; }); }
    if (!expired.length && !nearExp.length) msg += '\n✅ Semua produk ber-exp date masih aman!';
    return msg;
  },

  alertStokKritis(items) {
    let msg = `🚨 *Alert Stok Kritis!*\n${dayjs().format('DD/MM HH:mm')}\n\n`;
    items.forEach(i => { msg += `⚠️ ${i.nama}: sisa ${i.stok} ${i.satuan}\n`; });
    return msg + '\nSegera restock kak! 🛒';
  },

  bantuan() {
    return `👋 *Halo! Saya Irma — asisten kios kamu*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n*📤 JUAL:*\n  jual [produk] [qty]\n  jual gula 2 tunai bayar 10000\n\n*📥 RESTOCK:*\n  beli [produk] [qty] [harga]\n  beli gula 50 harga 13000\n\n*📦 STOK & CARI:*\n  stok · cari [produk] · harga [produk]\n  exp · produk mau habis\n\n*📊 LAPORAN:*\n  laporan · laba · riwayat\n  laporan mingguan · laporan bulanan\n  produk terlaris · riwayat harga [produk]\n\n*🔄 MASSAL:*\n  jual banyak:\n  Gula | 2\n  Beras | 1\n\n  restock massal:\n  Gula | 50 | 13000\n  Beras | 100 | 68000\n\n*🏪 SHIFT:*\n  buka shift [saldo awal]\n  tutup shift [saldo akhir]\n  status shift\n\n*🎁 PROMO:*\n  buat promo [produk] [nilai]%\n  lihat promo · hapus promo PROMO-0001\n\n*🚚 SUPPLIER:*\n  tambah supplier [nama]\n  daftar supplier · cari supplier [nama]\n\n*💰 HARGA PASAR:*\n  harga pasar [produk]\n  estimasi harga [produk]\n  prediksi harga [produk]\n  harga facebook [produk]\n\n*⚙️ LAINNYA:*\n  status · backup · bantuan · daftar skill`;
  },

  status(memory) {
    return `ℹ️ *Status Sistem*\n🕐 ${dayjs().format('DD/MM/YYYY HH:mm')}\n🤖 AI: ${memory.ai?.provider_aktif || 'unknown'}\n📶 Signal: aktif\n💾 Checkpoint: ${memory.last_checkpoint ? dayjs(memory.last_checkpoint).format('HH:mm') : '-'}`;
  },

  produkBaru(items, periode) {
    if (!items.length) return `📦 Tidak ada produk baru ${periode === 'minggu' ? 'minggu ini' : 'hari ini'} kak.`;
    const div = '━━━━━━━━━━━━━━━━━━━━━━━';
    const label = periode === 'minggu' ? 'MINGGU INI' : 'HARI INI';
    let msg = `📦 *PRODUK BARU ${label}*\n${div}\n`;
    items.forEach(p => {
      const laba = Number(p.harga_jual) - Number(p.harga_beli);
      msg += `\n*${p.nama}*\n`;
      msg += `💰 Beli: ${rp(p.harga_beli)} | Jual: ${rp(p.harga_jual)}\n`;
      msg += `📦 Stok: ${p.stok} ${p.satuan}`;
      if (laba > 0) msg += ` | Untung: ${rp(laba)}/satuan`;
      if (p.has_exp === '1' && p.exp_date) msg += `\n📅 Exp: ${p.exp_date}`;
      msg += `\n✅ Ditambah: ${p.last_update || '-'}\n`;
    });
    msg += `${div}\nTotal produk baru: ${items.length} item`;
    return msg;
  },

  opnameOk(nama, lama, baru, satuan) {
    return `✅ Opname *${nama}* berhasil!\n📊 Stok fisik: ${lama} → ${baru} ${satuan}`;
  },

  mutasiProduk(nama, txList) {
    if (!txList.length) return `📋 Tidak ada riwayat transaksi untuk *${nama}*.`;
    let msg = `📋 *Mutasi Stok: ${nama}*\n_(${txList.length} transaksi terakhir)_\n\n`;
    txList.slice(-10).reverse().forEach(t => {
      msg += `• ${t.tanggal} ${t.jam || ''} — ${t.qty > 0 ? '+' : ''}${t.qty} → ${rp(t.total)}\n`;
    });
    return msg;
  },

  updateHargaPasarOk(produk, harga) {
    return `✅ Harga pasar *${produk}* diupdate: ${rp(harga)}\nTerima kasih kak, data makin akurat! 📊`;
  },

  laporanBelajar(data) {
    const div = '━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🧠 *LAPORAN BELAJAR BOT*\n${div}\n`;
    if (data.learned && data.learned.length) {
      msg += `\n📚 *Yang dipelajari hari ini:*\n`;
      data.learned.forEach(x => { msg += `  • "${x.cmd}" = ${x.intent}\n`; });
    }
    if (data.unknowns && data.unknowns.length) {
      msg += `\n❓ *Yang belum dimengerti:*\n`;
      data.unknowns.slice(0, 3).forEach(x => { msg += `  • "${x.cmd}" (${x.count}x)\n`; });
    }
    if (data.shortcuts && Object.keys(data.shortcuts).length) {
      msg += `\n💡 *Shortcut aktif:*\n`;
      Object.entries(data.shortcuts).slice(0, 3).forEach(([k, v]) => { msg += `  • "${k}" = ${v.join(', ')}\n`; });
    }
    msg += `\n${div}\n`;
    if (data.omzet !== undefined) {
      msg += `📊 *Ringkasan Harian:*\n`;
      msg += `💰 Penjualan: ${rp(data.omzet)}\n`;
      msg += `📦 Transaksi: ${data.totalTx || 0}x\n`;
      if (data.top) msg += `🏆 Terlaris: ${data.top}\n`;
      if (data.cuacaInfo) msg += `🌊 Cuaca besok: ${data.cuacaInfo}\n`;
    }
    msg += `\nSemangat kak! 💪`;
    return msg;
  },

  shortcutList(shortcuts) {
    if (!Object.keys(shortcuts).length) return '📋 Belum ada shortcut kak. Buat dengan ketik: *shortcut baru [nama] = [produk]*';
    let msg = '⚡ *Shortcut Aktif:*\n';
    Object.entries(shortcuts).forEach(([k, v]) => { msg += `  • *${k}* → ${Array.isArray(v) ? v.join(' + ') : v}\n`; });
    return msg;
  },

  statusPanel({ inventoryAction = '-', bugStatus = 'none', learned = 'none', extra = null } = {}) {
    const div = '┌─────────────────────────────────────────┐';
    const end = '└─────────────────────────────────────────┘';
    const row = (icon, label, val) => `│ ${icon} ${label.padEnd(12)}: ${String(val).slice(0, 26).padEnd(26)} │`;
    let msg = `\n${div}\n`;
    msg += row('📦', 'INVENTORY', inventoryAction) + '\n';
    msg += row('🔧', 'BUG STATUS', bugStatus) + '\n';
    msg += row('🧠', 'LEARNED', learned) + '\n';
    msg += row('✅', 'SYSTEM', 'Operational') + '\n';
    if (extra) msg += row('ℹ️', 'INFO', extra) + '\n';
    msg += end;
    return msg;
  },

  performanceReview(data) {
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `📊 *PERFORMANCE REVIEW SISTEM*\n${div}\n`;
    msg += `📦 Total tugas diproses: ${data.total_tasks}\n`;
    msg += `🐛 Bug ditemukan: ${data.bugs_found} | Diperbaiki: ${data.bugs_fixed}\n`;
    msg += `🛡️ Prevention rules: ${data.prevention_rules}\n`;
    msg += `💡 Best practices: ${data.best_practices}\n`;
    msg += `✅ Success rate: ${data.success_rate}%\n`;
    if (data.areas_to_improve?.length) {
      msg += `\n⚠️ Perlu perhatian:\n`;
      data.areas_to_improve.forEach(a => { msg += `  • ${a}\n`; });
    }
    msg += div;
    return msg;
  },

  bugReport(bugId, errorType, location, fixApplied) {
    return `🔧 *Bug Terdeteksi & Diperbaiki*\n🆔 ${bugId}\n📍 ${location}\n❌ Error: ${errorType}\n✅ Fix: ${fixApplied}\n🔧 Bug fixed and deployed. All tests passed.`;
  },

  bukaShiftOk(data) {
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🟢 *SHIFT DIBUKA*\n${div}\n`;
    msg += `🆔 ID Shift : ${data.shift_id}\n`;
    msg += `👤 Kasir    : ${data.kasir}\n`;
    msg += `🕐 Jam Buka : ${data.waktu_buka.slice(11, 16)} WITA\n`;
    msg += `💵 Saldo Kas: ${rp(data.saldo_awal)}\n`;
    msg += `${div}\n`;
    msg += `✅ Selamat bekerja! Ketik *tutup shift* untuk menutup shift.`;
    return msg;
  },

  tutupShiftOk(data, omzet, jumlahTx) {
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    const durMenit = Math.round((new Date(data.waktu_tutup) - new Date(data.waktu_buka)) / 60000);
    const jam = Math.floor(durMenit / 60);
    const menit = durMenit % 60;
    let msg = `🔴 *SHIFT DITUTUP*\n${div}\n`;
    msg += `🆔 ID Shift  : ${data.shift_id}\n`;
    msg += `👤 Kasir     : ${data.kasir}\n`;
    msg += `🕐 Buka      : ${data.waktu_buka.slice(11, 16)} WITA\n`;
    msg += `🕐 Tutup     : ${data.waktu_tutup.slice(11, 16)} WITA\n`;
    msg += `⏱️ Durasi    : ${jam > 0 ? `${jam} jam ` : ''}${menit} menit\n`;
    msg += `${div}\n`;
    msg += `🛒 Transaksi : ${jumlahTx}x\n`;
    msg += `💰 Omzet     : ${rp(omzet)}\n`;
    msg += `💵 Saldo Awal: ${rp(data.saldo_awal)}\n`;
    if (data.saldo_akhir !== null) msg += `💵 Saldo Akhir: ${rp(data.saldo_akhir)}\n`;
    msg += `${div}\n`;
    msg += `✅ Shift selesai, terima kasih sudah bekerja keras! 🙏`;
    return msg;
  },

  statusShift(info) {
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    if (info.status === 'closed') {
      return `⚪ *Status Shift: TUTUP*\nKetik *buka shift [saldo awal]* untuk mulai shift baru.`;
    }
    const { shift, omzetBerjalan, txList } = info;
    const durMenit = Math.round((Date.now() + (new Date().getTimezoneOffset() + 480) * 60000 - new Date(shift.waktu_buka).getTime()) / 60000);
    const jam = Math.floor(durMenit / 60);
    const menit = durMenit % 60;
    let msg = `🟢 *Status Shift: BUKA*\n${div}\n`;
    msg += `🆔 ${shift.shift_id}\n`;
    msg += `👤 Kasir  : ${shift.kasir}\n`;
    msg += `🕐 Buka   : ${shift.waktu_buka.slice(11, 16)} WITA (${jam > 0 ? `${jam}j ` : ''}${menit}m lalu)\n`;
    msg += `💵 Saldo  : ${rp(shift.saldo_awal)}\n`;
    msg += `${div}\n`;
    msg += `🛒 Transaksi : ${txList.length}x\n`;
    msg += `💰 Omzet     : ${rp(omzetBerjalan)}\n`;
    msg += `${div}\n`;
    msg += `Ketik *tutup shift [saldo akhir]* untuk tutup shift.`;
    return msg;
  },

  // ── MASS OPERATIONS ────────────────────────────────────────────────────────
  autoRestockPreview(menipis) {
    if (!menipis.length) return '✅ Tidak ada produk yang menipis kak! Semua stok masih aman.';
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `⚠️ *STOK MENIPIS — ${menipis.length} PRODUK*\n${div}\n`;
    menipis.forEach((s, i) => {
      msg += `${i + 1}. *${s.nama}*\n`;
      msg += `   Stok: ${s.stok} | Min: ${s.stok_minimum} | Butuh: +${s.qty_dibutuhkan} ${s.satuan}\n`;
    });
    msg += `${div}\nKetik *restock massal:* lalu daftar produk + qty untuk restock massal.`;
    return msg;
  },

  restockMassalOk(results) {
    const ok = results.filter(r => r.ok);
    const gagal = results.filter(r => !r.ok);
    const totalQty = ok.reduce((s, r) => s + r.qty, 0);
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `📦 *RESTOCK MASSAL SELESAI*\n${div}\n`;
    results.forEach((r, i) => {
      if (r.ok) {
        const d = r.data;
        const hargaInfo = d.price_changed ? ` | harga: ${rp(d.harga_lama)}→${rp(d.harga_beli)}` : '';
        msg += `✅ ${i + 1}. *${d.item?.nama || r.produk}* +${r.qty} → stok: ${d.stok_baru}${hargaInfo}\n`;
      } else {
        msg += `❌ ${i + 1}. *${r.produk}* — ${r.error}\n`;
      }
    });
    msg += `${div}\n✅ ${ok.length} berhasil | ❌ ${gagal.length} gagal | 📦 +${totalQty} unit total`;
    return msg;
  },

  jualMassalOk(results) {
    const ok = results.filter(r => r.ok);
    const gagal = results.filter(r => !r.ok);
    const totalOmzet = ok.reduce((s, r) => s + (r.data?.total || 0), 0);
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🧾 *TRANSAKSI MASSAL*\n${div}\n`;
    results.forEach((r, i) => {
      if (r.ok) {
        msg += `✅ ${i + 1}. ${r.data.item?.nama || r.produk} x${r.qty} → ${rp(r.data.total)}\n`;
      } else {
        msg += `❌ ${i + 1}. ${r.produk} — ${r.error}\n`;
      }
    });
    msg += `${div}\n💰 Total: *${rp(totalOmzet)}*\n✅ ${ok.length} item | ❌ ${gagal.length} gagal`;
    return msg;
  },

  tambahProdukMassalOk(results) {
    const ok = results.filter(r => r.ok);
    const gagal = results.filter(r => !r.ok);
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `➕ *TAMBAH PRODUK MASSAL*\n${div}\n`;
    results.forEach((r, i) => {
      if (r.ok) {
        const p = r.data?.produk;
        msg += `✅ ${i + 1}. *${p?.nama || r.produk}* | jual: ${rp(p?.harga_jual)} | stok: ${p?.stok}\n`;
      } else {
        msg += `❌ ${i + 1}. *${r.produk}* — ${r.error}\n`;
      }
    });
    msg += `${div}\n✅ ${ok.length} dibuat | ❌ ${gagal.length} gagal`;
    return msg;
  },

  // ── BEST SELLER ────────────────────────────────────────────────────────────
  terlaris(produk, periode, totalTx) {
    if (!produk.length) return `📊 Belum ada data penjualan untuk periode *${periode}* kak.`;
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🏆 *PRODUK TERLARIS — ${periode.toUpperCase()}*\n${div}\n`;
    produk.forEach((p, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      msg += `${medal} *${p.nama}*\n   Terjual: ${p.qty}x | Omzet: ${rp(p.omzet)}\n`;
    });
    msg += `${div}\nTotal transaksi: ${totalTx}x`;
    return msg;
  },

  // ── PRICE HISTORY ──────────────────────────────────────────────────────────
  riwayatHarga(riwayat, produk) {
    const label = produk ? `*${produk}*` : 'semua produk';
    if (!riwayat.length) return `📋 Belum ada riwayat perubahan harga untuk ${label} kak.`;
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `📈 *RIWAYAT HARGA ${produk ? produk.toUpperCase() : ''}*\n${div}\n`;
    riwayat.slice().reverse().forEach(h => {
      const selisih = Number(h.selisih);
      const icon = selisih > 0 ? '🔺' : selisih < 0 ? '🔻' : '➡️';
      msg += `${icon} ${h.tanggal} ${h.jam?.slice(0, 5) || ''}\n`;
      msg += `   ${h.nama_produk}: ${rp(h.harga_lama)} → *${rp(h.harga_baru)}*\n`;
      if (h.supplier) msg += `   Supplier: ${h.supplier}\n`;
    });
    return msg;
  },

  // ── SUPPLIER ───────────────────────────────────────────────────────────────
  tambahSupplierOk(s) {
    return `✅ Supplier *${s.nama}* berhasil didaftarkan!\n🆔 ${s.id}\n📞 Kontak: ${s.kontak || '-'}\n📍 Alamat: ${s.alamat || '-'}`;
  },

  daftarSupplier(suppliers) {
    if (!suppliers.length) return `📋 Belum ada supplier terdaftar kak.\nKetik: *tambah supplier [nama]* untuk mendaftar.`;
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🏪 *DAFTAR SUPPLIER* (${suppliers.length})\n${div}\n`;
    suppliers.forEach(s => {
      msg += `• *${s.nama}* (${s.id})\n`;
      if (s.kontak) msg += `  📞 ${s.kontak}\n`;
      if (s.produk_utama) msg += `  📦 ${s.produk_utama}\n`;
    });
    return msg;
  },

  detailSupplier(s, produkSupplied) {
    let msg = `🏪 *${s.nama}*\n🆔 ${s.id}\n📞 Kontak: ${s.kontak || '-'}\n📍 Alamat: ${s.alamat || '-'}\n`;
    if (s.produk_utama) msg += `📦 Produk utama: ${s.produk_utama}\n`;
    if (produkSupplied.length) msg += `\n*Produk yang di-supply:*\n${produkSupplied.map(p => `  • ${p}`).join('\n')}`;
    return msg;
  },

  // ── PROMO ──────────────────────────────────────────────────────────────────
  buatPromoOk(promo, produk) {
    const nilaiStr = promo.tipe === 'persen' ? `${promo.nilai}%` : rp(promo.nilai);
    const hargaJual = Number(produk?.harga_jual || 0);
    const hargaDiskon = promo.tipe === 'persen'
      ? hargaJual - Math.floor(hargaJual * promo.nilai / 100)
      : hargaJual - promo.nilai;
    let msg = `✅ *Promo berhasil dibuat!*\n`;
    msg += `🆔 ${promo.id}\n`;
    msg += `📦 Produk: *${promo.produk}*\n`;
    msg += `💰 Diskon: ${nilaiStr} → harga jadi *${rp(hargaDiskon)}*\n`;
    msg += `📅 Mulai: ${promo.mulai}${promo.selesai ? ` s/d ${promo.selesai}` : ' (tanpa batas)'}\n`;
    msg += `\nPromo akan otomatis teraplikasi saat jual kak! 🎉`;
    return msg;
  },

  daftarPromo(promos) {
    if (!promos.length) return `🎯 Tidak ada promo aktif saat ini kak.\nKetik: *buat promo [produk] diskon [%]* untuk membuat.`;
    const div = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    let msg = `🎯 *PROMO AKTIF* (${promos.length})\n${div}\n`;
    promos.forEach(p => {
      const nilaiStr = p.tipe === 'persen' ? `${p.nilai}%` : rp(p.nilai);
      msg += `• *${p.produk}* — diskon ${nilaiStr}\n`;
      msg += `  ID: ${p.id} | ${p.selesai ? `s/d ${p.selesai}` : 'tidak terbatas'}\n`;
    });
    return msg;
  },

  error(pesan) {
    return `Aduh, ada yang error nih kak 😅\n_${pesan}_\nCoba lagi bentar ya!`;
  },
};

module.exports = Formatter;
