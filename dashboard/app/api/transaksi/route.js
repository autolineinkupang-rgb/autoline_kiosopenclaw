import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

const TX_PATH = path.join(process.cwd(), '..', 'data', 'transaksi.csv');
const STOK_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');
const MAX_LIMIT = 500;

const TX_HEADERS = ['id','tanggal','jam','produk_id','nama_produk','kategori','qty','harga_satuan','total','metode_bayar','kasir','catatan'];
const STOK_HEADERS = ['id','nama','kategori','satuan','stok','harga_beli','harga_jual','stok_minimum','stok_kritis','supplier','last_update'];

function readCsv(filepath) {
  try {
    const content = readFileSync(filepath, 'utf8');
    return parse(content, { columns: true, skip_empty_lines: true });
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 100;
    const data = readCsv(TX_PATH);
    const result = data.slice(-limit);
    return Response.json({ data: result, count: result.length, ts: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Gagal membaca data transaksi', data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { produk_id, qty, metode_bayar, catatan, kasir } = body;

    if (!produk_id || !qty || Number(qty) <= 0) {
      return Response.json({ error: 'Produk dan qty wajib diisi' }, { status: 400 });
    }

    const stok = readCsv(STOK_PATH);
    const produkIdx = stok.findIndex(s => s.id === String(produk_id));
    if (produkIdx === -1) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

    const produk = stok[produkIdx];
    const stokSisa = Number(produk.stok) - Number(qty);
    if (stokSisa < 0) {
      return Response.json({ error: `Stok tidak cukup. Sisa: ${produk.stok} ${produk.satuan}` }, { status: 400 });
    }

    const txData = readCsv(TX_PATH);
    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const jam = now.toTimeString().slice(0, 8);
    const maxId = txData.reduce((max, r) => {
      const n = parseInt(r.id?.replace(/\D/g, '') || '0');
      return Math.max(max, n);
    }, 0);

    const newTx = {
      id: `TRX-${String(maxId + 1).padStart(4, '0')}`,
      tanggal, jam,
      produk_id: produk.id,
      nama_produk: produk.nama,
      kategori: produk.kategori,
      qty: String(Number(qty)),
      harga_satuan: produk.harga_jual,
      total: String(Number(qty) * Number(produk.harga_jual)),
      metode_bayar: String(metode_bayar || 'tunai'),
      kasir: String(kasir || 'Ruflo').trim(),
      catatan: String(catatan || '').trim(),
    };

    writeCsvSafe(TX_PATH, [...txData, newTx], TX_HEADERS);

    stok[produkIdx] = { ...produk, stok: String(stokSisa), last_update: tanggal };
    writeCsvSafe(STOK_PATH, stok, STOK_HEADERS);

    return Response.json({ ok: true, data: newTx, stok_sisa: stokSisa }, { status: 201 });
  } catch (err) {
    console.error('[transaksi POST]', err);
    return Response.json({ error: 'Gagal mencatat transaksi' }, { status: 500 });
  }
}
