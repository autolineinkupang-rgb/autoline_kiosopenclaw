import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import path from 'path';

const PEM_PATH = path.join(process.cwd(), '..', 'data', 'pembelian.csv');
const STOK_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');

const PEM_HEADERS = ['id','session_id','tanggal','jam','produk_id','nama_produk','qty','harga_beli','subtotal','supplier','kasir','catatan'];
const STOK_HEADERS = ['id','nama','kategori','satuan','stok','harga_beli','harga_jual','stok_minimum','stok_kritis','supplier','last_update','has_exp','exp_date'];

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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const data = readCsv(PEM_PATH);
    return Response.json({ data: data.slice(-limit), count: data.length });
  } catch {
    return Response.json({ error: 'Gagal membaca data pembelian', data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { items, supplier, kasir, catatan } = body;

    if (!items?.length) return Response.json({ error: 'Items tidak boleh kosong' }, { status: 400 });

    const stok = readCsv(STOK_PATH);
    const pemData = readCsv(PEM_PATH);

    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const jam = now.toTimeString().slice(0, 8);
    const maxId = pemData.reduce((max, r) => Math.max(max, parseInt(r.id?.replace(/\D/g, '') || '0')), 0);
    const sessionId = `BLI-${tanggal.replace(/-/g, '')}-${String(maxId + 1).padStart(4, '0')}`;

    const newRows = [];
    const stokUpdates = {};
    const errors = [];

    for (const item of items) {
      const { produk_id, qty, harga_beli } = item;
      if (!produk_id || !qty || Number(qty) <= 0) { errors.push(`Item tidak valid: ${produk_id}`); continue; }

      const idx = stok.findIndex(s => s.id === String(produk_id));
      if (idx === -1) { errors.push(`Produk ${produk_id} tidak ditemukan`); continue; }

      const produk = stok[idx];
      const qtyNum = Number(qty);
      const hargaNum = Number(harga_beli) || Number(produk.harga_beli) || 0;

      stokUpdates[produk_id] = { idx, qty: qtyNum, harga: hargaNum };

      newRows.push({
        id: `PEM-${String(maxId + newRows.length + 1).padStart(4, '0')}`,
        session_id: sessionId,
        tanggal, jam,
        produk_id: produk.id,
        nama_produk: produk.nama,
        qty: String(qtyNum),
        harga_beli: String(hargaNum),
        subtotal: String(qtyNum * hargaNum),
        supplier: String(supplier || produk.supplier || '').trim(),
        kasir: String(kasir || 'Gudang').trim(),
        catatan: String(catatan || '').trim(),
      });
    }

    if (errors.length && !newRows.length) {
      return Response.json({ error: errors.join('; ') }, { status: 400 });
    }

    // Update stok
    for (const [pid, { idx, qty, harga }] of Object.entries(stokUpdates)) {
      const s = stok[idx];
      stok[idx] = {
        ...s,
        stok: String(Number(s.stok) + qty),
        harga_beli: harga > 0 ? String(harga) : s.harga_beli,
        last_update: tanggal,
      };
    }

    writeCsvSafe(STOK_PATH, stok, STOK_HEADERS);
    writeCsvSafe(PEM_PATH, [...pemData, ...newRows], PEM_HEADERS);

    return Response.json({ ok: true, session_id: sessionId, count: newRows.length, warnings: errors }, { status: 201 });
  } catch (err) {
    console.error('[pembelian POST]', err);
    return Response.json({ error: 'Gagal menyimpan pembelian' }, { status: 500 });
  }
}
