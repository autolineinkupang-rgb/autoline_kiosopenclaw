'use strict';

const dayjs = require('dayjs');
const { callSkill } = require('../signal/bridge');

function wita(fmt = 'DD/MM/YYYY HH:mm') {
  return dayjs(new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)).format(fmt) + ' WITA';
}

function stokSemua() {
  const r = callSkill('stok', 'cek', {});
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, stok: r.data.stok };
}

function produkMauHabis(batas = 5) {
  const r = callSkill('stok', 'cek', {});
  if (!r.ok) return { ok: false, error: r.error };
  const kritis = r.data.stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
  const rendah = r.data.stok.filter(s =>
    Number(s.stok) > Number(s.stok_kritis) &&
    Number(s.stok) <= Math.max(Number(s.stok_minimum), batas)
  );
  return { ok: true, kritis, rendah };
}

function produkMauExp(hari = 30) {
  const r = callSkill('stok', 'cek', {});
  if (!r.ok) return { ok: false, error: r.error };
  const today = dayjs().format('YYYY-MM-DD');
  const batas = dayjs().add(hari, 'day').format('YYYY-MM-DD');
  const expired = r.data.stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today);
  const hampir = r.data.stok.filter(s => s.has_exp === '1' && s.exp_date > today && s.exp_date <= batas);
  return { ok: true, expired, hampir, batas };
}

function restock(produk, qty, harga = 0) {
  return callSkill('stok', 'tambah', { produk, qty, harga });
}

function opname(produk, jumlahBaru) {
  return callSkill('stok', 'set_stok', { produk, stok_baru: jumlahBaru });
}

function cariProduk(produk) {
  return callSkill('stok', 'cari', { produk });
}

function formatAlertGudang(kritis, rendah, cuacaInfo = null) {
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `⚠️ *ALERT GUDANG*\n`;
  msg += `📍 Rote Barat Laut, Rote Ndao\n`;
  msg += `🕐 ${wita()}\n`;
  msg += div + '\n';

  if (kritis.length) {
    msg += `🔴 *Stok Kritis:*\n`;
    kritis.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
  }
  if (rendah.length) {
    msg += `🟡 *Stok Rendah:*\n`;
    rendah.forEach(s => { msg += `  • ${s.nama}: sisa ${s.stok} ${s.satuan}\n`; });
  }
  if (!kritis.length && !rendah.length) {
    msg += `✅ Semua stok aman kak!\n`;
  }

  if (cuacaInfo) {
    msg += `\n${div}\n`;
    msg += `🌊 *Info Cuaca:*\n`;
    msg += `${cuacaInfo}\n`;
  }

  msg += div + '\n';
  if (kritis.length || rendah.length) msg += `Segera restock kak! 🛒`;
  return msg;
}

module.exports = { stokSemua, produkMauHabis, produkMauExp, restock, opname, cariProduk, formatAlertGudang, wita };
