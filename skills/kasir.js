'use strict';

const dayjs = require('dayjs');
const { callSkill } = require('../signal/bridge');

const LOKASI = 'Rote Barat Laut, Rote Ndao';

function wita(fmt = 'DD/MM/YYYY HH:mm') {
  return dayjs(new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)).format(fmt);
}

function rp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function pad(str, len, right = false) {
  const s = String(str);
  if (right) return s.padStart(len, ' ');
  return s.padEnd(len, ' ');
}

function formatStrukLine(nama, qty, satuan, hargaSatuan) {
  const label = `${nama} x${qty}`;
  const total = rp(qty * hargaSatuan);
  const labelTrim = label.length > 22 ? label.slice(0, 21) + '…' : label;
  return `${pad(labelTrim, 23)}${pad(total, 12, true)}`;
}

function buatStruk(items, totalBayar, nominalBayar, txId) {
  const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `🧾 *STRUK KIOS CERDAS*\n`;
  msg += `📍 ${LOKASI}\n`;
  msg += divider + '\n';
  for (const it of items) {
    msg += formatStrukLine(it.nama, it.qty, it.satuan, it.harga_jual) + '\n';
  }
  msg += divider + '\n';
  msg += `${pad('Total:', 23)}${pad(rp(totalBayar), 12, true)}\n`;
  if (nominalBayar && nominalBayar >= totalBayar) {
    msg += `${pad('Bayar:', 23)}${pad(rp(nominalBayar), 12, true)}\n`;
    msg += `${pad('Kembalian:', 23)}${pad(rp(nominalBayar - totalBayar), 12, true)}\n`;
  }
  msg += divider + '\n';
  msg += `✅ #${txId} | ${wita()} WITA\n`;
  msg += `Terima kasih! 🙏`;
  return msg;
}

function jual({ produk, qty, metode = 'tunai', bayar = null }) {
  const r = callSkill('stok', 'jual', { produk, qty, metode: metode || 'tunai' });
  if (!r.ok) return { ok: false, error: r.error };

  const { item, total, sisa, tx } = r.data;
  const txId = r.data.txId || r.data.id || 'TRX-???';
  const struk = buatStruk(
    [{ nama: item.nama, qty, satuan: item.satuan, harga_jual: item.harga_jual }],
    total,
    bayar,
    txId,
  );

  return { ok: true, struk, sisa, item, total, txId };
}

function beli({ produk, qty, harga = 0 }) {
  return callSkill('stok', 'tambah', { produk, qty, harga });
}

function hitungKembalian(total, bayar) {
  const kembalian = Number(bayar) - Number(total);
  if (kembalian < 0) return { ok: false, error: `Kurang ${rp(Math.abs(kembalian))} kak!` };
  return { ok: true, kembalian };
}

module.exports = { jual, beli, hitungKembalian, buatStruk, wita, rp };
