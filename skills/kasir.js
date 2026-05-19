'use strict';

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { callSkill } = require('../signal/bridge');

const LOKASI = 'Rote Barat Laut, Rote Ndao';
const SHIFT_FILE = path.join(__dirname, '..', 'data', 'shift.json');
const TRANSAKSI_FILE = path.join(__dirname, '..', 'data', 'transaksi.csv');

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

function loadShift() {
  try { return JSON.parse(fs.readFileSync(SHIFT_FILE, 'utf8')); }
  catch { return { status: 'closed', shift_id: null, kasir: null, waktu_buka: null, saldo_awal: 0 }; }
}

function saveShift(data) {
  fs.writeFileSync(SHIFT_FILE, JSON.stringify(data, null, 2));
}

function txSejak(waktuBuka) {
  try {
    const lines = fs.readFileSync(TRANSAKSI_FILE, 'utf8').split('\n').slice(1).filter(Boolean);
    const batas = waktuBuka.replace('T', ' ');
    return lines
      .map(l => {
        const [id, tanggal, jam, , nama, , qty, harga, total, metode] = l.split(',');
        return { id, tanggal, jam, nama, qty: Number(qty), harga: Number(harga), total: Number(total), metode };
      })
      .filter(t => `${t.tanggal} ${t.jam}` >= batas);
  } catch { return []; }
}

function bukaShift(kasir, saldoAwal) {
  const shift = loadShift();
  if (shift.status === 'open') return { ok: false, error: `Shift sudah buka kak! Dibuka oleh *${shift.kasir}* jam ${shift.waktu_buka?.slice(11, 16)} WITA` };

  const now = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);
  const shiftId = `SHIFT-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}`;
  const data = { status: 'open', shift_id: shiftId, kasir: kasir || 'Kasir', waktu_buka: now.toISOString().slice(0, 19), saldo_awal: Number(saldoAwal) || 0, waktu_tutup: null, saldo_akhir: null };
  saveShift(data);
  return { ok: true, data };
}

function tutupShift(saldoAkhir) {
  const shift = loadShift();
  if (shift.status === 'closed') return { ok: false, error: 'Shift belum dibuka kak! Ketik *buka shift [saldo awal]* dulu ya.' };

  const txList = txSejak(shift.waktu_buka);
  const omzet = txList.reduce((s, t) => s + t.total, 0);
  const now = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);

  const data = { ...shift, status: 'closed', waktu_tutup: now.toISOString().slice(0, 19), saldo_akhir: Number(saldoAkhir) || null };
  saveShift(data);
  return { ok: true, data, txList, omzet, jumlahTx: txList.length };
}

function getShiftStatus() {
  const shift = loadShift();
  if (shift.status === 'closed') return { ok: true, status: 'closed', shift };
  const txList = txSejak(shift.waktu_buka);
  const omzetBerjalan = txList.reduce((s, t) => s + t.total, 0);
  return { ok: true, status: 'open', shift, txList, omzetBerjalan };
}

module.exports = { jual, beli, hitungKembalian, buatStruk, wita, rp, bukaShift, tutupShift, getShiftStatus };
