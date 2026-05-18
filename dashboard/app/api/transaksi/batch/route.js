import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

const TX_PATH = path.join(process.cwd(), '..', 'data', 'transaksi.csv');
const STOK_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');

const TX_HEADERS = ['id','tanggal','jam','produk_id','nama_produk','kategori','qty','harga_satuan','total','metode_bayar','kasir','catatan','session_id'];
const STOK_HEADERS = ['id','nama','kategori','satuan','stok','harga_beli','harga_jual','stok_minimum','stok_kritis','supplier','last_update','has_exp','exp_date'];

function readCsv(filepath) {
  try {
    return parse(readFileSync(filepath, 'utf8'), { columns: true, skip_empty_lines: true });
  } catch { return []; }
}

function csvLine(row, headers) {
  return headers.map(h => {
    const v = String(row[h] ?? '');
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
}

function writeCsvSafe(filepath, data, headers) {
  const tmp = filepath + '.tmp';
  const lines = [headers.join(','), ...data.map(r => csvLine(r, headers))].join('\n') + '\n';
  writeFileSync(tmp, lines, 'utf8');
  renameSync(tmp, filepath);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { items, metode_bayar, kasir, catatan } = body;

    if (!items?.length) return Response.json({ error: 'Keranjang kosong' }, { status: 400 });

    const stok = readCsv(STOK_PATH);
    const txData = readCsv(TX_PATH);

    // Validate all items first
    const resolved = [];
    for (const item of items) {
      const { produk_id, qty } = item;
      if (!produk_id || !qty || Number(qty) <= 0) {
        return Response.json({ error: `Item tidak valid: ${produk_id}` }, { status: 400 });
      }
      const idx = stok.findIndex(s => s.id === String(produk_id));
      if (idx === -1) return Response.json({ error: `Produk ${produk_id} tidak ditemukan` }, { status: 404 });

      const produk = stok[idx];
      const qtyNum = Number(qty);
      const stokSisa = Number(produk.stok) - qtyNum;
      if (stokSisa < 0) {
        return Response.json({ error: `Stok ${produk.nama} tidak cukup (sisa: ${produk.stok})` }, { status: 400 });
      }
      resolved.push({ idx, produk, qtyNum, stokSisa });
    }

    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const jam = now.toTimeString().slice(0, 8);
    const maxId = txData.reduce((max, r) => {
      return Math.max(max, parseInt(r.id?.replace(/\D/g, '') || '0'));
    }, 0);
    const sessionId = `SESS-${tanggal.replace(/-/g, '')}-${String(maxId + 1).padStart(4, '0')}`;

    const newTxRows = resolved.map(({ produk, qtyNum }, i) => ({
      id: `TRX-${String(maxId + i + 1).padStart(4, '0')}`,
      tanggal, jam,
      produk_id: produk.id,
      nama_produk: produk.nama,
      kategori: produk.kategori,
      qty: String(qtyNum),
      harga_satuan: produk.harga_jual,
      total: String(qtyNum * Number(produk.harga_jual)),
      metode_bayar: String(metode_bayar || 'tunai'),
      kasir: String(kasir || 'Kasir').trim(),
      catatan: String(catatan || '').trim(),
      session_id: sessionId,
    }));

    // Update stok
    for (const { idx, stokSisa } of resolved) {
      stok[idx] = { ...stok[idx], stok: String(stokSisa), last_update: tanggal };
    }

    writeCsvSafe(TX_PATH, [...txData, ...newTxRows], TX_HEADERS);
    writeCsvSafe(STOK_PATH, stok, STOK_HEADERS);

    const totalBayar = newTxRows.reduce((s, r) => s + Number(r.total), 0);
    return Response.json({ ok: true, session_id: sessionId, count: newTxRows.length, total: totalBayar }, { status: 201 });
  } catch (err) {
    console.error('[transaksi/batch POST]', err);
    return Response.json({ error: 'Gagal checkout' }, { status: 500 });
  }
}
